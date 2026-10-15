/** Safe wrapper error codes mapped to account copy keys, one scope per section.
 * Password, profile and session failures must not share the same message, and a
 * transport failure is always an unconfirmed result — never a success. */
export type AccountErrorScope =
  | "password"
  | "profile"
  | "preferences"
  | "sessions"
  | "email"
  | "twoFactor"
  | "passkeys"
  | "deletion"
  | "auth";
/** True when the server outcome is unknown, so state must be re-read before the
 * user decides whether to retry. */
export function isUnconfirmedError(error: unknown): boolean {
  return error instanceof Error && error.message === "network_unknown";
}
/** The two-factor vocabulary is shared by the sign-in challenge and the account
 * card, so one dead challenge or one wrong code reads the same in both places. */
const FACTOR_KEYS: Record<string, string> = {
  password_wrong: "factorPasswordWrong",
  code_failed: "factorCodeWrong",
  recovery_failed: "factorRecoveryWrong",
  challenge_gone: "factorChallengeGone",
  attempts_exhausted: "factorAttemptsExhausted",
  locked: "factorLocked",
  not_enabled: "factorNotEnabled",
  already_enabled: "factorAlreadyEnabled",
  signed_in: "factorSignedIn",
  bad_request: "factorCodeFormat",
};
/** The passkey vocabulary: each refusal names the thing that actually stopped. */
const PASSKEY_KEYS: Record<string, string> = {
  password_wrong: "passkeyPasswordWrong",
  challenge_gone: "passkeyChallengeGone",
  assertion_failed: "passkeyAssertionFailed",
  not_user_verified: "passkeyNotVerified",
  registration_failed: "passkeyRegistrationFailed",
  already_registered: "passkeyDuplicate",
  limit_reached: "passkeyLimit",
  not_found: "passkeyGone",
  signed_in: "passkeySignedIn",
  bad_request: "passkeyInvalid",
  unauthorized: "sessionExpired",
};
/**
 * The deletion vocabulary. Every one of these is a different reason the site did *not*
 * delete the account, and the person has to be able to tell them apart: too early, no
 * export yet, this account holds the last administrator seat, the typed address did not
 * match. A factor failure keeps its shared wording, because it is the same fact.
 */
const DELETION_KEYS: Record<string, string> = {
  already_requested: "deletionAlreadyOpen",
  not_requested: "deletionNoneOpen",
  cooling_off: "deletionTooEarly",
  export_required: "deletionExportNeeded",
  last_admin: "deletionLastAdmin",
  confirm_mismatch: "deletionConfirmMismatch",
  password_wrong: "deletionPasswordWrong",
  not_found: "deletionGone",
  unauthorized: "sessionExpired",
  bad_request: "deletionInvalid",
};
export function accountErrorKey(
  code: string,
  scope: AccountErrorScope = "auth",
): string {
  if (scope === "twoFactor" && FACTOR_KEYS[code]) return FACTOR_KEYS[code];
  if (scope === "passkeys" && PASSKEY_KEYS[code]) return PASSKEY_KEYS[code];
  if (scope === "deletion") {
    const key = DELETION_KEYS[code] ?? FACTOR_KEYS[code];
    if (key) return key;
  }
  switch (code) {
    case "rate_limited":
      return scope === "email" ? "emailLimited" : "limited";
    case "reauth_required":
      return "reauth";
    case "unauthorized":
      return "sessionExpired";
    case "not_found":
      if (scope === "sessions") return "sessionGone";
      return scope === "email" ? "emailGone" : "actionFailed";
    case "auth_failed":
      if (scope === "password" || scope === "sessions") return "passwordWrong";
      if (scope === "preferences") return "preferencesFailed";
      return scope === "profile" ? "profileFailed" : "actionFailed";
    // Each email failure names its own cause: a wrong password, a wrong code, an
    // exhausted code budget and a retired transaction are never the same message.
    case "password_wrong":
      return "emailPasswordWrong";
    case "code_failed":
      return "emailCodeWrong";
    case "attempts_exhausted":
      return "emailAttemptsExhausted";
    case "expired":
      return "emailExpired";
    case "stale_target":
      return "emailStaleTarget";
    case "already_completed":
      return "emailAlreadyDone";
    case "email_taken":
      return "emailTaken";
    case "email_same":
      return "emailSame";
    case "bad_request":
      return scope === "email" ? "emailInvalid" : "actionFailed";
    case "mail_send_failed":
      return scope === "email" ? "emailMailFailed" : "actionFailed";
    case "challenge_failed":
      return "challengeError";
    case "stop_unconfirmed":
    case "account_busy":
      return "securityFailed";
    case "network_unknown":
      return "resultUnknown";
    case "service_unavailable":
      return "serviceFailed";
    default:
      return "actionFailed";
  }
}
