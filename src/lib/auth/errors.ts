/** Safe wrapper error codes mapped to account copy keys, one scope per section.
 * Password, profile and session failures must not share the same message, and a
 * transport failure is always an unconfirmed result — never a success. */
export type AccountErrorScope =
  | "password"
  | "profile"
  | "preferences"
  | "sessions"
  | "email"
  | "auth";
/** True when the server outcome is unknown, so state must be re-read before the
 * user decides whether to retry. */
export function isUnconfirmedError(error: unknown): boolean {
  return error instanceof Error && error.message === "network_unknown";
}
export function accountErrorKey(
  code: string,
  scope: AccountErrorScope = "auth",
): string {
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
