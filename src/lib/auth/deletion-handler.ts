import { db } from "../db";
import { accountSession } from "./identity";
import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { beforePasswordWrite, withAccountChange } from "./lifecycle";
import { proveFactor, translateFactorError, twoFactorStatus } from "./two-factor";
import { deleteAccount, deletionView, lastAdministratorStanding, requestDeletion, withdrawDeletion } from "./deletion";

type Auth = ReturnType<typeof getAuth>;
type Identity = NonNullable<Awaited<ReturnType<typeof accountSession>>>;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", vary: "Cookie" },
  });
}
function fail(error: string, status: number) { return json({ error }, status); }

/**
 * The three deletion writes (ARCHITECTURE §5 "Account deletion", DESIGN §5.17).
 *
 * All of them need the current password and, when the account has one, a live second
 * factor — a request that can end in an irreversible removal is a security mutation by any
 * reading of this site's rules, and it is the same proof the password change already asks
 * for. The target is always the caller's own identity: no path, id or body field can name
 * another account, and the login that authorized the call is re-checked after the fence.
 *
 * Requesting and withdrawing take the account fence but leave an active answer alone,
 * because neither touches any data. Only the final step stops it, and stops for good: an
 * answer whose cancellation cannot be confirmed returns `stop_unconfirmed` and deletes
 * nothing, rather than reporting a deletion it is not sure happened.
 */
export async function handleDeletion(
  path: string,
  headers: Headers,
  auth: Auth,
  identity: Identity,
  ip: string,
  body: Record<string, unknown>,
) {
  const userId = identity.user.id;
  if (!consumeLimits([{ key: `ip:${privateKey(ip)}:deletion`, max: 10, window: 60_000 }]))
    return fail("rate_limited", 429);
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 128) return fail("bad_request", 400);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  // The typed confirmation is compared against the server's own record of the address, so
  // its only job here is to stay a bounded piece of text.
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
  if (path === "/deletion/complete" && (confirm.length < 3 || confirm.length > 320))
    return fail("bad_request", 400);
  if ("skipExport" in body && typeof body.skipExport !== "boolean") return fail("bad_request", 400);

  const factor = await twoFactorStatus(userId);
  if (factor.enabled && !code) return fail("bad_request", 400);
  try {
    await auth.api.verifyPassword({ headers, body: { password } });
  } catch {
    return fail("password_wrong", 400);
  }
  if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
  if (factor.enabled) {
    try {
      await proveFactor(headers.get("cookie") ?? "", code);
    } catch (error) {
      const mapped = translateFactorError(error);
      return fail(mapped.error, mapped.status);
    }
  }

  const state = deletionView(userId);

  if (path === "/deletion/request") {
    // Failing here rather than at the final step is the kindness that costs nothing: the
    // person learns immediately that this account is the one holding the site open.
    if (lastAdministratorStanding(userId)) return fail("last_admin", 409);
    if (state.status === "pending") return fail("already_requested", 409);
    const outcome = requestDeletion(db(), userId);
    if (outcome.error) return fail(outcome.error, 409);
    return json({ deletion: deletionView(userId) });
  }

  if (path === "/deletion/withdraw") {
    if (state.status !== "pending") return fail("not_requested", 409);
    withdrawDeletion(db(), userId);
    // Nothing was ever touched during the cooling-off period, so withdrawal restores a
    // state rather than repairing damage — and there is deliberately no event recorded for
    // either half of that, because a reversible request is not a change of access.
    return json({ withdrawn: true, deletion: { status: "none" } });
  }

  if (state.status !== "pending") return fail("not_requested", 409);
  if (!state.eligible) return fail("cooling_off", 409);
  if (!state.exportedAt && body.skipExport !== true) return fail("export_required", 409);
  if (confirm.toLowerCase() !== identity.user.email.trim().toLowerCase()) return fail("confirm_mismatch", 400);
  if (lastAdministratorStanding(userId)) return fail("last_admin", 409);

  return await withAccountChange(userId, async () => {
    await beforePasswordWrite();
    // The identity has to still be this one after the stop, which can take seconds: a
    // revocation, a logout or an account switch during that window must not be able to
    // carry the confirmation over to whatever the browser is looking at now.
    if ((await accountSession(headers))?.session.id !== identity.session.id) return fail("unauthorized", 401);
    const again = deletionView(userId);
    if (again.status !== "pending" || !again.eligible) return fail("not_requested", 409);
    if (!again.exportedAt && body.skipExport !== true) return fail("export_required", 409);
    const result = deleteAccount(userId);
    if (!result.deleted && "error" in result) return fail(result.error, 409);
    if (!result.deleted) return fail("not_found", 404);
    // The caller's own login went with the account, so the client has nothing left to read;
    // `outstanding` is only ever a count of files the next start will finish removing.
    return json({ deleted: true, outstanding: result.outstanding.length });
  }, false);
}
