import { db } from "../db";
import { accountSession } from "./identity";
import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { recordSessionDevice } from "./session-device";
import { withAuthentication } from "./lifecycle";
import { accountChangeVersion } from "../agent/active-query";
import { proveFactor, translateFactorError, twoFactorStatus } from "./two-factor";
import {
  credentialIdOf,
  listPasskeys,
  MAX_PASSKEYS,
  normalizePasskeyName,
  PASSKEY_ERRORS,
  passkeyCount,
  type PasskeyView,
} from "./passkey";

type Auth = ReturnType<typeof getAuth>;
type Identity = NonNullable<Awaited<ReturnType<typeof accountSession>>>;

const origin = () => process.env.APP_URL || "http://localhost:3000";
function json(data: unknown, status = 200, cookies?: Headers) {
  const headers = new Headers({ "cache-control": "no-store", vary: "Cookie" });
  for (const cookie of cookies?.getSetCookie() ?? []) headers.append("set-cookie", cookie);
  return Response.json(data, { status, headers });
}
function fail(error: string, status: number) { return json({ error }, status); }

/**
 * Calls a library passkey route through the internal handler rather than `auth.api.*`.
 *
 * The ceremony state lives in a signed cookie that only the handler response carries, so
 * the API surface would issue a challenge the caller could never answer. The origin is
 * overwritten with the configured value because the plugin would otherwise read the
 * caller's own `Origin` header as the expected one.
 */
async function library(auth: Auth, headers: Headers, route: string, body?: unknown) {
  const forwarded = new Headers(headers);
  forwarded.set("origin", origin());
  if (body !== undefined) forwarded.set("content-type", "application/json");
  return auth.handler(new Request(origin() + "/api/auth" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: forwarded,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}

/** A failed ceremony is reported in the wrapper's vocabulary, never the library's. */
async function refuse(response: Response) {
  const payload = await response.json().catch(() => ({})) as { code?: unknown };
  const name = typeof payload.code === "string" ? payload.code : "";
  const mapped = PASSKEY_ERRORS[name] ??
    (response.status >= 500
      ? { error: "service_unavailable", status: 503 }
      // The shared rate limiter answers 429 without a passkey code of its own.
      : response.status === 429
        ? { error: "rate_limited", status: 429 }
        : { error: "assertion_failed", status: 401 });
  return fail(mapped.error, mapped.status);
}

/**
 * Shape check only — the signature is the library's job. A credential object is a
 * registration or an assertion by which field it carries, and anything else is refused
 * before it reaches the verifier.
 */
function credentialOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  const inner = outer.response;
  if (!inner || typeof inner !== "object") return null;
  const fields = inner as Record<string, unknown>;
  const text = (item: unknown) => typeof item === "string" && item.length > 0 && item.length <= 8192;
  if (!text(outer.id) || outer.type !== "public-key" || !text(fields.clientDataJSON)) return null;
  if (text(fields.attestationObject)) return { kind: "registration" as const, value };
  if (text(fields.authenticatorData) && text(fields.signature)) return { kind: "assertion" as const, value };
  return null;
}

/**
 * The account's own passkeys, and the two-step registration. Every write needs a current
 * verified identity, a login inside 24 hours and the current password; when two-factor is
 * on, adding or removing a credential also needs the live factor, because a passkey is a
 * way in and a stolen cookie plus a stolen password must not be able to quietly add
 * another one.
 */
export async function handlePasskeyManagement(
  path: string,
  headers: Headers,
  auth: Auth,
  identity: Identity,
  ip: string,
  body: Record<string, unknown>,
) {
  const userId = identity.user.id;
  if (!consumeLimits([{ key: `ip:${privateKey(ip)}:passkey-manage`, max: 10, window: 60_000 }]))
    return fail("rate_limited", 429);
  const password = typeof body.password === "string" ? body.password : "";
  const name = normalizePasskeyName(body.name);
  if (name === null) return fail("bad_request", 400);
  const id = typeof body.id === "string" && body.id.length <= 128 ? body.id : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  // The second half of a registration carries no credential of its own: it is bound to
  // the challenge the password-confirmed first half issued, and the library re-checks
  // the fresh session on the way through.
  const ceremony = path === "/passkeys/register/finish";
  if (!ceremony && (!password || password.length > 128)) return fail("bad_request", 400);
  const factorNeeded = !ceremony && path !== "/passkeys/rename" && (await twoFactorStatus(userId)).enabled;
  if (path === "/passkeys/remove" && !id) return fail("bad_request", 400);
  if (path === "/passkeys/rename" && (!id || name === undefined)) return fail("bad_request", 400);

  if (!ceremony) {
    try {
      await auth.api.verifyPassword({ headers, body: { password } });
    } catch {
      return fail("password_wrong", 400);
    }
    if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
    if (factorNeeded) {
      if (!code) return fail("bad_request", 400);
      try {
        await proveFactor(headers.get("cookie") ?? "", code);
      } catch (error) {
        const mapped = translateFactorError(error);
        return fail(mapped.error, mapped.status);
      }
    }
  }

  if (path === "/passkeys/register/start") {
    if (passkeyCount(userId) >= MAX_PASSKEYS) return fail("limit_reached", 409);
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const response = await library(auth, headers, "/passkey/generate-register-options" + query);
    if (!response.ok) return refuse(response);
    // The browser needs these values exactly. They name this site's RP id and a
    // throwaway credential handle, never the account id.
    return json(await response.json(), 200, response.headers);
  }

  if (path === "/passkeys/register/finish") {
    const credential = credentialOf(body.response);
    if (!credential || credential.kind !== "registration") return fail("bad_request", 400);
    const credentialId = credentialIdOf(body.response);
    if (!credentialId) return fail("bad_request", 400);
    // The plugin only *asks* the browser to leave existing credentials out; the unique
    // index is the guarantee, and this turns its collision into a named answer instead
    // of a 500 from deep inside the verifier.
    if (db().prepare("SELECT id FROM passkey WHERE credentialID=?").get(credentialId))
      return fail("already_registered", 409);
    if (passkeyCount(userId) >= MAX_PASSKEYS) return fail("limit_reached", 409);
    const response = await library(auth, headers, "/passkey/verify-registration", {
      response: credential.value,
      ...(name === undefined ? {} : { name }),
    });
    if (!response.ok) return refuse(response);
    const created = await response.json() as { id?: string; name?: string | null };
    // Only the caller's own row is echoed back, and without its key or credential id.
    return json({ registered: true, passkey: { id: created.id ?? "", name: created.name ?? "" } }, 200, response.headers);
  }

  if (path === "/passkeys/rename") {
    const changed = db().prepare("UPDATE passkey SET name=? WHERE id=? AND userId=?").run(name ?? "", id, userId).changes;
    if (!changed) return fail("not_found", 404);
    return json({ passkeys: listPasskeys(userId) });
  }

  const removed = db().prepare("DELETE FROM passkey WHERE id=? AND userId=?").run(id, userId).changes;
  if (!removed) return fail("not_found", 404);
  return json({ removed: true, passkeys: listPasskeys(userId) });
}

/** The list, projected. Nothing here identifies a credential to anyone but the server. */
export function passkeyListResponse(userId: string): { passkeys: PasskeyView[] } {
  return { passkeys: listPasskeys(userId) };
}

/**
 * Passkey sign-in, for a browser with no session. The options step is what mints the
 * one-time challenge, so it is limited too: an unbounded caller could otherwise fill the
 * verification table without ever answering.
 */
export async function handlePasskeyAuth(request: Request) {
  const authorizationVersion = accountChangeVersion();
  try {
    const path = new URL(request.url).pathname.slice("/api/passkey".length);
    const ip = process.env.TRUST_CLOUDFLARE_IP === "1"
      ? request.headers.get("cf-connecting-ip") || "unknown"
      : "local";
    const headers = new Headers(request.headers);
    headers.set("x-utils-client-ip", ip);
    const challenge = /better-auth-passkey=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? "";
    if (!consumeLimits([
      { key: `ip:${privateKey(ip)}:passkey`, max: 10, window: 60_000 },
      ...(challenge ? [{ key: `passkey:${privateKey(challenge)}:attempt`, max: 10, window: 60_000 }] : []),
    ])) return fail("rate_limited", 429);
    const auth = getAuth();

    if (path === "/options" && request.method === "GET") {
      const response = await library(auth, headers, "/passkey/generate-authenticate-options");
      if (!response.ok) return refuse(response);
      return json(await response.json(), 200, response.headers);
    }
    if (path !== "/verify" || request.method !== "POST") return fail("not_found", 404);
    if (request.headers.get("origin") !== origin() || !request.headers.get("content-type")?.startsWith("application/json"))
      return fail("invalid_origin", 403);
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 16_384) return fail("bad_request", 400);
      body = JSON.parse(raw);
    } catch {
      return fail("bad_request", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_request", 400);
    const fields = body as Record<string, unknown>;
    // `response` is the only field that can reach the library, which keeps every other
    // option the endpoints accept out of reach.
    if (Object.keys(fields).some((key) => key !== "response")) return fail("bad_request", 400);
    const credential = credentialOf(fields.response);
    if (!credential || credential.kind !== "assertion") return fail("bad_request", 400);
    // A passkey replaces the account in this browser rather than adding a second one:
    // answering while signed in would silently swap who the window belongs to.
    if (await accountSession(headers)) return fail("signed_in", 403);
    if (!challenge) return fail("challenge_gone", 401);

    const response = await withAuthentication(authorizationVersion, () =>
      library(auth, headers, "/passkey/verify-authentication", { response: credential.value }));
    if (!response.ok) return refuse(response);
    recordSessionDevice(response.headers.getSetCookie(), request.headers.get("user-agent"));
    return json({ signedIn: true }, 200, response.headers);
  } catch {
    return fail("service_unavailable", 503);
  }
}
