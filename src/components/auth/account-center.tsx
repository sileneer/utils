"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { accountAction, useAccount } from "./account-provider";

type LoginSession = { id: string; current: boolean; createdAt: string; expiresAt: string; browser: string; system: string };
function Field({ label, error, id, ...props }: React.ComponentProps<typeof Input> & { label: string; error?: string; id: string }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input {...props} id={id} className="h-11" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : props["aria-describedby"]} />{error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
function useAccountError() {
  const t = useTranslations("account");
  return (error: unknown) => t(({ rate_limited: "limited", reauth_required: "reauth", unauthorized: "sessionExpired", stop_unconfirmed: "securityFailed", account_busy: "securityFailed", auth_failed: "passwordWrong" } as Record<string, string>)[error instanceof Error ? error.message : ""] ?? "actionFailed");
}
function Profile({ user }: { user: AccountUser }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const failure = useAccountError();
  const [error, setError] = useState("");
  const schema = z.object({ name: z.string().trim().min(1, t("required")).max(80, t("nameHint")) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), values: { name: user.name }, reValidateMode: "onChange" });
  return <Card><CardHeader><CardTitle><h2>{t("profile")}</h2></CardTitle><CardDescription>{t("profileDescription")}</CardDescription></CardHeader><CardContent className="space-y-5">
    <dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">{t("email")}</dt><dd className="mt-1 break-all">{user.email} <Badge variant="secondary">{t("emailVerified")}</Badge></dd></div><div><dt className="text-muted-foreground">{t("joined")}</dt><dd className="mt-1">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(user.createdAt))}</dd></div></dl>
    <form className="space-y-4" onSubmit={handleSubmit(async (values) => {
      setError("");
      try { await accountAction("/api/account/profile", values); toast.success(t("profileSaved")); }
      catch (e) { setError(failure(e)); }
    })}>
      <Field label={t("displayName")} id="profile-name" autoComplete="nickname" maxLength={80} {...register("name")} error={errors.name?.message} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="min-h-10" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t("saveProfile")}</Button>
    </form>
  </CardContent></Card>;
}
function Password() {
  const t = useTranslations("account");
  const failure = useAccountError();
  const [error, setError] = useState("");
  const schema = z.object({
    currentPassword: z.string().min(1, t("required")).max(128, t("passwordHint")),
    newPassword: z.string().min(8, t("passwordHint")).max(128, t("passwordHint")).regex(/[A-Za-z]/, t("passwordHint")).regex(/[0-9]/, t("passwordHint")),
    confirm: z.string(),
  }).refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: t("passwordMismatch") });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" }, reValidateMode: "onChange" });
  return <Card><CardHeader><CardTitle><h2>{t("changePassword")}</h2></CardTitle><CardDescription>{t("passwordDescription")}</CardDescription></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={handleSubmit(async ({ currentPassword, newPassword }) => {
      setError("");
      try { await accountAction("/api/account/password", { currentPassword, newPassword }); reset(); toast.success(t("passwordChanged")); }
      catch (e) { setError(failure(e)); }
    })}>
      <Field label={t("currentPassword")} id="current-password" type="password" autoComplete="current-password" maxLength={128} {...register("currentPassword")} error={errors.currentPassword?.message} />
      <Field label={t("newPassword")} id="new-password" type="password" autoComplete="new-password" maxLength={128} aria-describedby="change-password-hint" {...register("newPassword")} error={errors.newPassword?.message} />
      <p id="change-password-hint" className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      <Field label={t("confirmPassword")} id="confirm-password" type="password" autoComplete="new-password" maxLength={128} {...register("confirm")} error={errors.confirm?.message} />
      <p className="text-sm text-muted-foreground">{t("securityEffect")}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
      <Button className="min-h-10" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" />}{t("changePassword")}</Button>
      <Link className="inline-flex min-h-10 items-center text-sm underline underline-offset-4" href={accountLink("reset-password", "/account")}>{t("forgot")}</Link>
      </div>
    </form>
  </CardContent></Card>;
}
function Sessions({ userId }: { userId: string }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const failure = useAccountError();
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ id: string } | { others: true }>();
  const [mutationError, setMutationError] = useState("");
  const version = useRef(0);
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  const schema = z.object({ password: z.string().min(1, t("required")).max(128, t("passwordHint")) });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const load = useCallback(async () => {
    const generation = ++version.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/account/sessions", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "service_unavailable");
      if (generation === version.current) setSessions(data.sessions);
    } catch (e) { if (generation === version.current) { setSessions([]); setError(e instanceof Error ? e.message : "service_unavailable"); } }
    finally { if (generation === version.current) setLoading(false); }
  }, []);
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
  const revoke = handleSubmit(async ({ password }) => {
          if (!target) return;
          setMutationError("");
          try { await accountAction("/api/account/sessions/revoke", { ...target, password }); choose(undefined); toast.success(t("sessionsRevoked")); }
          catch (e) { setMutationError(failure(e)); }
        });
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  function choose(value: typeof target) { setMutationError(""); reset(); setTarget(value); }
  return <Card><CardHeader><CardTitle><h2>{t("sessions")}</h2></CardTitle><CardDescription>{t("sessionsDescription")}</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="flex flex-wrap gap-2"><Button className="min-h-10" variant="outline" onClick={() => void load()} disabled={loading || isSubmitting}>{t("refreshSessions")}</Button>{sessions.some((s) => !s.current) && <Button className="min-h-10" variant="outline" onClick={(event) => { revokeTrigger.current = event.currentTarget; choose({ others: true }); }} disabled={loading || isSubmitting}>{t("logoutOthers")}</Button>}</div>
    {loading ? <Skeleton className="h-24 w-full" /> : error ? <Alert><AlertDescription>{failure(new Error(error))}{error === "reauth_required" && <Link className="mt-2 inline-flex min-h-10 items-center underline" href={accountLink("login", "/account")}>{t("loginAgain")}</Link>}</AlertDescription></Alert> : sessions.length === 0 ? <p className="text-sm text-muted-foreground">{t("noSessions")}</p> : <ul className="divide-y">{sessions.map((s) => <li key={s.id} className="flex flex-wrap items-start gap-3 py-4">
      <Monitor className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 basis-40 space-y-1"><p className="font-medium">{s.browser === "unknown" ? t("unknownBrowser") : s.browser} · {s.system === "unknown" ? t("unknownSystem") : s.system}</p>{s.current && <Badge variant="secondary">{t("currentSession")}</Badge>}<p className="text-xs text-muted-foreground">{t("sessionCreated", { date: date(s.createdAt) })}</p><p className="text-xs text-muted-foreground">{t("sessionExpires", { date: date(s.expiresAt) })}</p></div>
      {!s.current && <Button variant="outline" className="min-h-10" disabled={isSubmitting} onClick={(event) => { revokeTrigger.current = event.currentTarget; choose({ id: s.id }); }}>{t("revokeSession")}</Button>}
    </li>)}</ul>}
    <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !isSubmitting) choose(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); revokeTrigger.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{t("revokeConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("securityEffect")}</AlertDialogDescription></AlertDialogHeader>
        <form id={`revoke-${userId}`} className="space-y-3" onSubmit={revoke}><Field id="revoke-password" label={t("currentPassword")} type="password" autoComplete="current-password" maxLength={128} {...register("password")} error={errors.password?.message} />{mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}</form>
        <AlertDialogFooter><AlertDialogCancel className="min-h-10" disabled={isSubmitting}>{t("cancel")}</AlertDialogCancel><AlertDialogAction className="min-h-10" type="submit" form={`revoke-${userId}`} disabled={isSubmitting} onClick={(e) => { e.preventDefault(); void revoke(); }}>{t("revokeSession")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </CardContent></Card>;
}
export function AccountCenter() {
  const { user, loading, failed, refresh } = useAccount();
  const t = useTranslations("account");
  if (!user) return <div className="mx-auto max-w-2xl space-y-4"><h1 className="font-display text-3xl font-semibold">{t("center")}</h1>{loading ? <Skeleton className="h-48 w-full" /> : failed ? <><p role="alert">{t("actionFailed")}</p><Button className="min-h-10" onClick={() => void refresh()}>{t("retryAccount")}</Button></> : <><p>{t("sessionExpired")}</p><Button className="min-h-10" asChild><Link href={accountLink("login", "/account")}>{t("login")}</Link></Button></>}</div>;
  return <div className="mx-auto max-w-2xl space-y-6"><div><h1 className="font-display text-3xl font-semibold">{t("center")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("centerDescription")}</p></div>{failed && <Alert><AlertDescription>{t("actionFailed")} <Button className="min-h-10" variant="outline" onClick={() => void refresh()}>{t("retryAccount")}</Button></AlertDescription></Alert>}<Profile key={`profile:${user.id}`} user={user} /><Password key={`password:${user.id}`} /><Sessions key={`sessions:${user.id}`} userId={user.id} /></div>;
}
