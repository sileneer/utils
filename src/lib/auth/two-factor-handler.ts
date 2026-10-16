import { accountSession } from "./identity";
import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { recordSessionDevice } from "./session-device";
import { FACTOR_ERRORS } from "./two-factor";
import { withAuthentication } from "./lifecycle";
import { accountChangeVersion } from "../agent/active-query";

function json(data: unknown, status = 200, cookies?: Headers) {
  const headers = new Headers({ "cache-control": "no-store", vary: "Cookie" });
  for (const cookie of cookies?.getSetCookie() ?? []) headers.append("set-cookie", cookie);
  return Response.json(data, { status, headers });
}
function fail(error: string, status: number) { return json({ error }, status); }

const TOTP_CODE = /^\d{6}$/;
const RECOVERY_CODE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

/**
 * Completes a sign-in that is waiting on its second factor. There is deliberately no
 * session here: the credential step deleted the one it created, and the challenge
 * cookie names a short-lived verification row.
 */
export async function handleTwoFactor(request: Request) {
  const authorizationVersion = accountChangeVersion();
  try {
    const path = new URL(request.url).pathname.slice("/api/2fa".length);
    if (request.method !== "POST" || (path !== "/verify" && path !== "/recovery"))
      return fail("not_found", 404);
    const origin = process.env.APP_URL || "http://localhost:3000";
    if (
      request.headers.get("origin") !== origin ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return fail("invalid_origin", 403);
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return fail("bad_request", 400);
      body = JSON.parse(raw);
    } catch {
      return fail("bad_request", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_request", 400);
    // `code` is the only field that can ever reach the library, which structurally
    // excludes its `trustDevice` and `disableSession` options.
    const fields = body as Record<string, unknown>;
    if (Object.keys(fields).some((key) => key !== "code")) return fail("bad_request", 400);
    const code = typeof fields.code === "string" ? fields.code.trim() : "";
    if (!(path === "/verify" ? TOTP_CODE : RECOVERY_CODE).test(code)) return fail("bad_request", 400);

    const ip = process.env.TRUST_CLOUDFLARE_IP === "1"
      ? request.headers.get("cf-connecting-ip") || "unknown"
      : "local";
    const headers = new Headers(request.headers);
    headers.set("x-utils-client-ip", ip);
    // The plugin prefers an existing session over the challenge and applies no attempt
    // limit on that branch, so a challenge is only ever answered by someone holding none.
    if (await accountSession(headers)) return fail("signed_in", 403);
    const challenge = /two_factor=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
    if (!challenge) return fail("challenge_gone", 401);
    if (
      !consumeLimits([
        { key: `ip:${privateKey(ip)}:2fa`, max: 10, window: 60_000 },
        { key: `2fa:${privateKey(challenge)}:attempt`, max: 10, window: 60_000 },
      ])
    )
      return fail("rate_limited", 429);

    const route = path === "/verify" ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code";
    const response = await withAuthentication(authorizationVersion, () => getAuth().handler(
      new Request(origin + "/api/auth" + route, {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      }),
    ));
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { code?: unknown };
      const name = typeof payload.code === "string" ? payload.code : "";
      const mapped = FACTOR_ERRORS[name] ??
        (response.status >= 500
          ? { error: "service_unavailable", status: 503 }
          // The plugin's own three-per-ten-seconds cap on `/two-factor/` answers 429.
          // Reporting that as a wrong code would tell the user their authenticator is
          // broken when the real answer is to wait.
          : response.status === 429
            ? { error: "rate_limited", status: 429 }
            : { error: "code_failed", status: 400 });
      return fail(mapped.error, mapped.status);
    }
    recordSessionDevice(response.headers.getSetCookie(), request.headers.get("user-agent"));
    return json({ signedIn: true }, 200, response.headers);
  } catch {
    return fail("service_unavailable", 503);
  }
}
