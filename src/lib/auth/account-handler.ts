import { db } from "../db";
import { accountSession } from "./identity";
import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { withAccountChange, beforePasswordWrite } from "./lifecycle";
import { isLanguage, isTheme, readPreferences, writePreferences } from "./preferences";
import { buildExport, exportSummary, parseScope } from "./export";
import { verifyChallenge } from "./turnstile";
import { readSecurityEvents, recordSecurityEvent, RETENTION_DAYS } from "./security-events";
import { proveFactor, revokeAllSessions, translateFactorError, twoFactorStatus } from "./two-factor";
import { handlePasskeyManagement, passkeyListResponse } from "./passkey-handler";
import { deletionView, markExportDelivered } from "./deletion";
import { handleDeletion } from "./deletion-handler";
import {
  applyEmailChange,
  cancelEmailChange,
  commitEmailChange,
  notifyOldEmail,
  pendingEmailChange,
  resendEmailChange,
  startEmailChange,
  type Side,
} from "./email-change";
import { availability } from "../agent/usage";

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
/** The acting session's own inferred device labels. Only the two derived values are
 * ever returned to the caller; the raw User-Agent stays in the session row. */
function actingDevice(identity: Identity) {
  const row = db().prepare("SELECT userAgent FROM session WHERE id=? AND userId=?")
    .get(identity.session.id, identity.user.id) as { userAgent: string | null } | undefined;
  return browserInfo(row?.userAgent);
}
/**
 * The security change is already durable by the time this runs, so a failed record is
 * swallowed rather than reported: telling the user their password change failed would
 * invite a retry that can no longer succeed.
 */
function safeRecord(event: Parameters<typeof recordSecurityEvent>[0]) {
  try {
    recordSecurityEvent(event);
  } catch {
    /* The event is best-effort after a confirmed change, never a reason to deny one. */
  }
}
type Identity = NonNullable<Awaited<ReturnType<typeof accountSession>>>;
type Auth = ReturnType<typeof getAuth>;

/** Internal failure names are part of the wrapper's own vocabulary, never the library's. */
const EMAIL_STATUS: Record<string, number> = {
  bad_request: 400,
  auth_failed: 400,
  challenge_failed: 403,
  unauthorized: 401,
  not_found: 404,
  password_wrong: 400,
  code_failed: 400,
  stale_target: 409,
  already_completed: 409,
  email_taken: 409,
  email_same: 400,
  attempts_exhausted: 409,
  expired: 410,
  rate_limited: 429,
  mail_send_failed: 503,
  service_unavailable: 503,
  stop_unconfirmed: 409,
  account_busy: 409,
};
async function attempt(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    const name = error instanceof Error ? error.message : "";
    return fail(name in EMAIL_STATUS ? name : "service_unavailable", EMAIL_STATUS[name] ?? 503);
  }
}
async function handleEmailChange(
  path: string,
  headers: Headers,
  auth: Auth,
  identity: Identity,
  ip: string,
  origin: string,
  body: Record<string, unknown>,
) {
  const userId = identity.user.id,
    oldEmail = identity.user.email;
  const id = typeof body.id === "string" && body.id.length <= 64 ? body.id : "";
  const code = (value: unknown) => (typeof value === "string" && /^\d{6}$/.test(value) ? value : "");
  if (!consumeLimits([{ key: `ip:${privateKey(ip)}:change-email`, max: 10, window: 60_000 }]))
    return fail("rate_limited", 429);
  if (path === "/email/start" || path === "/email/resend") {
    const challenge = await verifyChallenge(body.turnstileToken, ip, origin);
    if (challenge === "unconfigured" || challenge === "unreachable") return fail("service_unavailable", 503);
    if (challenge !== "ok") return fail("challenge_failed", 403);
  }
  if (path === "/email/start") {
    const password = typeof body.password === "string" ? body.password : "";
    const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    if (!password || password.length > 128) return fail("bad_request", 400);
    if (!newEmail || newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
      return fail("bad_request", 400);
    try {
      await auth.api.verifyPassword({ headers, body: { password } });
    } catch {
      return fail("password_wrong", 400);
    }
    if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
    return attempt(async () => {
      await startEmailChange(userId, oldEmail, newEmail);
      // Identical answer whether or not the target is already someone's account, so
      // starting a change can never be used to enumerate registrations.
      return json({ sent: true });
    });
  }
  if (path === "/email/resend") {
    const side = body.side === "old" || body.side === "new" ? body.side : "";
    if (!id || !side) return fail("bad_request", 400);
    return attempt(async () => {
      await resendEmailChange(userId, id, oldEmail, side as Side);
      return json({ sent: true });
    });
  }
  if (path === "/email/cancel") {
    if (!id) return fail("bad_request", 400);
    return attempt(async () => json(cancelEmailChange(userId, id, oldEmail)));
  }
  if (!id) return fail("bad_request", 400);
  const codes = { old: code(body.oldCode), new: code(body.newCode) };
  if (!codes.old || !codes.new) return fail("bad_request", 400);
  if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
  return attempt(async () => {
    const result = await commitEmailChange(userId, id, oldEmail, codes, async (newEmail) => {
      applyEmailChange(userId, newEmail, actingDevice(identity));
    });
    // The address is already committed here, so a notice failure is reported as its
    // own fact and must never recast the change as incomplete or retry itself.
    let notified = true;
    try {
      await notifyOldEmail(oldEmail);
    } catch {
      notified = false;
    }
    return json({ changed: true, signedOut: true, changedTo: result.changedTo, notified });
  });
}
async function factorAttempt(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && error.message === "bad_request") return fail("bad_request", 400);
    const mapped = translateFactorError(error);
    return fail(mapped.error, mapped.status);
  }
}
/**
 * Enrolment, confirmation, disable and recovery-code regeneration. Every write here
 * needs a current identity, a login inside 24 hours and the current password, and
 * everything after enrolment also needs the second factor itself — a stolen password
 * plus a stolen cookie must not be able to switch the factor off.
 */
async function handleTwoFactorManagement(
  path: string,
  headers: Headers,
  auth: Auth,
  identity: Identity,
  ip: string,
  body: Record<string, unknown>,
) {
  const userId = identity.user.id;
  const cookie = headers.get("cookie") ?? "";
  if (!consumeLimits([{ key: `ip:${privateKey(ip)}:2fa-manage`, max: 10, window: 60_000 }]))
    return fail("rate_limited", 429);
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const status = await twoFactorStatus(userId);
  const confirmIdentity = async () => {
    try {
      await auth.api.verifyPassword({ headers, body: { password } });
    } catch {
      return fail("password_wrong", 400);
    }
    if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
    return null;
  };

  if (path === "/2fa/enable") {
    if (!password || password.length > 128) return fail("bad_request", 400);
    if (status.enabled) return fail("already_enabled", 409);
    const refused = await confirmIdentity();
    if (refused) return refused;
    return factorAttempt(async () => {
      // Re-running this over a pending enrolment replaces the unconfirmed secret, so an
      // abandoned step is recoverable without ever weakening the account: nothing is
      // enabled until a code from the new device is proven.
      const issued = await auth.api.enableTwoFactor({ headers, body: { password, method: "totp" } }) as
        { totpURI?: string; backupCodes?: string[] };
      // The provisioning URI and the plaintext codes exist in this response and nowhere
      // else: they are never logged, never re-read, never stored by the client.
      return json({ totpURI: issued.totpURI ?? "", backupCodes: issued.backupCodes ?? [] });
    });
  }

  if (path === "/2fa/confirm") {
    if (!code) return fail("bad_request", 400);
    if (status.enabled) return fail("already_enabled", 409);
    if (!status.pending) return fail("not_enabled", 409);
    return factorAttempt(async () => {
      let affected = 0;
      await withAccountChange(userId, async () => {
        await beforePasswordWrite();
        await proveFactor(cookie, code);
        // Every session goes, including this one, so no login that never faced a
        // challenge survives the moment the factor turns on.
        affected = revokeAllSessions(userId);
      }, false);
      safeRecord({ userId, kind: "two_factor_enable", ...actingDevice(identity) });
      return json({ enabled: true, signedOut: true, sessionsAffected: affected });
    });
  }

  if (!password || password.length > 128 || !code) return fail("bad_request", 400);
  if (!status.enabled) return fail("not_enabled", 409);
  const refused = await confirmIdentity();
  if (refused) return refused;

  if (path === "/2fa/disable") {
    return factorAttempt(async () => {
      let affected = 0;
      await withAccountChange(userId, async () => {
        await beforePasswordWrite();
        await proveFactor(cookie, code);
        await auth.api.disableTwoFactor({ headers, body: { password } });
        affected = revokeAllSessions(userId);
      }, false);
      safeRecord({ userId, kind: "two_factor_disable", ...actingDevice(identity) });
      return json({ disabled: true, signedOut: true, sessionsAffected: affected });
    });
  }

  return factorAttempt(async () => {
    let issued: { backupCodes?: string[] } | undefined;
    await withAccountChange(userId, async () => {
      await beforePasswordWrite();
      // Proving the factor with a recovery code spends it, and the set that replaces
      // it invalidates every code issued before — including any the user never saved.
      await proveFactor(cookie, code);
      issued = await auth.api.generateBackupCodes({ headers, body: { password } }) as
        { backupCodes?: string[] };
    }, false);
    safeRecord({ userId, kind: "two_factor_recovery_codes_regenerated", ...actingDevice(identity) });
    return json({ backupCodes: issued?.backupCodes ?? [] });
  });
}
export async function handleAccount(request: Request) {
  try {
    const path = new URL(request.url).pathname.slice("/api/account".length);
    const reads = ["", "/sessions", "/preferences", "/usage", "/export", "/export/summary", "/email", "/activity", "/2fa", "/passkeys", "/deletion"],
      writes = ["/profile", "/password", "/sessions/revoke", "/preferences", "/email/start", "/email/resend", "/email/verify", "/email/cancel",
        "/2fa/enable", "/2fa/confirm", "/2fa/disable", "/2fa/recovery-codes",
        "/passkeys/register/start", "/passkeys/register/finish", "/passkeys/rename", "/passkeys/remove",
        "/deletion/request", "/deletion/withdraw", "/deletion/complete"];
    if (!(request.method === "GET" ? reads : request.method === "POST" ? writes : []).includes(path)) return fail("not_found", 404);
    const ip = process.env.TRUST_CLOUDFLARE_IP === "1" ? request.headers.get("cf-connecting-ip") || "unknown" : "local";
    const headers = new Headers(request.headers);
    headers.set("x-utils-client-ip", ip);
    const identity = await accountSession(headers);
    if (!identity) return request.method === "GET" && path === "" ? json({ user: null }) : fail("unauthorized", 401);
    const auth = getAuth();
    if (request.method === "GET") {
      if (path === "") return json({ user: identity.user });
      // Presentation and personal counts are not security data: a long-lived
      // login may still choose its theme and see its own usage.
      if (path === "/preferences") return json({ preferences: readPreferences(identity.user.id) });
      if (path === "/usage") return json({ usage: availability(identity.user.id) });
      // "Is my second factor on" is not itself a security mutation, so it stays
      // readable without the freshness gate; every write on the path has it.
      if (path === "/2fa") return json({ twoFactor: await twoFactorStatus(identity.user.id) });
      if (Date.now() - new Date(identity.session.createdAt).getTime() >= 86_400_000) return fail("reauth_required", 403);
      // Reading a whole history is a sensitive read, so it shares session
      // listing's freshAge gate and re-checks the login after assembly.
      if (path === "/export" || path === "/export/summary") {
        const query = parseScope(new URL(request.url).searchParams);
        if ("error" in query) return fail(query.error, query.error === "not_found" ? 404 : 400);
        const readBoundary = new Date().toISOString();
        if (path === "/export/summary")
          return json({ summary: exportSummary(identity.user.id, query.scope) });
        const outcome = buildExport(identity.user, query.format, query.scope, readBoundary);
        if ("error" in outcome) {
          if (outcome.error === "too_large")
            return json({ error: "too_large", summary: outcome.summary }, 413);
          return fail(outcome.error, 404);
        }
        // The login that authorized this read must still be the current one, so a
        // revocation or account switch mid-assembly cannot emit the old data.
        if ((await accountSession(headers))?.session.id !== identity.session.id)
          return fail("unauthorized", 401);
        // A whole-account export is what unlocks the final deletion step, so generating one
        // stamps the open request. The server cannot know whether the file was kept, which is
        // why the precondition is worded as "generated", never as "you have your copy".
        markExportDelivered(identity.user.id, query.scope);
        return new Response(outcome.result.body, {
          headers: {
            "cache-control": "no-store",
            vary: "Cookie",
            "content-type": outcome.result.contentType,
            "content-disposition": `attachment; filename="${outcome.result.filename}"`,
          },
        });
      }
      // An in-flight email change is security state, so it shares the freshAge gate and
      // is described only by mask: the row never echoes a stored digest.
      if (path === "/email")
        return json({ pending: pendingEmailChange(identity.user.id, identity.user.email) });
      // Confirmed security changes are security data too, so this read is gated the
      // same way and is scoped to the caller in SQL rather than by any parameter.
      if (path === "/activity")
        return json({ events: readSecurityEvents(identity.user.id), retentionDays: RETENTION_DAYS });
      // Which credentials can open this account is security state, so the passkey list
      // shares the sessions/activity gate and is projected: no key, credential id or
      // AAGUID crosses the wire.
      if (path === "/passkeys") return json(passkeyListResponse(identity.user.id));
      // Whether an account is waiting to be deleted is its own security state, so it sits
      // behind the same freshness gate as the sessions, activity and passkey lists.
      if (path === "/deletion") return json({ deletion: deletionView(identity.user.id) });
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
      // A WebAuthn registration carries an attestation object whose size depends on the
      // authenticator's chosen format, so that one route gets a larger cap; every other
      // write stays bounded by the same 4 KiB as the rest of the site.
      if (raw.length > (path === "/passkeys/register/finish" ? 16_384 : 4096)) return fail("bad_request", 400);
      body = JSON.parse(raw);
    } catch { return fail("bad_request", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_request", 400);
    const fields: Record<string, string[]> = {
      "/profile": ["name"],
      "/password": ["currentPassword", "newPassword"],
      "/preferences": ["theme", "language"],
      "/sessions/revoke": ["password", "id", "others"],
      "/email/start": ["password", "newEmail", "turnstileToken"],
      "/email/resend": ["id", "side", "turnstileToken"],
      "/email/verify": ["id", "oldCode", "newCode"],
      "/email/cancel": ["id"],
      "/2fa/enable": ["password"],
      "/2fa/confirm": ["code"],
      "/2fa/disable": ["password", "code"],
      "/2fa/recovery-codes": ["password", "code"],
      "/passkeys/register/start": ["password", "code", "name"],
      "/passkeys/register/finish": ["response", "name"],
      "/passkeys/rename": ["password", "id", "name"],
      "/passkeys/remove": ["password", "code", "id"],
      "/deletion/request": ["password", "code"],
      "/deletion/withdraw": ["password", "code"],
      "/deletion/complete": ["password", "code", "confirm", "skipExport"],
    };
    const allowed = fields[path];
    if (!allowed || Object.keys(body).some((key) => !allowed.includes(key))) return fail("bad_request", 400);
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
    if (path === "/preferences") {
      // Presentation settings only: no password, no freshness gate and no
      // account-wide stop, but an explicit null still has to be a real key.
      if (!Object.keys(body).length) return fail("bad_request", 400);
      const patch: { theme?: "system" | "light" | "dark" | null; language?: "en" | "zh" | null } = {};
      if ("theme" in body) {
        if (body.theme !== null && !isTheme(body.theme)) return fail("bad_request", 400);
        patch.theme = body.theme;
      }
      if ("language" in body) {
        if (body.language !== null && !isLanguage(body.language)) return fail("bad_request", 400);
        patch.language = body.language;
      }
      return json({ preferences: writePreferences(identity.user.id, patch) });
    }
    if (Date.now() - new Date(identity.session.createdAt).getTime() >= 86_400_000) return fail("reauth_required", 403);
    if (path.startsWith("/email/"))
      return await handleEmailChange(path, headers, auth, identity, ip, origin, body);
    if (path.startsWith("/2fa/"))
      return await handleTwoFactorManagement(path, headers, auth, identity, ip, body);
    if (path.startsWith("/passkeys/")) {
      const result = await handlePasskeyManagement(path, headers, auth, identity, ip, body);
      // One confirmed ceremony or deletion, one event. A refused or failed ceremony
      // reaches here as an error response and records nothing, and a rename is not a
      // change in access so it is not recorded either.
      if (result.ok && path === "/passkeys/register/finish")
        safeRecord({ userId: identity.user.id, kind: "passkey_register", ...actingDevice(identity) });
      if (result.ok && path === "/passkeys/remove")
        safeRecord({ userId: identity.user.id, kind: "passkey_remove", ...actingDevice(identity) });
      return result;
    }
    if (path.startsWith("/deletion/"))
      return await handleDeletion(path, headers, auth, identity, ip, body);
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
      const device = actingDevice(identity);
      if (path === "/password") {
        const response = await call("/change-password", {
          currentPassword: password, newPassword: body.newPassword, revokeOtherSessions: true,
        });
        // One operation, one event: the other sessions going with it is part of a
        // password change's stated effect, not a second recorded revocation.
        if (response.ok) safeRecord({ userId: identity.user.id, kind: "password_change", ...device });
        return response;
      }
      if (body.others) {
        await beforePasswordWrite();
        const affected = (db().prepare(
          "SELECT count(*) n FROM session WHERE userId=? AND id<>? AND expiresAt>?",
        ).get(identity.user.id, identity.session.id, Date.now()) as { n: number }).n;
        const response = await call("/revoke-other-sessions", {});
        // Counted before the call and skipped at zero, so a repeated click cannot
        // manufacture an event for a revocation that changed nothing.
        if (response.ok && affected > 0)
          safeRecord({ userId: identity.user.id, kind: "session_revoke_others", sessionsAffected: affected, ...device });
        return response;
      }
      const target = db().prepare("SELECT token FROM session WHERE id=? AND userId=? AND expiresAt>?").get(body.id, identity.user.id, Date.now()) as { token: string } | undefined;
      if (!target || body.id === identity.session.id) return fail("not_found", 404);
      await beforePasswordWrite();
      const response = await call("/revoke-session", { token: target.token });
      if (response.ok)
        safeRecord({ userId: identity.user.id, kind: "session_revoke_one", sessionsAffected: 1, ...device });
      return response;
    }, false);
  } catch (error) {
    if (error instanceof Error && ["stop_unconfirmed", "account_busy"].includes(error.message)) return fail(error.message, 409);
    return fail("service_unavailable", 503);
  }
}
