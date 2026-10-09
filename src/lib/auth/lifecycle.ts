import { APIError } from "better-auth/api";
import { AsyncLocalStorage } from "node:async_hooks";
import { blockOwnerQueries, stopOwnerQuery } from "../agent/active-query";

type Change = { owner: string; stopped: boolean; failed: boolean };
const shared = globalThis as typeof globalThis & { utilsAccountChangeContext?: AsyncLocalStorage<Change> };
const context = (shared.utilsAccountChangeContext ??= new AsyncLocalStorage<Change>());

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
  change.stopped = true;
}
export function isPasswordChange() {
  return Boolean(context.getStore());
}
