"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { AccountUser } from "@/lib/auth/identity";
import type { Preferences } from "@/lib/auth/preferences";
import { accountErrorKey, type AccountErrorScope } from "@/lib/auth/errors";
import { ACCOUNT_EVENT, ACCOUNT_STORAGE, notifyAccountChange, storageChangeKind } from "@/lib/auth/events";
import { readDeviceTheme } from "@/lib/theme-device";

type AccountState = {
  user: AccountUser | null | undefined;
  loading: boolean;
  failed: boolean;
  refresh: (invalidate?: boolean) => Promise<void>;
  /** undefined while unknown, null when anonymous or unreadable (DESIGN §5.11). */
  preferences: Preferences | undefined;
};
const Context = createContext<AccountState | null>(null);

/**
 * Applies the effective theme: an explicitly saved account choice wins, and an
 * unset one leaves the device value in charge. It writes only next-themes'
 * applied cache, so signing out or switching accounts restores the device
 * setting instead of leaking one account's preference into the next.
 */
function ThemeSynchronizer({ preferences }: { preferences: Preferences | undefined }) {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    // Stay put while the account layer is still unknown, otherwise the device
    // theme would flash before the saved choice arrives.
    if (preferences === undefined) return;
    const target = preferences.theme ?? readDeviceTheme();
    if (theme !== target) setTheme(target);
  }, [preferences, theme, setTheme]);
  return null;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>();
  const [preferences, setPreferences] = useState<Preferences>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const version = useRef(0);
  const loadPreferences = useCallback(async (generation: number) => {
    try {
      const response = await fetch("/api/account/preferences", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data: { preferences?: Preferences } = await response.json();
      if (generation !== version.current) return;
      setPreferences(data.preferences ?? { theme: null, language: null });
    } catch {
      // An unreadable preference layer falls back to the device, never blocks.
      if (generation === version.current) setPreferences({ theme: null, language: null });
    }
  }, []);
  const refresh = useCallback(async (invalidate = false) => {
    const generation = ++version.current;
    if (invalidate) { setUser(undefined); setPreferences({ theme: null, language: null }); }
    setLoading(true);
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data: { user: AccountUser | null } = await response.json();
      if (generation !== version.current) return;
      setUser(data.user);
      setFailed(false);
      if (data.user) void loadPreferences(generation);
      else setPreferences({ theme: null, language: null });
    } catch { if (generation === version.current) setFailed(true); }
    finally { if (generation === version.current) setLoading(false); }
  }, [loadPreferences]);
  useEffect(() => {
    const generation = version;
    queueMicrotask(() => void refresh());
    // "security" (logout/reset/expiry) clears the known identity at once; a
    // same-account "session" change (revoke/password) refreshes it without
    // unmounting the open account UI, and "profile" never cancels a chat.
    const changed = (event: Event) => void refresh((event as CustomEvent).detail === "security");
    const storage = (event: StorageEvent) => { if (event.key === ACCOUNT_STORAGE) void refresh(storageChangeKind(event.newValue) === "security"); };
    const focus = () => void refresh();
    window.addEventListener(ACCOUNT_EVENT, changed);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      window.removeEventListener(ACCOUNT_EVENT, changed);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  return <Context.Provider value={{ user, loading, failed, refresh, preferences }}>
    <ThemeSynchronizer preferences={preferences} />
    {children}
  </Context.Provider>;
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("AccountProvider required");
  return value;
}
/** Localized copy for a safe wrapper error, scoped to the section that raised it. */
export function useAccountError(scope: AccountErrorScope = "auth") {
  const t = useTranslations("account");
  return (error: unknown) => t(accountErrorKey(error instanceof Error ? error.message : "", scope));
}
/** Safe errors only; never persist credentials or forward raw auth responses. */
export async function accountAction<T = unknown>(path: string, body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(40_000),
    });
  } catch {
    // Offline, timeout or abort: the server outcome is unconfirmed, not success.
    throw new Error("network_unknown");
  }
  if (!response.ok) {
    let error = "service_unavailable";
    try { error = (await response.json()).error ?? error; } catch { /* Generic failure. */ }
    if (response.status === 401) notifyAccountChange();
    throw new Error(error);
  }
  let data: T;
  try { data = (await response.json()) as T; } catch { data = {} as T; }
  notifyAccountChange(
    // "profile" means "re-resolve without cancelling anything", which is also
    // what a preference save needs: other tabs re-read it, no chat is stopped.
    // Opening, resending or cancelling an email transaction changes no identity,
    // so it stays in that tier; committing revokes every session and must clear
    // the known identity exactly like a logout. Issuing a setup key or replacing
    // the recovery-code set changes no session either; confirming or turning the
    // second factor off revokes every login, including this one. Passkeys are the
    // same: adding, renaming or removing one never ends a live session, so other
    // windows only re-resolve — the sessions card is where a live login is revoked.
    // Asking to delete an account, and withdrawing that ask, likewise changes no
    // access at all; only the completed deletion falls through to "security", where
    // every window drops the identity it can no longer read.
    path === "/api/account/profile" || path === "/api/account/preferences" ||
    path === "/api/account/email/start" || path === "/api/account/email/resend" ||
    path === "/api/account/email/cancel" || path === "/api/account/2fa/enable" ||
    path === "/api/account/2fa/recovery-codes" ||
    path === "/api/account/deletion/request" || path === "/api/account/deletion/withdraw" ||
    path.startsWith("/api/account/passkeys/") ? "profile"
      : path === "/api/account/password" || path === "/api/account/sessions/revoke" ? "session"
      : "security",
  );
  return data;
}
