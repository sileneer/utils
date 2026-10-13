/** Safe wrapper error codes mapped to account copy keys, one scope per section.
 * Password, profile and session failures must not share the same message, and a
 * transport failure is always an unconfirmed result — never a success. */
export type AccountErrorScope = "password" | "profile" | "sessions" | "auth";
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
      return "limited";
    case "reauth_required":
      return "reauth";
    case "unauthorized":
      return "sessionExpired";
    case "not_found":
      return scope === "sessions" ? "sessionGone" : "actionFailed";
    case "auth_failed":
      if (scope === "password" || scope === "sessions") return "passwordWrong";
      return scope === "profile" ? "profileFailed" : "actionFailed";
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
