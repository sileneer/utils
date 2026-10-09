export const ACCOUNT_EVENT = "utils-account-changed";
export const ACCOUNT_STORAGE = "utils_auth_changed";
export type AccountChangeKind = "security" | "profile";
export function storageChangeKind(value: string | null): AccountChangeKind {
  try { return JSON.parse(value ?? "{}").kind === "profile" ? "profile" : "security"; }
  catch { return "security"; }
}
export function notifyAccountChange(kind: AccountChangeKind = "security") {
  window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: kind }));
  try { localStorage.setItem(ACCOUNT_STORAGE, JSON.stringify({ kind, nonce: String(Date.now()) + Math.random() })); }
  catch { /* Identity remains usable when browser storage is restricted. */ }
}
