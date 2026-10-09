import { db } from "../db";
import { accountSession } from "./identity";
import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { withAccountChange, beforePasswordWrite } from "./lifecycle";

function json(data: unknown, status = 200, cookies?: Headers) {
  const headers = new Headers({ "cache-control": "no-store", vary: "Cookie" });
  for (const cookie of cookies?.getSetCookie() ?? []) headers.append("set-cookie", cookie);
  return Response.json(data, { status, headers });
}
function fail(error: string, status: number) { return json({ error }, status); }
function browserInfo(agent: string | null | undefined) {
  const ua = agent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "unknown";
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown";
  return { browser, system };
}
export async function handleAccount(request: Request) {
  try {
    const path = new URL(request.url).pathname.slice("/api/account".length);
    const reads = ["", "/sessions"], writes = ["/profile", "/password", "/sessions/revoke"];
    if (!(request.method === "GET" ? reads : request.method === "POST" ? writes : []).includes(path)) return fail("not_found", 404);
    const headers = new Headers(request.headers);
    headers.set("x-utils-client-ip", process.env.TRUST_CLOUDFLARE_IP === "1" ? request.headers.get("cf-connecting-ip") || "unknown" : "local");
    const identity = await accountSession(headers);
    if (!identity) return request.method === "GET" && path === "" ? json({ user: null }) : fail("unauthorized", 401);
    const auth = getAuth();
    if (request.method === "GET") {
      if (path === "") return json({ user: identity.user });
      if (Date.now() - new Date(identity.session.createdAt).getTime() >= 86_400_000) return fail("reauth_required", 403);
      const sessions = await auth.api.listSessions({ headers });
      return json({ sessions: sessions.map((s) => ({
        id: s.id, current: s.id === identity.session.id,
        createdAt: new Date(s.createdAt).toISOString(), expiresAt: new Date(s.expiresAt).toISOString(),
        ...browserInfo(s.userAgent),
      })) });
    }
    const origin = process.env.APP_URL || "http://localhost:3000";
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json")) return fail("invalid_origin", 403);
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return fail("bad_request", 400);
      body = JSON.parse(raw);
    } catch { return fail("bad_request", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_request", 400);
    const allowed = path === "/profile" ? ["name"] : path === "/password" ? ["currentPassword", "newPassword"] : ["password", "id", "others"];
    if (Object.keys(body).some((key) => !allowed.includes(key))) return fail("bad_request", 400);
    if (!consumeLimits([{ key: `account:${privateKey(identity.user.id)}:${path}`, max: 10, window: 60_000 }])) return fail("rate_limited", 429);
    const call = async (route: string, payload: unknown) => {
      const response = await auth.handler(new Request(origin + "/api/auth" + route, {
        method: "POST", headers, body: JSON.stringify(payload),
      }));
      if (!response.ok) return fail(response.status === 401 ? "unauthorized" : response.status >= 500 ? "service_unavailable" : "auth_failed", response.status === 401 ? 401 : response.status >= 500 ? 503 : 400);
      // Do not forward the library's token/user output. Cookie rotation is retained.
      return json({ success: true }, 200, response.headers);
    };
    if (path === "/profile") {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) return fail("bad_request", 400);
      return await call("/update-user", { name: body.name.trim() });
    }
    if (Date.now() - new Date(identity.session.createdAt).getTime() >= 86_400_000) return fail("reauth_required", 403);
    const password = path === "/password" ? body.currentPassword : body.password;
    if (typeof password !== "string" || !password || password.length > 128) return fail("bad_request", 400);
    if (path === "/password" && (typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 128 || !/[A-Za-z]/.test(body.newPassword) || !/[0-9]/.test(body.newPassword))) return fail("bad_request", 400);
    if (path === "/sessions/revoke" && !((body.others === true && body.id === undefined) || (typeof body.id === "string" && body.id.length <= 128 && body.others === undefined))) return fail("bad_request", 400);
    if (path === "/sessions/revoke" && body.id !== undefined) {
      const owned = db().prepare("SELECT id FROM session WHERE id=? AND userId=? AND expiresAt>?").get(body.id, identity.user.id, Date.now());
      if (!owned || body.id === identity.session.id) return fail("not_found", 404);
    }
    try { await auth.api.verifyPassword({ headers, body: { password } }); }
    catch { return fail("auth_failed", 400); }
    return await withAccountChange(identity.user.id, async () => {
      const latest = await accountSession(headers);
      if (latest?.session.id !== identity.session.id) return fail("unauthorized", 401);
      if (path === "/password") return await call("/change-password", {
        currentPassword: password, newPassword: body.newPassword, revokeOtherSessions: true,
      });
      if (body.others) {
        await beforePasswordWrite();
        return await call("/revoke-other-sessions", {});
      }
      const target = db().prepare("SELECT token FROM session WHERE id=? AND userId=? AND expiresAt>?").get(body.id, identity.user.id, Date.now()) as { token: string } | undefined;
      if (!target || body.id === identity.session.id) return fail("not_found", 404);
      await beforePasswordWrite();
      return await call("/revoke-session", { token: target.token });
    }, false);
  } catch (error) {
    if (error instanceof Error && ["stop_unconfirmed", "account_busy"].includes(error.message)) return fail(error.message, 409);
    return fail("service_unavailable", 503);
  }
}
