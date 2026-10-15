"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Monitor } from "lucide-react";
import type { AccountUser } from "@/lib/auth/identity";
import { accountLink } from "@/lib/auth/navigation";
import { ACCOUNT_EVENT, ACCOUNT_STORAGE } from "@/lib/auth/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PasswordField } from "./password-field";
import { Challenge } from "./challenge";
import { accountAction, useAccount, useAccountError } from "./account-provider";
import { isUnconfirmedError } from "@/lib/auth/errors";
import { hasUnsaved, markUnsaved } from "@/lib/unsaved";
import { readDeviceTheme } from "@/lib/theme-device";
import type { Availability } from "@/lib/chat/history";
import { clearAccountState } from "@/lib/chat/clear";
import type { Preferences as AccountPreferences } from "@/lib/auth/preferences";
import type { ExportSummary } from "@/lib/auth/export";
import type { SecurityEvent } from "@/lib/auth/security-events";
import type { TwoFactorStatus } from "@/lib/auth/two-factor";
import {
  CeremonyError,
  createPasskey,
  passkeySupport,
  type WebAuthnOptions,
} from "@/lib/passkey-browser";

type LoginSession = { id: string; current: boolean; createdAt: string; expiresAt: string; browser: string; system: string };
function Field({ label, error, id, ...props }: React.ComponentProps<typeof Input> & { label: string; error?: string; id: string }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input {...props} id={id} className="h-11" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : props["aria-describedby"]} />{error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
function Summary({ user }: { user: AccountUser }) {
  const t = useTranslations("account");
  const initial = Array.from(user.name.trim())[0]?.toUpperCase() || "U";
  const sections = [
    { id: "profile", label: t("profile") },
    { id: "preferences", label: t("preferences") },
    { id: "security", label: t("security") },
    { id: "two-factor", label: t("twoFactorNav") },
    { id: "passkeys", label: t("passkeysNav") },
    { id: "email", label: t("emailNav") },
    { id: "sessions", label: t("sessions") },
    { id: "activity", label: t("activityNav") },
    { id: "usage", label: t("usage") },
    { id: "export", label: t("export") },
    { id: "deletion", label: t("deletionNav") },
  ];
  return <Card role="region" aria-label={t("summaryLabel")}><CardContent className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-medium text-primary">{initial}</span>
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        <p className="break-words font-medium">{user.name}</p>
        <p className="break-all text-sm text-muted-foreground">{user.email} <Badge variant="secondary">{t("emailVerified")}</Badge></p>
      </div>
    </div>
    <nav aria-label={t("sectionNav")} className="flex flex-wrap items-center gap-2">
      {sections.map((section) => <Button key={section.id} variant="outline" className="min-h-10" asChild><a href={`#${section.id}`}>{section.label}</a></Button>)}
      <Link className="inline-flex min-h-10 items-center text-sm underline underline-offset-4" href="/">{t("back")}</Link>
    </nav>
  </CardContent></Card>;
}
function Profile({ user }: { user: AccountUser }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const { refresh } = useAccount();
  const failure = useAccountError("profile");
  const [serverName, setServerName] = useState(user.name);
  const [adopt, setAdopt] = useState(user.name);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  // Disabled state only lands after a render, so a same-frame repeat click or
  // held Enter key would still reach the handler; guard on the write itself.
  const pending = useRef(false);
  const schema = z.object({ name: z.string().trim().min(1, t("required")).max(80, t("nameHint")) });
  const { register, handleSubmit, reset, getValues, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
    values: { name: adopt },
    reValidateMode: "onChange",
  });
  const draft = useWatch({ control, name: "name" }) ?? "";
  const dirty = draft.trim() !== user.name;
  // A language switch reloads the document, so remember that this draft exists.
  useEffect(() => { if (!dirty) return; return markUnsaved("profile"); }, [dirty]);
  // The confirmed name changed (this window, another tab or another device).
  // Adjusting during render keeps an unsaved draft: untouched fields follow the
  // new value, an edited field raises a conflict the user resolves themselves.
  if (serverName !== user.name) {
    const previous = serverName;
    const current = getValues("name") ?? "";
    setServerName(user.name);
    if (current === previous) {
      setAdopt(user.name);
      setConflict(null);
      setSaved(false);
    } else if (current.trim() !== user.name) {
      setConflict(user.name);
    } else {
      setConflict(null);
    }
  }
  const cancel = () => { reset({ name: user.name }); setAdopt(user.name); setConflict(null); setError(""); setSaved(false); };
  const saveName = async (values: { name: string }) => {
    if (pending.current) return;
    const next = values.name.trim();
    if (!next || next === user.name) return;
    setError("");
    setSaved(false);
    pending.current = true;
    try {
      await accountAction("/api/account/profile", { name: next });
      reset({ name: next });
      setAdopt(next);
      setConflict(null);
      setSaved(true);
      toast.success(t("profileSaved"));
    } catch (e) { setError(failure(e)); if (isUnconfirmedError(e)) void refresh(); }
    finally { pending.current = false; }
  };
  return <Card><CardHeader><CardTitle><h2>{t("profile")}</h2></CardTitle><CardDescription>{t("profileDescription")}</CardDescription></CardHeader><CardContent className="space-y-5">
    <dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">{t("email")}</dt><dd className="mt-1 break-all">{user.email} <Badge variant="secondary">{t("emailVerified")}</Badge></dd></div><div><dt className="text-muted-foreground">{t("joined")}</dt><dd className="mt-1">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(user.createdAt))}</dd></div></dl>
    {conflict && <Alert><AlertDescription><p>{t("profileConflict", { name: conflict })}</p><div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-10" onClick={() => setConflict(null)}>{t("profileConflictKeep")}</Button>
      <Button type="button" variant="ghost" className="min-h-10" onClick={cancel}>{t("profileConflictUse")}</Button>
    </div></AlertDescription></Alert>}
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(saveName)(event)}>
      <Field label={t("displayName")} id="profile-name" autoComplete="nickname" maxLength={80} {...register("name", { onChange: () => { setSaved(false); } })} error={errors.name?.message} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {dirty && <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="min-h-10" disabled={isSubmitting}>{isSubmitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("saveProfile")}</Button>
        <Button type="button" variant="outline" className="min-h-10" disabled={isSubmitting} onClick={cancel}>{t("cancel")}</Button>
      </div>}
      {saved && !dirty && <p role="status" className="text-sm text-muted-foreground">{t("profileSaved")}</p>}
    </form>
  </CardContent></Card>;
}
function Password({ reauthNeeded }: { reauthNeeded: boolean }) {
  const t = useTranslations("account");
  const { refresh } = useAccount();
  const failure = useAccountError("password");
  const [open, setOpen] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const reauth = errorCode === "reauth_required" || reauthNeeded;
  const schema = z.object({
    currentPassword: z.string().min(1, t("required")).max(128, t("passwordHint")),
    newPassword: z.string().min(8, t("passwordHint")).max(128, t("passwordHint")).regex(/[A-Za-z]/, t("passwordHint")).regex(/[0-9]/, t("passwordHint")),
    confirm: z.string(),
  }).refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: t("passwordMismatch") });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" }, reValidateMode: "onChange" });
  useEffect(() => { if (open) document.getElementById("current-password")?.focus(); }, [open]);
  const changePassword = async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    if (pending.current) return;
    setErrorCode("");
    setSaved(false);
    pending.current = true;
    try { await accountAction("/api/account/password", { currentPassword, newPassword }); reset(); setSaved(true); toast.success(t("passwordChanged")); }
    catch (e) { setErrorCode(e instanceof Error ? e.message : ""); if (isUnconfirmedError(e)) void refresh(); }
    finally { pending.current = false; }
  };
  return <Card><CardHeader><CardTitle><h2>{t("passwordSection")}</h2></CardTitle><CardDescription>{t("passwordDescription")}</CardDescription></CardHeader><CardContent className="space-y-4">
    {reauth && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#security", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="min-h-10">{open ? t("collapsePasswordForm") : t("changePassword")}</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(changePassword)(event)}>
          <PasswordField label={t("currentPassword")} id="current-password" autoComplete="current-password" maxLength={128} {...register("currentPassword")} error={errors.currentPassword?.message} />
          <PasswordField label={t("newPassword")} id="new-password" autoComplete="new-password" maxLength={128} descriptionId="change-password-hint" {...register("newPassword")} error={errors.newPassword?.message} />
          <p id="change-password-hint" className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          <PasswordField label={t("confirmPassword")} id="confirm-password" autoComplete="new-password" maxLength={128} {...register("confirm")} error={errors.confirm?.message} />
          <p className="text-sm text-muted-foreground">{t("securityEffect")}</p>
          {errorCode && errorCode !== "reauth_required" && <p role="alert" className="text-sm text-destructive">{failure(new Error(errorCode))}</p>}
          {saved && <p role="status" className="text-sm text-muted-foreground">{t("passwordChanged")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-10" disabled={isSubmitting}>{isSubmitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}{t("changePassword")}</Button>
            <Link className="inline-flex min-h-10 items-center text-sm underline underline-offset-4" href={accountLink("reset-password", "/account#security")}>{t("forgot")}</Link>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  </CardContent></Card>;
}
function sortSessions(list: LoginSession[]) {
  return [...list].sort((a, b) => Number(b.current) - Number(a.current) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
function Sessions({ onFreshness }: { onFreshness: (stale: boolean) => void }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const failure = useAccountError("sessions");
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleCode, setStaleCode] = useState("");
  const [problem, setProblem] = useState("");
  const [target, setTarget] = useState<{ kind: "one"; session: LoginSession } | { kind: "others" }>();
  const [mutationError, setMutationError] = useState("");
  const version = useRef(0);
  const revokePending = useRef(false);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [closeFocus, setCloseFocus] = useState<"trigger" | "heading">("trigger");
  const [reloadKey, setReloadKey] = useState(0);
  const schema = z.object({ password: z.string().min(1, t("required")).max(128, t("passwordHint")) });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const load = useCallback(async () => {
    const generation = ++version.current;
    setLoading(true);
    try {
      const response = await fetch("/api/account/sessions", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      let data: { sessions?: LoginSession[]; error?: string } = {};
      try { data = await response.json(); } catch { /* Non-JSON failure. */ }
      if (generation !== version.current) return;
      if (!response.ok) {
        const code = data.error ?? "service_unavailable";
        if (code === "reauth_required") { setProblem("reauth_required"); setSessions([]); setStaleCode(""); onFreshness(true); }
        else if (response.status === 401 || code === "unauthorized") { setProblem("unauthorized"); setSessions([]); setStaleCode(""); onFreshness(false); }
        else setStaleCode(code);
        return;
      }
      setProblem("");
      setSessions(sortSessions(Array.isArray(data.sessions) ? data.sessions : []));
      setStaleCode("");
      onFreshness(false);
    } catch {
      if (generation === version.current) setStaleCode("network_unknown");
    }
    finally { if (generation === version.current) setLoading(false); }
  }, [onFreshness]);
  useEffect(() => {
    const generation = version;
    queueMicrotask(() => void load());
    const changed = () => void load();
    const storage = (event: StorageEvent) => { if (event.key === ACCOUNT_STORAGE) changed(); };
    window.addEventListener("focus", changed);
    window.addEventListener(ACCOUNT_EVENT, changed);
    window.addEventListener("storage", storage);
    return () => { generation.current++; window.removeEventListener("focus", changed); window.removeEventListener(ACCOUNT_EVENT, changed); window.removeEventListener("storage", storage); };
  }, [load]);
  useEffect(() => {
    if (!reloadKey) return;
    queueMicrotask(() => void load());
  }, [reloadKey, load]);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  // Accessible names distinguish sessions that share a browser/system and minute.
  const preciseDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  const device = (session: LoginSession) => `${session.browser === "unknown" ? t("unknownBrowser") : session.browser} · ${session.system === "unknown" ? t("unknownSystem") : session.system}`;
  const others = sessions.filter((session) => !session.current).length;
  function choose(value: typeof target, focusAfter: "trigger" | "heading" = "trigger") { setCloseFocus(focusAfter); setMutationError(""); reset(); setTarget(value); }
  const revokeSessions = async ({ password }: { password: string }) => {
    if (!target || revokePending.current) return;
    setMutationError("");
    revokePending.current = true;
    try {
      await accountAction("/api/account/sessions/revoke", target.kind === "others" ? { others: true, password } : { id: target.session.id, password });
      choose(undefined, "heading");
      toast.success(t(target.kind === "others" ? "sessionsRevoked" : "sessionRevoked"));
      setReloadKey((value) => value + 1);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "not_found") { choose(undefined, "heading"); toast.info(t("sessionGone")); setReloadKey((value) => value + 1); }
      else if (code === "reauth_required") { choose(undefined); setProblem("reauth_required"); setSessions([]); }
      else { setMutationError(failure(e)); if (isUnconfirmedError(e)) setReloadKey((value) => value + 1); }
    } finally { revokePending.current = false; }
  };
  return <Card><CardHeader><CardTitle><h2 ref={headingRef} tabIndex={-1}>{t("sessions")}</h2></CardTitle><CardDescription>{t("sessionsDescription")}</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button className="min-h-10" variant="outline" onClick={() => void load()} disabled={loading || isSubmitting}>{t("refreshSessions")}</Button>
      {others > 0 && <Button className="min-h-10" variant="outline" aria-label={t("revokeOthersNamed", { count: others })} onClick={(event) => { revokeTrigger.current = event.currentTarget; choose({ kind: "others" }); }} disabled={loading || isSubmitting}>{t("logoutOthers")}</Button>}
    </div>
    {problem === "reauth_required" ? <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#sessions", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>
      : problem === "unauthorized" ? <Alert><AlertDescription className="space-y-2"><p>{t("sessionExpired")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#sessions")}>{t("loginAgain")}</Link></Button></AlertDescription></Alert>
        : <>
          {sessions.length > 0 && <p className="text-sm text-muted-foreground" role="status">{t("sessionCount", { total: sessions.length, others })}{loading && ` · ${t("updatingSessions")}`}</p>}
          {staleCode && sessions.length > 0 && <p role="status" className="text-sm text-muted-foreground">{t("staleSessions")}</p>}
          {loading && sessions.length === 0 ? <Skeleton className="h-24 w-full" />
            : sessions.length === 0 ? (staleCode ? <Alert><AlertDescription className="space-y-2"><p>{t("sessionsUnavailable")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("refreshSessions")}</Button></AlertDescription></Alert> : <p className="text-sm text-muted-foreground">{t("noSessions")}</p>)
              : <ul className="divide-y">{sessions.map((session) => <li key={session.id} className="flex flex-wrap items-start gap-3 py-4">
                <Monitor className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 basis-40 space-y-1"><p className="font-medium">{device(session)}</p>{session.current && <Badge variant="secondary">{t("currentSession")}</Badge>}<p className="text-xs text-muted-foreground">{t("sessionCreated", { date: date(session.createdAt) })}</p><p className="text-xs text-muted-foreground">{t("sessionExpires", { date: date(session.expiresAt) })}</p></div>
                {!session.current && <Button variant="outline" className="min-h-10" disabled={isSubmitting} aria-label={t("revokeNamed", { target: device(session), date: preciseDate(session.createdAt) })} onClick={(event) => { revokeTrigger.current = event.currentTarget; choose({ kind: "one", session }); }}>{t("revokeSession")}</Button>}
              </li>)}</ul>}
        </>}
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !isSubmitting && target) choose(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (closeFocus === "trigger" && revokeTrigger.current?.isConnected) { revokeTrigger.current.focus(); return; }
        headingRef.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{target?.kind === "others" ? t("revokeOthersConfirm") : t("revokeConfirm")}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.kind === "one" && <span className="mb-3 block">{t("revokeTarget", { target: device(target.session), date: date(target.session.createdAt) })}</span>}
            {target?.kind === "others" && <span className="mb-3 block">{t("revokeOthersScope", { count: others })}</span>}
            {t("securityEffect")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id="account-revoke-form" className="space-y-3" onSubmit={(event) => void handleSubmit(revokeSessions)(event)}><PasswordField label={t("currentPassword")} id="revoke-password" autoComplete="current-password" maxLength={128} {...register("password")} error={errors.password?.message} />{mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}</form>
        <AlertDialogFooter><AlertDialogCancel className="min-h-10" disabled={isSubmitting}>{t("cancel")}</AlertDialogCancel><AlertDialogAction className="min-h-10" type="submit" form="account-revoke-form" disabled={isSubmitting} onClick={(e) => { e.preventDefault(); void handleSubmit(revokeSessions)(e); }}>{target?.kind === "others" ? t("logoutOthers") : t("revokeSession")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </CardContent></Card>;
}
const FOLLOW_DEVICE = "device";
const emptySubscribe = () => () => {};

/** Account layer of theme/language. Saving is explicit: nothing is uploaded on
 * login, and the device layer keeps its own value (DESIGN §5.11). */
function PreferencesCard({ saved }: { saved: AccountPreferences }) {
  const t = useTranslations("account");
  const th = useTranslations("theme");
  const lg = useTranslations("language");
  const failure = useAccountError("preferences");
  // The device theme only exists in this browser, so reveal it after mount.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [deviceTheme] = useState(() => readDeviceTheme());
  const confirmedTheme = saved.theme ?? FOLLOW_DEVICE;
  const confirmedLanguage = saved.language ?? FOLLOW_DEVICE;
  const [draft, setDraft] = useState({ theme: confirmedTheme, language: confirmedLanguage });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  // Compare against the last *confirmed* values, not the incoming ones: an
  // external save must not look like a local edit, or it would never be adopted.
  const [confirmed, setConfirmed] = useState({ theme: confirmedTheme, language: confirmedLanguage });
  const dirty = draft.theme !== confirmed.theme || draft.language !== confirmed.language;
  // Re-resolve when another tab or device saves, without dropping a local edit.
  if (confirmed.theme !== confirmedTheme || confirmed.language !== confirmedLanguage) {
    const previous = confirmed;
    setConfirmed({ theme: confirmedTheme, language: confirmedLanguage });
    if (draft.theme === previous.theme && draft.language === previous.language)
      setDraft({ theme: confirmedTheme, language: confirmedLanguage });
  }
  useEffect(() => { if (!dirty) return; return markUnsaved("preferences"); }, [dirty]);
  const edit = (patch: Partial<typeof draft>) => { setDraft((value) => ({ ...value, ...patch })); setDone(false); setNotice(""); setError(""); };
  const cancel = () => { setDraft({ theme: confirmedTheme, language: confirmedLanguage }); setError(""); setNotice(""); setDone(false); };
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    const languageChanged = draft.language !== confirmedLanguage;
    try {
      await accountAction("/api/account/preferences", {
        theme: draft.theme === FOLLOW_DEVICE ? null : draft.theme,
        language: draft.language === FOLLOW_DEVICE ? null : draft.language,
      });
      setDone(true);
      // Language is server-rendered, so it needs a reload; never reload over
      // another form's unsaved work — say when it will apply instead.
      if (languageChanged && !hasUnsaved("preferences")) window.location.reload();
      else if (languageChanged) setNotice(t("languageAppliesOnReload"));
    } catch (e) { setError(failure(e)); }
    finally { pending.current = false; setSaving(false); }
  };
  return <Card><CardHeader><CardTitle><h2>{t("preferences")}</h2></CardTitle><CardDescription>{t("preferencesDescription")}</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="space-y-2">
      <Label htmlFor="preference-theme">{t("themePreference")}</Label>
      <Select value={draft.theme} onValueChange={(value) => edit({ theme: value })}>
        <SelectTrigger id="preference-theme" className="h-11! w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW_DEVICE}>{t("followDevice")}</SelectItem>
          <SelectItem value="system">{th("system")}</SelectItem>
          <SelectItem value="light">{th("light")}</SelectItem>
          <SelectItem value="dark">{th("dark")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("themePreferenceHint")}{mounted && dirty === false && draft.theme === FOLLOW_DEVICE ? ` ${t("deviceValue", { value: th(deviceTheme) })}` : ""}</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor="preference-language">{t("languagePreference")}</Label>
      <Select value={draft.language} onValueChange={(value) => edit({ language: value })}>
        <SelectTrigger id="preference-language" className="h-11! w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW_DEVICE}>{t("followDevice")}</SelectItem>
          <SelectItem value="en">{lg("en")}</SelectItem>
          <SelectItem value="zh">{lg("zh")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("languagePreferenceHint")}</p>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {done && !dirty && <p role="status" className="text-sm text-muted-foreground">{t("preferencesSaved")}</p>}
    {dirty && <div className="flex flex-wrap items-center gap-3">
      <Button type="button" className="min-h-10" disabled={saving} onClick={() => void save()}>
        {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
        {t("savePreferences")}
      </Button>
      <Button type="button" variant="outline" className="min-h-10" disabled={saving} onClick={cancel}>{t("cancel")}</Button>
    </div>}
  </CardContent></Card>;
}

/** Personal usage only: its own request, its own failure state, and no effect on
 * identity, profile, security or public reading (DESIGN §5.11). */
function UsageCard() {
  const t = useTranslations("account");
  const c = useTranslations("chat");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<Availability>();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/account/usage", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data: { usage?: Availability } = await response.json();
      if (!data.usage) throw new Error();
      setUsage(data.usage);
      setState("ready");
    } catch { setState("failed"); }
  }, []);
  useEffect(() => { if (open && !usage) queueMicrotask(() => void load()); }, [open, usage, load]);
  const reset = usage ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(usage.resetAt) : "";
  return <Card><CardHeader><CardTitle><h2>{t("usage")}</h2></CardTitle><CardDescription>{t("usageDescription")}</CardDescription></CardHeader><CardContent>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="min-h-10 w-full justify-between gap-2 text-left">
          <span>{open ? t("usageCollapse") : t("usageLoad")}</span>
          {usage && <span className="text-xs font-normal text-muted-foreground">{c("availability_" + usage.service)}</span>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-4">
        {state === "loading" && <Skeleton className="h-20 w-full" />}
        {state === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("usageFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("usageRetry")}</Button></AlertDescription></Alert>}
        {state === "ready" && usage && <>
          <p role="status" className="text-sm font-medium">{c("availability_" + usage.service)}</p>
          {/* AI switched off is not a spent quota: no counts are implied. */}
          {usage.enabled ? <>
            <p className="text-sm">{c("quotaSummary", { remaining: usage.remaining, limit: usage.limit })}</p>
            <p className="text-sm text-muted-foreground">{c("quotaReset", { used: usage.used, time: reset })}</p>
          </> : <p className="text-sm text-muted-foreground">{t("usageUnavailable")}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{c("quotaScope")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("usageRefresh")}</Button>
            <Button variant="ghost" className="min-h-10" asChild><Link href="/htlb">{t("usageOpenReader")}</Link></Button>
          </div>
        </>}
      </CollapsibleContent>
    </Collapsible>
  </CardContent></Card>;
}
/** Read-only personal data export (DESIGN §5.12). Nothing here deletes, revokes or
 * shares anything: the card only links to a private, no-store attachment. */
function ExportCard({ onFreshness }: { onFreshness: (stale: boolean) => void }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "reauth" | "failed">("idle");
  const [summary, setSummary] = useState<ExportSummary>();
  const [conversation, setConversation] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/export/summary", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.status === 403) { setStatus("reauth"); setSummary(undefined); onFreshness(true); return; }
      if (!response.ok) { setStatus("failed"); onFreshness(false); return; }
      const data: { summary?: ExportSummary } = await response.json();
      if (!data.summary) { setStatus("failed"); return; }
      setSummary(data.summary);
      setStatus("ready");
      onFreshness(false);
    } catch { setStatus("failed"); }
  }, [onFreshness]);
  useEffect(() => { if (open && status === "idle") queueMicrotask(() => void load()); }, [open, status, load]);
  const narrowed = conversation !== "" || from !== "" || to !== "";
  const scope = new URLSearchParams();
  if (conversation) scope.set("conversation", conversation);
  else { if (from) scope.set("from", from); if (to) scope.set("to", to); }
  const link = (format: "json" | "markdown") => {
    const params = new URLSearchParams(scope);
    params.set("format", format);
    return `/api/account/export?${params.toString()}`;
  };
  const stamp = (ms: number | null) => (ms === null ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ms)));
  const blocked = status === "ready" && summary ? !summary.complete && !narrowed : false;
  return <Card><CardHeader><CardTitle><h2>{t("export")}</h2></CardTitle><CardDescription>{t("exportDescription")}</CardDescription></CardHeader><CardContent>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="min-h-10 w-full justify-between gap-2 text-left">
          <span>{open ? t("exportCollapse") : t("exportLoad")}</span>
          {summary && status === "ready" && <span className="text-xs font-normal text-muted-foreground">{t("exportSummaryCounts", { conversations: summary.counts.conversations, messages: summary.counts.messages })}</span>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        {status === "loading" && <Skeleton className="h-24 w-full" />}
        {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("exportFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("exportRetry")}</Button></AlertDescription></Alert>}
        {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#export", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
        {summary && (status === "ready" || status === "reauth") && <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-muted-foreground">{t("exportConversations")}</dt><dd className="font-medium">{summary.counts.conversations}</dd></div>
            <div><dt className="text-muted-foreground">{t("exportMessages")}</dt><dd className="font-medium">{summary.counts.messages}</dd></div>
            <div><dt className="text-muted-foreground">{t("exportUsage")}</dt><dd className="font-medium">{summary.counts.usageRecords}</dd></div>
            <div><dt className="text-muted-foreground">{t("exportActivity")}</dt><dd className="font-medium">{stamp(summary.counts.oldestAt)} – {stamp(summary.counts.newestAt)}</dd></div>
          </dl>
          {summary.counts.conversations === 0 && <p className="text-sm text-muted-foreground">{t("exportEmpty")}</p>}
          {!summary.complete && !narrowed && <Alert><AlertDescription className="space-y-3">
            <p>{t("exportOverLimit", { limit: summary.limits.conversations })}</p>
            <p className="text-xs text-muted-foreground">{t("exportNeverPartial")}</p>
            <div className="flex flex-wrap gap-2">
              {summary.suggestedSegments.dateRanges.slice(0, 4).map((range) => <Button key={`${range.from}-${range.to}`} type="button" variant="outline" className="min-h-10" onClick={() => { setConversation(""); setFrom(range.from); setTo(range.to); }}>{t("exportRange", { from: range.from, to: range.to })}</Button>)}
            </div>
          </AlertDescription></Alert>}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="export-conversation">{t("exportScopeConversation")}</Label>
              <Select value={conversation || "all"} onValueChange={(value) => { setConversation(value === "all" ? "" : value); if (value !== "all") { setFrom(""); setTo(""); } }}>
                <SelectTrigger id="export-conversation" className="h-11! w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("exportScopeAll")}</SelectItem>
                  {summary.suggestedSegments.conversations.map((item) => <SelectItem key={item.id} value={item.id}>{item.title || item.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="space-y-2" disabled={conversation !== ""}>
              <legend className="text-sm font-medium">{t("exportScopeDates")}</legend>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-40 flex-1"><Field label={t("exportFrom")} id="export-from" type="date" max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} /></div>
                <div className="min-w-40 flex-1"><Field label={t("exportTo")} id="export-to" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></div>
              </div>
              {conversation !== "" && <p className="text-xs text-muted-foreground">{t("exportDatesDisabled")}</p>}
            </fieldset>
            {(narrowed || summary.complete) && <div className="flex flex-wrap items-center gap-3">
              <Button className="min-h-10" variant="outline" asChild><a href={link("json")} download>{t("exportDownloadJson")}</a></Button>
              <Button className="min-h-10" variant="outline" asChild><a href={link("markdown")} download>{t("exportDownloadMarkdown")}</a></Button>
              {narrowed && <Button className="min-h-10" variant="ghost" onClick={() => { setConversation(""); setFrom(""); setTo(""); }}>{t("exportClearScope")}</Button>}
            </div>}
            <p className="text-xs leading-relaxed text-muted-foreground">{t("exportPrivacy")}</p>
            {blocked && <p role="status" className="text-sm text-destructive">{t("exportBlocked")}</p>}
          </div>
        </>}
      </CollapsibleContent>
    </Collapsible>
  </CardContent></Card>;
}
/** TOTP second factor (DESIGN §5.15). Enrolment is two steps and the first one
 * enables nothing; a secret, a provisioning URI and the plaintext codes live only in
 * this component's state, for as long as the step that received them is open. */
type FactorStep = "idle" | "loading" | "reauth" | "failed";
const TOTP_FORMAT = /^\d{6}$/;
const RECOVERY_FORMAT = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;
function setupKeyOf(uri: string) {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    // An unreadable URI is stated as such; the secret is never guessed at.
    return "";
  }
}
function FactorNotice({ state }: { state: "enabled" | "disabled" }) {
  const t = useTranslations("account");
  return <Card role="region" aria-label={t(state === "enabled" ? "factorEnabledTitle" : "factorDisabledTitle")}>
    <CardHeader><CardTitle><h2>{t(state === "enabled" ? "factorEnabledTitle" : "factorDisabledTitle")}</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm font-medium">{t(state === "enabled" ? "factorNowOn" : "factorNowOff")}</p>
      <p className="text-sm text-muted-foreground">{t("factorSignedOutAll")}</p>
      <Button className="min-h-10" asChild><Link href={accountLink("login", "/")}>{t("loginAgain")}</Link></Button>
    </CardContent>
  </Card>;
}
/** The plaintext list is shown in exactly two situations — finishing enrolment and
 * replacing the set — and both read the same way, because the save-it-yourself
 * consequence is identical. */
function RecoveryCodes({ codes, copied, onCopy, heading }: { codes: string[]; copied: boolean; onCopy: () => void; heading: string }) {
  const t = useTranslations("account");
  return <div className="space-y-2">
    <h3 className="text-sm font-medium">{heading}</h3>
    <p className="text-sm">{t("factorCodesShownOnce")}</p>
    <p className="text-xs text-muted-foreground">{t("factorCodesSave")}</p>
    <ul className="grid gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm">
      {codes.map((value, index) => <li key={index} className="break-all">{value}</li>)}
    </ul>
    <Button variant="outline" className="min-h-10" type="button" onClick={onCopy}>{copied ? t("factorCopied") : t("factorCopyCodes")}</Button>
  </div>;
}
function TwoFactorCard({ onSignedOut }: { onSignedOut: (state: "enabled" | "disabled") => void }) {
  const t = useTranslations("account");
  const failure = useAccountError("twoFactor");
  const [open, setOpen] = useState(false);
  const [factor, setFactor] = useState<TwoFactorStatus>();
  const [status, setStatus] = useState<FactorStep>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stepUp, setStepUp] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [stored, setStored] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [dialog, setDialog] = useState<"commit" | "regenerate" | "disable" | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/2fa", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) { setFactor(undefined); setStatus("reauth"); return; }
      if (!response.ok) { setFactor(undefined); setStatus("failed"); return; }
      const data: { twoFactor?: TwoFactorStatus } = await response.json();
      if (!data.twoFactor) { setFactor(undefined); setStatus("failed"); return; }
      setFactor(data.twoFactor);
      setStatus("idle");
    } catch { setFactor(undefined); setStatus("failed"); }
  }, []);
  useEffect(() => {
    if (open && factor === undefined && status !== "failed") queueMicrotask(() => void load());
  }, [open, factor, status, load]);
  // Closing the step is what forgets the factor material: the setup key and the
  // plaintext codes have no second copy anywhere.
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) return;
    setSecret("");
    setCodes([]);
    setPassword("");
    setCode("");
    setStepUp("");
    setStored(false);
    setCopied(false);
    setCopiedKey(false);
    setDialog(null);
    setError("");
  };
  const send = async (route: string, body: Record<string, unknown>) => {
    if (busy.current) return null;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      return await accountAction<Record<string, unknown>>(`/api/account/2fa/${route}`, body);
    } catch (raised) {
      setError(failure(raised));
      if (isUnconfirmedError(raised)) void load();
      return null;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const codesOf = (result: Record<string, unknown> | null) =>
    result && Array.isArray(result.backupCodes) ? (result.backupCodes as unknown[]).map(String) : [];
  const start = async (again: boolean) => {
    if (!password) return;
    const issued = await send("enable", { password });
    const list = codesOf(issued);
    if (!issued || list.length === 0) {
      if (issued) setError(t("factorNoCodesIssued"));
      return;
    }
    setPassword("");
    setCode("");
    setStored(false);
    setCopied(false);
    setSecret(setupKeyOf(typeof issued.totpURI === "string" ? issued.totpURI : ""));
    setCodes(list);
    // The row is now pending, and a pending enrolment is not protection.
    if (again) setFactor((value) => (value ? { ...value, pending: true } : value));
    else void load();
  };
  const confirmEnable = async () => {
    const result = await send("confirm", { code });
    setCode("");
    if (!result) return;
    setSecret("");
    setCodes([]);
    if (result.signedOut === true) onSignedOut("enabled");
    else void load();
  };
  const stepUpAction = async (route: "disable" | "recovery-codes") => {
    const result = await send(route, { password, code: stepUp });
    setPassword("");
    setStepUp("");
    if (!result) return;
    if (route === "disable") {
      setSecret("");
      setCodes([]);
      if (result.disabled === true) onSignedOut("disabled");
      return;
    }
    // A new set replaces the old one; the codes for it exist only in this response.
    setCodes(codesOf(result));
    setStored(false);
    setCopied(false);
    void load();
  };
  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // A blocked clipboard is not a failure of the codes: the list stays on screen.
      setCopied(false);
    }
  };
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedKey(true);
    } catch {
      setCopiedKey(false);
    }
  };
  const protectedReady = Boolean(password) && (TOTP_FORMAT.test(stepUp) || RECOVERY_FORMAT.test(stepUp));
  const enrolling = codes.length > 0 || secret !== "";
  const badge = factor === undefined ? null
    : factor.enabled ? t("factorStateOn")
    : factor.pending ? t("factorStatePending")
    : t("factorStateOff");
  return <Card><CardHeader><CardTitle><h2>{t("twoFactor")}</h2></CardTitle><CardDescription>{t("twoFactorDescription")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <Collapsible open={open} onOpenChange={changeOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="min-h-10 w-full flex-wrap justify-between gap-2 text-left">
            <span className="shrink-0">{open ? t("factorCollapse") : t("factorLoad")}</span>
            {badge && <Badge variant={factor?.enabled ? "default" : "secondary"}>{badge}</Badge>}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {status === "loading" && <Skeleton className="h-24 w-full" />}
          {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("factorLoadFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("activityRetry")}</Button></AlertDescription></Alert>}
          {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#two-factor", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
          {status !== "loading" && status !== "reauth" && factor && <>
            {!factor.enabled && !enrolling && <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{factor.pending ? t("factorPending") : t("factorOff")}</p>
              {factor.pending && <p className="text-sm text-muted-foreground">{t("factorPendingAgain")}</p>}
              <PasswordField label={t("currentPassword")} id="factor-current-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t("factorStartHint")}</p>
              <Button className="min-h-10" type="button" disabled={working || !password} onClick={() => void start(factor.pending)}>
                {working && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                {factor.pending ? t("factorStartAgain") : t("factorStart")}
              </Button>
            </div>}
            {enrolling && !factor.enabled && <div className="space-y-5">
              <p role="status" className="text-sm font-medium">{t("factorEnrolling")}</p>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("factorSetupHeading")}</h3>
                {secret
                  ? <div className="space-y-2">
                    <Label htmlFor="factor-setup-key">{t("factorSetupKey")}</Label>
                    {/* A wrapping, selectable field: the whole key has to be readable at
                        360px, because it is what the user types into their app by hand. */}
                    <Textarea id="factor-setup-key" readOnly rows={2} value={secret} className="w-full break-all font-mono select-all" onFocus={(event) => event.target.select()} />
                    <Button variant="outline" className="min-h-10" type="button" onClick={() => void copyKey()}>{copiedKey ? t("factorKeyCopied") : t("factorKeyCopy")}</Button>
                    <p className="text-xs text-muted-foreground">{t("factorSetupKeyHint")}</p>
                  </div>
                  : <p className="text-sm text-destructive">{t("factorNoSecret")}</p>}
              </div>
              <RecoveryCodes codes={codes} copied={copied} onCopy={() => void copyCodes()} heading={t("factorCodesHeading")} />
              {/* A toggle button rather than a checkbox: the row stays a 40px
                  target and the label is the control's own accessible name. */}
              <Button variant={stored ? "secondary" : "outline"} className="min-h-10 w-full justify-start text-left" type="button" aria-pressed={stored} onClick={() => setStored((value) => !value)}>
                {t("factorCodesAck")}
              </Button>
              <Alert><AlertDescription>{t("factorIrreversible")}</AlertDescription></Alert>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("factorConfirmHeading")}</h3>
                <Field label={t("factorCode")} id="factor-confirm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
                <p className="text-xs text-muted-foreground">{t("factorCodeHint")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{t("factorEffect")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="min-h-10" type="button" disabled={working || !stored || !TOTP_FORMAT.test(code)} onClick={() => setDialog("commit")}>{t("factorConfirmAction")}</Button>
                <Button variant="ghost" className="min-h-10" type="button" disabled={working} onClick={() => changeOpen(false)}>{t("factorDismiss")}</Button>
              </div>
            </div>}
            {factor.enabled && codes.length > 0 && <div className="space-y-4">
              <p role="status" className="text-sm font-medium">{t("factorReplaced")}</p>
              <RecoveryCodes codes={codes} copied={copied} onCopy={() => void copyCodes()} heading={t("factorCodesHeadingAgain")} />
              <p className="text-xs text-muted-foreground">{t("factorOldCodesGone")}</p>
              <Button variant="outline" className="min-h-10" type="button" onClick={() => { setCodes([]); setCopied(false); }}>{t("factorCodesDone")}</Button>
            </div>}
            {factor.enabled && codes.length === 0 && <div className="space-y-4">
              <p className="text-sm font-medium">{t("factorOn")}</p>
              <p className="text-sm text-muted-foreground">{t("factorEverySignIn")}</p>
              <p className="text-sm text-muted-foreground">{t("factorCodesLeft", { count: factor.codesRemaining })}</p>
              {factor.codesRemaining === 0 && <Alert><AlertDescription>{t("factorNoCodesLeft")}</AlertDescription></Alert>}
              <p className="text-xs leading-relaxed text-muted-foreground">{t("factorProtectNote")}</p>
              <PasswordField label={t("currentPassword")} id="factor-stepup-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              <Field label={t("factorStepUpCode")} id="factor-stepup-code" autoComplete="off" maxLength={11} value={stepUp} onChange={(event) => setStepUp(event.target.value)} error={stepUp && !protectedReady ? t("factorCodeFormat") : undefined} />
              <p className="text-xs text-muted-foreground">{t("factorStepUpHint")}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-10" type="button" disabled={working || !protectedReady} onClick={() => setDialog("regenerate")}>{t("factorRegenerate")}</Button>
                <Button variant="outline" className="min-h-10" type="button" disabled={working || !protectedReady} onClick={() => setDialog("disable")}>{t("factorDisable")}</Button>
              </div>
            </div>}
          </>}
        </CollapsibleContent>
      </Collapsible>
      <AlertDialog open={dialog !== null} onOpenChange={(value) => { if (!value && !working) setDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`factor${dialog === "commit" ? "Commit" : dialog === "disable" ? "Disable" : "Regenerate"}Title`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`factor${dialog === "commit" ? "Commit" : dialog === "disable" ? "Disable" : "Regenerate"}Body`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={working}>{t("factorDialogBack")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" onClick={() => {
              if (dialog === "commit") void confirmEnable();
              else if (dialog === "disable") void stepUpAction("disable");
              else if (dialog === "regenerate") void stepUpAction("recovery-codes");
            }}>{t(`factor${dialog === "commit" ? "Commit" : dialog === "disable" ? "Disable" : "Regenerate"}Confirm`)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent></Card>;
}
/** Passkeys (DESIGN §5.16). The browser is asked for a ceremony only from an explicit
 * action, and every reason a ceremony can fail gets its own words, because WebAuthn
 * reports "the person dismissed it" and "this device has no authenticator" the same way
 * to code that does not look. */
type PasskeyRow = { id: string; name: string; label: string; createdAt: number; synced: boolean };
function PasskeysCard() {
  const t = useTranslations("account");
  const locale = useLocale();
  const failure = useAccountError("passkeys");
  const [open, setOpen] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>();
  const [status, setStatus] = useState<"idle" | "loading" | "reauth" | "failed">("idle");
  const [factorOn, setFactorOn] = useState(false);
  // Capability is read once, after hydration: before that neither the button nor the
  // "this browser cannot" line is rendered, so the server and client never disagree.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [passkeyReady] = useState(() => passkeySupport().available);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [target, setTarget] = useState<PasskeyRow | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/passkeys", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) { setStatus("reauth"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      const data: { passkeys?: PasskeyRow[] } = await response.json();
      setPasskeys(data.passkeys ?? []);
      setStatus("idle");
    } catch { setStatus("failed"); }
  }, []);
  useEffect(() => {
    if (open && passkeys === undefined && status !== "failed") queueMicrotask(() => void load());
  }, [open, passkeys, status, load]);
  // Decided after mount: `window` is absent during the server render, and guessing
  // either way would flash the wrong message.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(async () => {
      try {
        const response = await fetch("/api/account/2fa", { cache: "no-store" });
        if (response.ok) setFactorOn(Boolean((await response.json()).twoFactor?.enabled));
      } catch { /* The code field simply stays hidden; the server still demands it. */ }
    });
  }, [open]);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) return;
    setPassword("");
    setCode("");
    setName("");
    setError("");
    setNotice("");
    setRenaming(null);
    setTarget(null);
  };
  const stepUp = (extra: Record<string, unknown>) => ({
    password,
    ...(factorOn && code ? { code } : {}),
    ...extra,
  });
  const call = async (path: string, body: Record<string, unknown>) => {
    if (busy.current) return false;
    busy.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await accountAction(path, body);
      return true;
    } catch (raised) {
      setError(failure(raised));
      return false;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const add = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    const chosen = name.trim();
    try {
      const started = await accountAction<WebAuthnOptions>("/api/account/passkeys/register/start", stepUp(chosen ? { name: chosen } : {}));
      let credential;
      try {
        credential = await createPasskey(started);
      } catch (raised) {
        // The challenge is spent whichever way this ends, so the only honest answer is
        // what the browser reported; the password field keeps its value for a retry.
        setError(t("passkeyCeremony_" + (raised instanceof CeremonyError ? raised.reason : "failed")));
        return;
      }
      await accountAction("/api/account/passkeys/register/finish", {
        response: credential,
        ...(chosen ? { name: chosen } : {}),
      });
      setName("");
      setPassword("");
      setCode("");
      setNotice(t("passkeyAdded"));
      await load();
    } catch (raised) {
      setError(failure(raised));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const rename = async (id: string, value: string) => {
    if (await call("/api/account/passkeys/rename", stepUp({ id, name: value }))) {
      setRenaming(null);
      await load();
    }
  };
  const remove = async () => {
    if (!target) return;
    if (await call("/api/account/passkeys/remove", stepUp({ id: target.id }))) {
      setTarget(null);
      setNotice(t("passkeyRemoved"));
      await load();
    }
  };
  const stamp = (ms: number) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));
  const ready = Boolean(password) && (!factorOn || Boolean(code));
  return <Card><CardHeader><CardTitle><h2>{t("passkeys")}</h2></CardTitle><CardDescription>{t("passkeysDescription")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <Collapsible open={open} onOpenChange={changeOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="min-h-10 w-full flex-wrap justify-between gap-2 text-left">
            <span className="shrink-0">{open ? t("passkeysCollapse") : t("passkeysManage")}</span>
            {passkeys && <Badge variant={passkeys.length ? "default" : "secondary"}>{t("passkeyCount", { count: passkeys.length })}</Badge>}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          {status === "loading" && <Skeleton className="h-24 w-full" />}
          {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("passkeysFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("activityRetry")}</Button></AlertDescription></Alert>}
          {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#passkeys", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
          {status !== "loading" && status !== "reauth" && status !== "failed" && <>
            {passkeys && passkeys.length === 0 && <p className="text-sm text-muted-foreground">{t("passkeysEmpty")}</p>}
            {passkeys && passkeys.length > 0 && <ul className="divide-y">
              {passkeys.map((passkey) => <li key={passkey.id} className="space-y-2 py-3">
                {renaming?.id === passkey.id ? <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1"><Field label={t("passkeyName")} id={`passkey-rename-${passkey.id}`} maxLength={40} value={renaming.value} onChange={(event) => setRenaming({ id: passkey.id, value: event.target.value })} /></div>
                  <Button className="min-h-10" disabled={working || !ready || !renaming.value.trim()} onClick={() => void rename(passkey.id, renaming.value.trim())}>{t("passkeySaveName")}</Button>
                  <Button variant="ghost" className="min-h-10" disabled={working} onClick={() => setRenaming(null)}>{t("cancel")}</Button>
                </div> : <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-medium">{passkey.name || t("passkeyUnnamed")}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {[passkey.label || t("passkeyUnknownAuthenticator"), stamp(passkey.createdAt), passkey.synced ? t("passkeySynced") : t("passkeySingleDevice")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="min-h-10" disabled={working} onClick={() => { setRenaming({ id: passkey.id, value: passkey.name }); setError(""); }}>{t("passkeyRename")}</Button>
                    <Button variant="outline" className="min-h-10" disabled={working} onClick={() => { setTarget(passkey); setError(""); }}>{t("passkeyRemove")}</Button>
                  </div>
                </div>}
              </li>)}
            </ul>}
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">{t("passkeyAddHeading")}</p>
              {mounted && !passkeyReady && <Alert><AlertDescription>{t("passkeyUnsupported")}</AlertDescription></Alert>}
              <p className="text-xs text-muted-foreground">{t("passkeysStepUp")}</p>
              <PasswordField label={t("currentPassword")} id="passkey-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {factorOn && <Field label={t("passkeyFactorCode")} id="passkey-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />}
              <Field label={t("passkeyName")} id="passkey-new-name" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("passkeyNamePlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("passkeyNameHint")}</p>
              <Button className="min-h-10" type="button" disabled={working || !ready || !passkeyReady} onClick={() => void add()}>
                {working && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                {t("passkeyAdd")}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("passkeysNote")}</p>
          </>}
        </CollapsibleContent>
      </Collapsible>
      <AlertDialog open={target !== null} onOpenChange={(value) => { if (!value && !working) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passkeyRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {t("passkeyRemoveBody", { name: target?.name || t("passkeyUnnamed") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={working}>{t("factorDialogBack")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" disabled={working || !ready} onClick={() => void remove()}>{t("passkeyRemoveConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent></Card>;
}

type DeletionState =
  | { status: "none" }
  | {
    status: "pending";
    requestedAt: number;
    eligibleAt: number;
    expiresAt: number;
    exportedAt: number | null;
    eligible: boolean;
  };

/**
 * Account deletion (DESIGN §5.17, ARCHITECTURE §5 "Account deletion").
 *
 * Nothing on this card deletes anything by itself. Requesting opens a cooling-off period
 * that touches no data, and the account only goes when the final ceremony completes after
 * it. That is why the card can promise withdrawal in one breath and irreversibility in the
 * next without contradicting itself.
 */
function DeletionCard({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const failure = useAccountError("deletion");
  const { user } = useAccount();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeletionState>();
  const [status, setStatus] = useState<"idle" | "loading" | "reauth" | "failed">("idle");
  const [factorOn, setFactorOn] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  // A controlled dialog has no Radix trigger to fall back to, so focus is restored by hand.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finalTrigger = useRef<HTMLButtonElement>(null);
  const closeFocus = useRef<"trigger" | "heading">("heading");
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/deletion", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) { setStatus("reauth"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      setState((await response.json()).deletion as DeletionState);
      setStatus("idle");
    } catch { setStatus("failed"); }
  }, []);
  useEffect(() => {
    if (open && state === undefined && status !== "failed") queueMicrotask(() => void load());
  }, [open, state, status, load]);
  useEffect(() => {
    if (!open) return;
    queueMicrotask(async () => {
      try {
        const response = await fetch("/api/account/2fa", { cache: "no-store" });
        if (response.ok) setFactorOn(Boolean((await response.json()).twoFactor?.enabled));
      } catch { /* The code field stays hidden; the server still demands it. */ }
    });
  }, [open]);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) return;
    setPassword("");
    setCode("");
    setConfirm("");
    setError("");
    setNotice("");
    setConfirming(false);
  };
  const stepUp = (extra: Record<string, unknown> = {}) => ({ password, ...(factorOn && code ? { code } : {}), ...extra });
  const call = async (path: string, body: Record<string, unknown>) => {
    if (busy.current) return null;
    busy.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      return await accountAction<Record<string, unknown>>(path, body);
    } catch (raised) {
      setError(failure(raised));
      return null;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const request = async () => {
    if (await call("/api/account/deletion/request", stepUp())) {
      setNotice(t("deletionRequested"));
      await load();
    }
  };
  const withdraw = async () => {
    if (await call("/api/account/deletion/withdraw", stepUp())) {
      setPassword("");
      setCode("");
      setNotice(t("deletionWithdrawn"));
      await load();
    }
  };
  const complete = async (event?: { preventDefault: () => void }) => {
    // The action would close the dialog as it fires, which is right for a confirmation and
    // wrong for a refusal: the reason has to stay next to the field that caused it.
    event?.preventDefault();
    const result = await call("/api/account/deletion/complete", stepUp({ confirm: confirm.trim() }));
    if (!result) {
      closeFocus.current = "trigger";
      return;
    }
    setConfirming(false);
    // The identity is gone on the server; this only drops what *this* browser kept for it.
    clearAccountState(user?.id ?? "");
    onDeleted();
  };
  const stamp = (ms: number) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));
  const ready = Boolean(password) && (!factorOn || Boolean(code));
  const canConfirm = ready && confirm.trim().length >= 3;
  const pending = state?.status === "pending" ? state : null;
  return <Card><CardHeader><CardTitle>
    <h2 ref={headingRef} tabIndex={-1} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("deletion")}</h2>
  </CardTitle><CardDescription>{t("deletionDescription")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <Collapsible open={open} onOpenChange={changeOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="min-h-10 w-full flex-wrap justify-between gap-2 text-left">
            <span className="shrink-0">{open ? t("deletionCollapse") : t("deletionManage")}</span>
            {state && <Badge variant={pending ? "default" : "secondary"}>{pending ? t("deletionBadgePending") : t("deletionBadgeNone")}</Badge>}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {error && !confirming && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          {status === "loading" && <Skeleton className="h-24 w-full" />}
          {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("deletionFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("activityRetry")}</Button></AlertDescription></Alert>}
          {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#deletion", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
          {status !== "loading" && status !== "reauth" && status !== "failed" && state && <>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("deletionImpactHeading")}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("deletionImpactAccount")}</li>
                <li>{t("deletionImpactChat")}</li>
                <li>{t("deletionImpactMail")}</li>
                <li>{t("deletionImpactBackups")}</li>
              </ul>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium">{t("deletionExportHeading")}</p>
              <p className="text-xs text-muted-foreground">{t("deletionExportHint")}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-10" asChild><a href="#export">{t("deletionExportLink")}</a></Button>
                {pending?.exportedAt
                  ? <p role="status" className="self-center text-sm text-muted-foreground">{t("deletionExportDone", { at: stamp(pending.exportedAt) })}</p>
                  : <p className="self-center text-sm text-muted-foreground">{t("deletionExportMissing")}</p>}
              </div>
            </div>
            {pending ? <div className="space-y-3">
              <p className="text-sm">{t("deletionPending", { requested: stamp(pending.requestedAt) })}</p>
              <p className="text-xs text-muted-foreground">{pending.eligible
                ? t("deletionAvailableNow", { lapses: stamp(pending.expiresAt) })
                : t("deletionAvailableOn", { available: stamp(pending.eligibleAt), lapses: stamp(pending.expiresAt) })}</p>
              <div className="flex flex-wrap gap-2">
                <PasswordField label={t("currentPassword")} id="deletion-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
                {factorOn && <Field label={t("passkeyFactorCode")} id="deletion-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />}
                <Button variant="outline" className="min-h-10 self-end" disabled={working || !ready} onClick={() => void withdraw()}>{t("deletionWithdraw")}</Button>
                {pending.eligible && <Button
                  ref={finalTrigger}
                  variant="destructive"
                  className="min-h-10 self-end"
                  disabled={working || !ready || !pending.exportedAt}
                  onClick={() => { closeFocus.current = "heading"; setError(""); setConfirming(true); }}
                >{t("deletionFinalButton")}</Button>}
              </div>
              {!pending.exportedAt && <p className="text-xs text-muted-foreground">{t("deletionExportNeededHint")}</p>}
            </div> : <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("deletionRequestHint")}</p>
              <PasswordField label={t("currentPassword")} id="deletion-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              {factorOn && <Field label={t("passkeyFactorCode")} id="deletion-factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />}
              <Button className="min-h-10" variant="outline" disabled={working || !ready} onClick={() => void request()}>{t("deletionRequest")}</Button>
            </div>}
          </>}
        </CollapsibleContent>
      </Collapsible>
      <AlertDialog open={confirming} onOpenChange={(value) => {
        if (value) return;
        if (!working) { setConfirming(false); closeFocus.current = "trigger"; }
      }}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (closeFocus.current === "trigger" && finalTrigger.current?.isConnected) { finalTrigger.current.focus(); return; }
          headingRef.current?.focus();
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deletionConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="break-words space-y-2">
              <span className="block">{t("deletionConfirmBody", { email })}</span>
              <span className="block">{t("deletionConfirmBackups")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <PasswordField label={t("currentPassword")} id="deletion-confirm-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
            {factorOn && <Field label={t("passkeyFactorCode")} id="deletion-confirm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />}
            <Field label={t("deletionConfirmLabel")} id="deletion-confirm-email" type="email" autoComplete="off" maxLength={320} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            <p className="text-xs text-muted-foreground">{t("deletionConfirmHint", { email })}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={working}>{t("factorDialogBack")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" disabled={working || !canConfirm} onClick={(event) => void complete(event)}>{t("deletionConfirmAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("deletionNote")}</p>
    </CardContent></Card>;
}

/** Shown in place of the account centre once the deletion has completed. It holds no
 * personal data: the account it describes no longer exists. */
function DeletionNotice() {
  const t = useTranslations("account");
  return <div className="space-y-3">
    <h1 className="font-display text-2xl font-semibold">{t("deletionNoticeHeading")}</h1>
    <p className="text-sm text-muted-foreground">{t("deletionNoticeBody")}</p>
    <Button variant="outline" className="min-h-10" asChild><Link href="/">{t("deletionBackHome")}</Link></Button>
  </div>;
}

type EmailTransaction = {
  id: string;
  maskedNewEmail: string;
  expiresAt: number;
  attemptsLeft: { old: number; new: number };
};
type EmailMoved = { changedTo: string; oldEmail: string; notified: boolean };

/** Committing revokes every session, so the result belongs to the page rather than
 * to a card that can no longer assume a signed-in identity. */
function EmailMovedNotice({ moved }: { moved: EmailMoved }) {
  const t = useTranslations("account");
  return <Card role="region" aria-label={t("emailDoneTitle")}><CardHeader><CardTitle><h2>{t("emailDoneTitle")}</h2></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="break-all text-sm font-medium">{t("emailDone", { email: moved.changedTo })}</p>
      <p className="text-sm text-muted-foreground">{t("emailSignedOut")}</p>
      {/* A notification failure is its own fact: the address already changed. */}
      {!moved.notified && <Alert><AlertDescription className="break-all">{t("emailNoticeFailed", { email: moved.oldEmail })}</AlertDescription></Alert>}
      <Button className="min-h-10" asChild><Link href={accountLink("login", "/")}>{t("loginWithNewEmail")}</Link></Button>
    </CardContent>
  </Card>;
}
/** Secure email change (DESIGN §5.13). Two codes, one per mailbox: the sign-in
 * address is written only after both are confirmed and a running AI request has
 * reached a confirmed terminal state. */
function EmailCard({
  email,
  onFreshness,
  onMoved,
}: {
  email: string;
  onFreshness: (stale: boolean) => void;
  onMoved: (moved: EmailMoved) => void;
}) {
  const t = useTranslations("account");
  const failure = useAccountError("email");
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{ siteKey: string; available: boolean }>();
  const [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(0);
  const [transaction, setTransaction] = useState<EmailTransaction | null | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "loading" | "reauth" | "failed">("idle");
  const [password, setPassword] = useState("");
  const [target, setTarget] = useState("");
  const [codes, setCodes] = useState({ old: "", new: "" });
  const [error, setError] = useState("");
  // Accepted by the server but with no live transaction: the target already belongs
  // to an account. Stated without confirming or denying that registration.
  const [blind, setBlind] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [dialog, setDialog] = useState<"cancel" | "commit" | null>(null);
  const [committing, setCommitting] = useState(false);
  // The ref is the same-frame guard; `working` is what the buttons may read, because
  // a ref must never be consulted during render.
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async (): Promise<EmailTransaction | null> => {
    setStatus("loading");
    let next: EmailTransaction | null = null;
    try {
      const response = await fetch("/api/account/email", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) { setTransaction(null); setStatus("reauth"); onFreshness(true); return null; }
      if (!response.ok) { setTransaction(null); setStatus("failed"); onFreshness(false); return null; }
      const data: { pending?: EmailTransaction | null } = await response.json();
      next = data.pending ?? null;
      setStatus("idle");
      onFreshness(false);
    } catch { setTransaction(null); setStatus("failed"); return null; }
    setTransaction(next);
    return next;
  }, [onFreshness]);
  // `undefined` means "never read yet", so opening the card loads once and a reload
  // restores a live transaction instead of silently discarding it.
  useEffect(() => {
    if (open && transaction === undefined) queueMicrotask(() => void load());
  }, [open, transaction, load]);
  useEffect(() => {
    fetch("/api/auth-config", { cache: "no-store" })
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => setConfig({ siteKey: "", available: false }));
  }, []);
  useEffect(() => {
    if (!transaction) return;
    const tick = () => setRemaining(transaction.expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [transaction]);
  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => clearInterval(id);
  }, [cooldown]);
  // A language switch reloads the document, so remember that a draft exists.
  const draft = password !== "" || target !== "";
  useEffect(() => {
    if (!draft) return;
    return markUnsaved("email");
  }, [draft]);
  const expired = transaction !== null && transaction !== undefined && remaining <= 0;
  const sameAddress = target.trim().toLowerCase() === email.toLowerCase();
  const clock = `${Math.floor(Math.max(0, remaining) / 60_000)}:${String(Math.floor((Math.max(0, remaining) % 60_000) / 1_000)).padStart(2, "0")}`;
  const send = async (route: string, body: Record<string, unknown>) => {
    if (busy.current) return false;
    busy.current = true;
    setWorking(true);
    setError("");
    let ok = false;
    try {
      await accountAction(`/api/account/email/${route}`, body);
      ok = true;
    } catch (raised) {
      setError(failure(raised));
      if (isUnconfirmedError(raised)) void load();
    } finally {
      busy.current = false;
      setWorking(false);
      // Every accepted attempt consumes its token, so a fresh challenge is issued
      // before another email can be sent.
      setToken("");
      setChallenge((value) => value + 1);
    }
    return ok;
  };
  const start = async () => {
    if (!password || !target || sameAddress) return;
    if (!(await send("start", { password, newEmail: target, turnstileToken: token }))) return;
    setPassword("");
    setTarget("");
    setCodes({ old: "", new: "" });
    setBlind((await load()) === null);
  };
  const resend = async (side: "old" | "new") => {
    if (!transaction || cooldown) return;
    if (await send("resend", { id: transaction.id, side, turnstileToken: token })) {
      // Matches the server's one send per address per minute, so the button does not
      // invite an attempt the limiter would refuse.
      setCooldown(60);
      setCodes({ old: "", new: "" });
      setBlind(false);
      await load();
    }
  };
  const cancel = async () => {
    if (!transaction) return;
    if (await send("cancel", { id: transaction.id })) {
      setCodes({ old: "", new: "" });
      setBlind(false);
      await load();
    }
  };
  const commit = async () => {
    if (busy.current || !transaction) return;
    busy.current = true;
    setWorking(true);
    setError("");
    setCommitting(true);
    const retiring = email;
    try {
      const result = await accountAction<{ changedTo: string; notified: boolean }>("/api/account/email/verify", {
        id: transaction.id, oldCode: codes.old, newCode: codes.new,
      });
      onMoved({ changedTo: result.changedTo, oldEmail: retiring, notified: result.notified !== false });
    } catch (raised) {
      setCommitting(false);
      setError(failure(raised));
      void load();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const siteKey = config?.available ? config.siteKey : "";
  const challengeReady = Boolean(siteKey);
  return <Card><CardHeader><CardTitle><h2>{t("emailSection")}</h2></CardTitle><CardDescription>{t("emailDescription")}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="min-h-10 w-full flex-wrap justify-between gap-2 text-left">
            <span className="shrink-0">{open ? t("emailCollapse") : t("emailChange")}</span>
            {transaction && !expired && <Badge variant="secondary" className="max-w-full min-w-0 truncate">{t("emailPendingBadge", { email: transaction.maskedNewEmail })}</Badge>}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {status === "loading" && <Skeleton className="h-24 w-full" />}
          {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("emailLoadFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("emailRetry")}</Button></AlertDescription></Alert>}
          {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#email", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
          {status !== "reauth" && status !== "loading" && (!transaction || expired) && <div className="space-y-4">
            {expired && <p role="status" className="text-sm text-destructive">{t("emailExpired")}</p>}
            {blind && <p role="status" className="text-sm text-destructive">{t("emailNoTransaction")}</p>}
            <p className="text-sm text-muted-foreground">{t("emailIntro")}</p>
            <Alert><AlertDescription>{t("emailOldMailboxNote")}</AlertDescription></Alert>
            <div className="space-y-2">
              <PasswordField label={t("currentPassword")} id="email-current-password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); setBlind(false); }} />
              <Field label={t("emailNewAddress")} id="email-new-address" type="email" autoComplete="email" maxLength={254} value={target} onChange={(event) => { setTarget(event.target.value); setBlind(false); }} error={target && sameAddress ? t("emailSame") : undefined} />
              <p className="text-xs text-muted-foreground">{t("emailCodesNote")}</p>
            </div>
            {challengeReady && <Challenge key={challenge} siteKey={siteKey} onToken={setToken} />}
            {config && !config.available && <p role="status" className="text-sm text-muted-foreground">{t("emailServiceUnavailable")}</p>}
            <Button className="min-h-10" type="button" disabled={!challengeReady || working || !token || !password || !target || sameAddress} onClick={() => void start()}>
              {working && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
              {t("emailStart")}
            </Button>
          </div>}
          {transaction && !expired && status !== "reauth" && <div className="space-y-4">
            <p role="status" className="break-all text-sm font-medium">{t("emailPendingSent", { email: transaction.maskedNewEmail })}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("emailExpiresIn", { time: clock })}</span>
              <Badge variant="secondary">{t("emailAttemptsLeft", { old: transaction.attemptsLeft.old, new: transaction.attemptsLeft.new })}</Badge>
            </div>
            {/* A new code needs a fresh challenge, exactly like the reset flow's
                resend, so the widget lives in this panel too. */}
            {challengeReady && <div className="space-y-2">
              <p className="text-sm font-medium">{t("emailChallengeHeading")}</p>
              <Challenge key={challenge} siteKey={siteKey} onToken={setToken} />
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-10" disabled={!challengeReady || working || cooldown > 0 || !token} onClick={() => void resend("old")}>{cooldown > 0 ? t("emailResendWait", { seconds: cooldown }) : t("emailResendOld")}</Button>
              <Button variant="outline" className="min-h-10" disabled={!challengeReady || working || cooldown > 0 || !token} onClick={() => void resend("new")}>{cooldown > 0 ? t("emailResendWait", { seconds: cooldown }) : t("emailResendNew")}</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-40 flex-1"><Field label={t("emailCodeOld")} id="email-code-old" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes.old} onChange={(event) => setCodes((value) => ({ ...value, old: event.target.value }))} /></div>
              <div className="min-w-40 flex-1"><Field label={t("emailCodeNew")} id="email-code-new" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes.new} onChange={(event) => setCodes((value) => ({ ...value, new: event.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">{t("emailEffect")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="min-h-10" disabled={committing || working || !/^\d{6}$/.test(codes.old) || !/^\d{6}$/.test(codes.new)} onClick={() => setDialog("commit")}>
                {committing && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                {t("emailConfirm")}
              </Button>
              <Button variant="outline" className="min-h-10" disabled={working || committing} onClick={() => setDialog("cancel")}>{t("emailCancel")}</Button>
            </div>
          </div>}
        </CollapsibleContent>
      </Collapsible>
      <AlertDialog open={dialog !== null} onOpenChange={(value) => { if (!value && !working) setDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog === "cancel" ? t("emailCancelTitle") : t("emailCommitTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {dialog === "cancel"
                ? t("emailCancelBody", { email: transaction?.maskedNewEmail ?? "" })
                : t("emailCommitBody", { email: transaction?.maskedNewEmail ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10" disabled={working}>{t("emailDialogBack")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" onClick={() => (dialog === "cancel" ? void cancel() : void commit())}>
              {dialog === "cancel" ? t("emailCancelConfirm") : t("emailCommitConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent>
  </Card>;
}
/** Read-only list of the account's own confirmed security changes (DESIGN §5.14).
 * It never derives a row from the session list, and it never shows a device, address
 * or count the server did not record. */
function ActivityCard() {
  const t = useTranslations("account");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>();
  const [retentionDays, setRetentionDays] = useState<number>();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "reauth" | "failed">("idle");
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/account/activity", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (response.status === 403) { setStatus("reauth"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      const data: { events?: SecurityEvent[]; retentionDays?: number } = await response.json();
      if (!data.events) { setStatus("failed"); return; }
      setEvents(data.events);
      setRetentionDays(data.retentionDays);
      setStatus("ready");
    } catch { setStatus("failed"); }
  }, []);
  useEffect(() => {
    if (open && status === "idle") queueMicrotask(() => void load());
  }, [open, status, load]);
  // Component options rather than dateStyle/timeStyle: those cannot be combined with
  // timeZoneName, and the zone label is the point — the list is shown in the
  // browser's own zone, so it has to say which one.
  const stamp = (ms: number) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));
  return <Card><CardHeader><CardTitle><h2>{t("activity")}</h2></CardTitle><CardDescription>{t("activityDescription")}</CardDescription></CardHeader><CardContent>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="min-h-10 w-full justify-between gap-2 text-left">
          <span>{open ? t("activityCollapse") : t("activityLoad")}</span>
          {events && <span className="text-xs font-normal text-muted-foreground">{t("activityCount", { count: events.length })}</span>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        {status === "loading" && <Skeleton className="h-24 w-full" />}
        {status === "failed" && <Alert><AlertDescription className="space-y-2"><p>{t("activityFailed")}</p><Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("activityRetry")}</Button></AlertDescription></Alert>}
        {status === "reauth" && <Alert><AlertDescription className="space-y-2"><p>{t("reauth")}</p><Button variant="outline" className="min-h-10" asChild><Link href={accountLink("login", "/account#activity", true)}>{t("refreshLogin")}</Link></Button></AlertDescription></Alert>}
        {status === "ready" && events && (events.length === 0
          ? <div className="space-y-1">
            <p role="status" className="text-sm font-medium">{t("activityEmpty")}</p>
            {/* An empty list is not an untouched account: earlier operations simply
                predate this record, and saying so is the honest state. */}
            <p className="text-xs text-muted-foreground">{t("activityEmptyNote")}</p>
          </div>
          : <ul className="divide-y">
            {events.map((event) => <li key={event.id} className="space-y-1 py-3">
              <p className="text-sm font-medium">{t("activityKind_" + event.kind)}</p>
              <p className="break-words text-xs text-muted-foreground">{stamp(event.occurredAt)} · {event.browser} · {event.system}</p>
              {event.kind === "email_change" && event.maskedEmail && <p className="break-all text-xs text-muted-foreground">{t("activityEmailTarget", { email: event.maskedEmail })}</p>}
              {event.kind === "session_revoke_others" && event.sessionsAffected !== undefined && <p className="text-xs text-muted-foreground">{t("activityRevokeCount", { count: event.sessionsAffected })}</p>}
            </li>)}
          </ul>)}
        {status === "ready" && <p className="text-xs leading-relaxed text-muted-foreground">{t("activityRetention", { days: retentionDays ?? 0 })}</p>}
        {status === "ready" && <p className="text-xs leading-relaxed text-muted-foreground">{t("activityPrivacy")}</p>}
        {status === "ready" && events && events.length > 0 && <Button variant="outline" className="min-h-10" onClick={() => void load()}>{t("activityRefresh")}</Button>}
      </CollapsibleContent>
    </Collapsible>
  </CardContent></Card>;
}
export function AccountCenter() {
  const { user, loading, failed, refresh, preferences } = useAccount();
  const t = useTranslations("account");
  const [staleSession, setStaleSession] = useState(false);
  const [moved, setMoved] = useState<EmailMoved | null>(null);
  // Turning the factor on or off revokes every session, so the outcome outranks the
  // signed-in page exactly like an email commit does.
  const [factorChange, setFactorChange] = useState<"enabled" | "disabled" | null>(null);
  // A completed deletion outranks the signed-in page the same way, and unlike the factor
  // notices it can never be shown again: there is no account left to describe.
  const [deleted, setDeleted] = useState(false);
  const handleFreshness = useCallback((stale: boolean) => setStaleSession(stale), []);
  // Right after a commit the identity is gone, so the result outranks the signed-in
  // page. A different login clears it: only the account that retired `oldEmail`
  // should still see that commit's outcome.
  if (moved && (!user || moved.oldEmail === user.email)) return <div className="mx-auto max-w-2xl space-y-6"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><EmailMovedNotice moved={moved} /></div>;
  if (deleted && !user) return <div className="mx-auto max-w-2xl space-y-6"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><DeletionNotice /></div>;
  if (factorChange && !user) return <div className="mx-auto max-w-2xl space-y-6"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><FactorNotice state={factorChange} /></div>;
  if (!user) return <div className="mx-auto max-w-2xl space-y-4"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1>{loading ? <Skeleton className="h-48 w-full" /> : failed ? <><p role="alert">{t("actionFailed")}</p><Button className="min-h-10" onClick={() => void refresh()}>{t("retryAccount")}</Button></> : <><p>{t("sessionExpired")}</p><Button className="min-h-10" asChild><Link href={accountLink("login", "/account")}>{t("login")}</Link></Button></>}</div>;
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("centerDescription")}</p></div>{failed && <Alert><AlertDescription>{t("actionFailed")} <Button className="min-h-10" variant="outline" onClick={() => void refresh()}>{t("retryAccount")}</Button></AlertDescription></Alert>}<Summary user={user} /><section id="profile" className="scroll-mt-24"><Profile key={`profile:${user.id}`} user={user} /></section><section id="preferences" className="scroll-mt-24">{preferences ? <PreferencesCard key={`preferences:${user.id}`} saved={preferences} /> : <Skeleton className="h-64 w-full" />}</section><section id="security" className="scroll-mt-24"><Password key={`password:${user.id}`} reauthNeeded={staleSession} /></section><section id="two-factor" className="scroll-mt-24"><TwoFactorCard key={`two-factor:${user.id}`} onSignedOut={setFactorChange} /></section><section id="passkeys" className="scroll-mt-24"><PasskeysCard key={`passkeys:${user.id}`} /></section><section id="email" className="scroll-mt-24"><EmailCard key={`email:${user.id}`} email={user.email} onFreshness={handleFreshness} onMoved={setMoved} /></section><section id="sessions" className="scroll-mt-24"><Sessions key={`sessions:${user.id}`} onFreshness={handleFreshness} /></section><section id="activity" className="scroll-mt-24"><ActivityCard key={`activity:${user.id}`} /></section><section id="usage" className="scroll-mt-24"><UsageCard key={`usage:${user.id}`} /></section><section id="export" className="scroll-mt-24"><ExportCard key={`export:${user.id}`} onFreshness={handleFreshness} /></section><section id="deletion" className="scroll-mt-24"><DeletionCard key={`deletion:${user.id}`} email={user.email} onDeleted={() => setDeleted(true)} /></section></div>;
}
