import { draftPrefix, modelKey, sessionKey, VERIFY_EMAIL_KEY } from "./keys";

/**
 * Removes everything the browser kept on behalf of one account (ARCHITECTURE §5 "Account
 * deletion", DESIGN §5.17).
 *
 * Every key here is namespaced by the account id, so another account's drafts on the same
 * browser are left standing. The device theme keys are deliberately *not* touched: they
 * describe this browser rather than the account, and the site's preference model already
 * treats them as surviving a logout.
 *
 * This is hygiene, not security — the server has already destroyed the data, and nothing
 * stored here is a credential — so a failure to reach storage must never be reported as a
 * failed deletion.
 */
export function clearAccountState(owner: string) {
  if (!owner) return;
  const prefixes = [sessionKey(owner), modelKey(owner), draftPrefix(owner)];
  try {
    // Snapshot first: removing while iterating `localStorage` shifts the index under it.
    const keys = Object.keys(localStorage);
    for (const key of keys)
      if (prefixes.some((prefix) => key === prefix || key.startsWith(prefix))) localStorage.removeItem(key);
  } catch { /* Restricted storage still leaves the account deleted. */ }
  try {
    sessionStorage.removeItem(VERIFY_EMAIL_KEY);
  } catch { /* Same. */ }
}
