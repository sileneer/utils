/** Return destinations are product routes, not arbitrary redirect URLs. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/";
  // Reject encoded separators/control characters as well as literal URL tricks.
  if (/[\\\x00-\x20\x7f]/.test(value) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f|25)/i.test(value)) return "/";
  try {
    const url = new URL(value, "https://utils.invalid");
    if (url.origin !== "https://utils.invalid") return "/";
    if (!["/", "/htlb", "/about", "/account", "/admin"].includes(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
/** reauth=1 only switches the login page copy/primary label for a stale session;
 * it grants nothing server-side and the destination stays a safe site route. */
export function accountLink(mode: "login" | "register" | "verify-email" | "reset-password", target: string, reauth = false) {
  const base = `/${mode}?returnTo=${encodeURIComponent(safeReturnTo(target))}`;
  return reauth && mode === "login" ? `${base}&reauth=1` : base;
}
