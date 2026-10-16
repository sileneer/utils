import { APIError } from "better-auth/api";
import { AsyncLocalStorage } from "node:async_hooks";
import { authorizationIsCurrent, blockOwnerQueries, stopOwnerQuery } from "../agent/active-query";
import { db } from "../db";

type Change = { owner: string; stopped: boolean; failed: boolean };
const shared = globalThis as typeof globalThis & { utilsAccountChangeContext?: AsyncLocalStorage<Change> };
const context = (shared.utilsAccountChangeContext ??= new AsyncLocalStorage<Change>());
const issuanceShared = globalThis as typeof globalThis & { utilsSessionIssuance?: AsyncLocalStorage<number> };
const issuance = (issuanceShared.utilsSessionIssuance ??= new AsyncLocalStorage<number>());

/** A login proves credentials against the account state at request entry. */
export function withAuthentication<T>(version: number, action: () => Promise<T>) {
  return issuance.run(version, action);
}
export function sessionIssuanceIsCurrent(owner: string) {
  const version = issuance.getStore();
  return version === undefined || authorizationIsCurrent(owner, version);
}
export function assertSessionIssuance(owner: string) {
  if (!sessionIssuanceIsCurrent(owner))
    throw new APIError("UNAUTHORIZED", { message: "Authentication changed; sign in again" });
}

/** One account-wide fence spans cancellation, credential mutation and revocation. */
export async function withAccountChange<T>(
  owner: string,
  action: () => Promise<T>,
  stopImmediately = true,
) {
  const release = blockOwnerQueries(owner);
  const change: Change = { owner, stopped: false, failed: false };
  try {
    return await context.run(change, async () => {
      if (stopImmediately) await beforePasswordWrite();
      const result = await action();
      // Auth libraries may convert a hook exception into an HTTP response.
      if (change.failed) throw new APIError("CONFLICT", { message: "stop_unconfirmed" });
      return result;
    });
  } finally {
    release();
  }
}

/** Called only after the library has verified a reset OTP/current password. */
export async function beforePasswordWrite() {
  const change = context.getStore();
  if (!change) throw new Error("uncoordinated_password_change");
  if (change.stopped) return;
  if (!(await stopOwnerQuery(change.owner))) {
    change.failed = true;
    throw new APIError("CONFLICT", { message: "stop_unconfirmed" });
  }
  // A pending second-factor challenge is also a password proof. Revoking sessions
  // alone must not let that proof mint a new login after the credential changes.
  db().prepare(`DELETE FROM verification WHERE
    identifier IN (SELECT '2fa-attempts-' || identifier FROM verification WHERE value=? AND identifier GLOB '2fa-*')
    OR (value=? AND identifier GLOB '2fa-*')`).run(change.owner, change.owner);
  change.stopped = true;
}
export function isPasswordChange() {
  return Boolean(context.getStore());
}
