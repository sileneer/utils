"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AccountUser } from "@/lib/auth/identity";
import { ACCOUNT_EVENT, ACCOUNT_STORAGE, notifyAccountChange, storageChangeKind } from "@/lib/auth/events";

type AccountState = {
  user: AccountUser | null | undefined;
  loading: boolean;
  failed: boolean;
  refresh: (invalidate?: boolean) => Promise<void>;
};
const Context = createContext<AccountState | null>(null);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const version = useRef(0);
  const refresh = useCallback(async (invalidate = false) => {
    const generation = ++version.current;
    if (invalidate) setUser(undefined);
    setLoading(true);
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data: { user: AccountUser | null } = await response.json();
      if (generation !== version.current) return;
      setUser(data.user);
      setFailed(false);
    } catch { if (generation === version.current) setFailed(true); }
    finally { if (generation === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const generation = version;
    queueMicrotask(() => void refresh());
    const changed = (event: Event) => void refresh((event as CustomEvent).detail !== "profile");
    const storage = (event: StorageEvent) => { if (event.key === ACCOUNT_STORAGE) void refresh(storageChangeKind(event.newValue) !== "profile"); };
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
  return <Context.Provider value={{ user, loading, failed, refresh }}>{children}</Context.Provider>;
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("AccountProvider required");
  return value;
}
/** Safe errors only; never persist credentials or forward raw auth responses. */
export async function accountAction(path: string, body: object) {
  const response = await fetch(path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(40_000),
  });
  if (!response.ok) {
    let error = "service_unavailable";
    try { error = (await response.json()).error ?? error; } catch { /* Generic failure. */ }
    if (response.status === 401) notifyAccountChange();
    throw new Error(error);
  }
  notifyAccountChange(path === "/api/account/profile" ? "profile" : "security");
}
