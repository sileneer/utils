import { db } from "../db";
import { getAuth } from "./server";

export type TwoFactorStatus = {
  enabled: boolean;
  /** A secret was issued but no authenticator code has proven it yet. */
  pending: boolean;
  codesRemaining: number;
};

const headersOf = (cookie: string) => new Headers({ cookie });

/**
 * The plugin's own failure names, translated once so every two-factor surface —
 * the sign-in challenge and the management writes — answers in the same vocabulary
 * and a client never sees a raw library response.
 */
export const FACTOR_ERRORS: Record<string, { error: string; status: number }> = {
  INVALID_TWO_FACTOR_COOKIE: { error: "challenge_gone", status: 401 },
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: { error: "attempts_exhausted", status: 409 },
  ACCOUNT_TEMPORARILY_LOCKED: { error: "locked", status: 429 },
  INVALID_CODE: { error: "code_failed", status: 400 },
  INVALID_BACKUP_CODE: { error: "recovery_failed", status: 400 },
  TOTP_NOT_ENABLED: { error: "not_enabled", status: 409 },
  TOTP_ALREADY_ENABLED: { error: "already_enabled", status: 409 },
  BACKUP_CODES_NOT_ENABLED: { error: "not_enabled", status: 409 },
  TWO_FACTOR_NOT_ENABLED: { error: "not_enabled", status: 409 },
  INVALID_PASSWORD: { error: "password_wrong", status: 400 },
};

/** Turns a thrown library error into the wrapper's answer, failing closed on unknowns. */
export function translateFactorError(error: unknown): { error: string; status: number } {
  const source = error as { body?: { code?: unknown }; code?: unknown; status?: unknown; message?: unknown };
  const name = String(source?.body?.code ?? source?.code ?? "");
  if (FACTOR_ERRORS[name]) return FACTOR_ERRORS[name];
  const status = Number(source?.status ?? 0);
  if (status >= 500) return { error: "service_unavailable", status: 503 };
  // The plugin caps its own routes at three requests per ten seconds. That is a
  // different fact from "the code was wrong" and must not be reported as one, or the
  // attempt budget reads as an endless stream of bad codes.
  if (status === 429) return { error: "rate_limited", status: 429 };
  // A name the plugin does not use is still a refused factor, never a crash to hide.
  if (status > 0) return { error: "code_failed", status: 400 };
  throw error;
}

/**
 * Status only. Nothing here returns a secret, a provisioning URI or a recovery code:
 * those exist solely in the one response that issued them and are never read back.
 */
export async function twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const database = db();
  const user = database.prepare("SELECT twoFactorEnabled FROM user WHERE id=?").get(userId) as
    { twoFactorEnabled: number | null } | undefined;
  const factor = database.prepare("SELECT verified FROM twoFactor WHERE userId=?").get(userId) as
    { verified: number | null } | undefined;
  let codesRemaining = 0;
  if (factor) {
    try {
      const view = await getAuth().api.viewBackupCodes({ body: { userId } }) as { backupCodes?: unknown };
      codesRemaining = Array.isArray(view?.backupCodes) ? view.backupCodes.length : 0;
    } catch {
      // An unreadable code set is reported as none remaining, never as an error that
      // would suggest the factor itself is unknown.
      codesRemaining = 0;
    }
  }
  return {
    enabled: Boolean(user?.twoFactorEnabled),
    pending: factor !== undefined && factor.verified === 0,
    codesRemaining,
  };
}

/**
 * Enrolment and disable end every session, including the caller's, so the invariant
 * "no session for a 2FA-enabled account skipped its challenge" holds from the first
 * moment, and a stolen cookie cannot outlive the change that revoked it. Returns how
 * many sessions went away.
 */
export function revokeAllSessions(userId: string) {
  return db().prepare("DELETE FROM session WHERE userId=?").run(userId).changes;
}

/**
 * Prove the second factor for a management write. A six-digit value is an
 * authenticator code and anything else must be the recovery-code shape, so the two
 * can never be confused. `disableSession` is set by the server here on purpose: this
 * is a step-up check inside an existing session, not a sign-in, and it must not mint
 * or rotate one.
 */
export async function proveFactor(cookie: string, code: string) {
  const auth = getAuth();
  if (/^\d{6}$/.test(code)) {
    await auth.api.verifyTOTP({ headers: headersOf(cookie), body: { code } });
    return "totp" as const;
  }
  if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(code)) throw new Error("bad_request");
  await auth.api.verifyBackupCode({
    headers: headersOf(cookie),
    body: { code, disableSession: true },
  });
  return "recovery" as const;
}
