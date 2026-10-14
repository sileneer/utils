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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PasswordField } from "./password-field";
import { accountAction, useAccount, useAccountError } from "./account-provider";
import { isUnconfirmedError } from "@/lib/auth/errors";
import { hasUnsaved, markUnsaved } from "@/lib/unsaved";
import { readDeviceTheme } from "@/lib/theme-device";
import type { Availability } from "@/lib/chat/history";
import type { Preferences as AccountPreferences } from "@/lib/auth/preferences";
import type { ExportSummary } from "@/lib/auth/export";

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
    { id: "sessions", label: t("sessions") },
    { id: "usage", label: t("usage") },
    { id: "export", label: t("export") },
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
export function AccountCenter() {
  const { user, loading, failed, refresh, preferences } = useAccount();
  const t = useTranslations("account");
  const [staleSession, setStaleSession] = useState(false);
  const handleFreshness = useCallback((stale: boolean) => setStaleSession(stale), []);
  if (!user) return <div className="mx-auto max-w-2xl space-y-4"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1>{loading ? <Skeleton className="h-48 w-full" /> : failed ? <><p role="alert">{t("actionFailed")}</p><Button className="min-h-10" onClick={() => void refresh()}>{t("retryAccount")}</Button></> : <><p>{t("sessionExpired")}</p><Button className="min-h-10" asChild><Link href={accountLink("login", "/account")}>{t("login")}</Link></Button></>}</div>;
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("centerDescription")}</p></div>{failed && <Alert><AlertDescription>{t("actionFailed")} <Button className="min-h-10" variant="outline" onClick={() => void refresh()}>{t("retryAccount")}</Button></AlertDescription></Alert>}<Summary user={user} /><section id="profile" className="scroll-mt-24"><Profile key={`profile:${user.id}`} user={user} /></section><section id="preferences" className="scroll-mt-24">{preferences ? <PreferencesCard key={`preferences:${user.id}`} saved={preferences} /> : <Skeleton className="h-64 w-full" />}</section><section id="security" className="scroll-mt-24"><Password key={`password:${user.id}`} reauthNeeded={staleSession} /></section><section id="sessions" className="scroll-mt-24"><Sessions key={`sessions:${user.id}`} onFreshness={handleFreshness} /></section><section id="usage" className="scroll-mt-24"><UsageCard key={`usage:${user.id}`} /></section><section id="export" className="scroll-mt-24"><ExportCard key={`export:${user.id}`} onFreshness={handleFreshness} /></section></div>;
}
