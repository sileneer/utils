"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { accountLink, safeReturnTo } from "@/lib/auth/navigation";
import { notifyAccountChange } from "@/lib/auth/events";
import { useAccount } from "./account-provider";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordField } from "./password-field";
import { Challenge } from "./challenge";
import {
  CeremonyError,
  passkeySupport,
  requestPasskey,
} from "@/lib/passkey-browser";

type Mode = "login" | "register" | "verify" | "reset";
type Values = { email: string; password: string; otp: string; name: string };
/** Mirrors the plugin's `twoFactorCookieMaxAge`, after which the challenge is gone
 * and only a fresh sign-in can mint another one. */
const FACTOR_WINDOW = 600;
const RECOVERY_FORMAT = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;
export function AccountForm({
  mode,
  returnTo = "/",
  reauth = false,
}: {
  mode: Mode;
  returnTo?: string;
  reauth?: boolean;
}) {
  const destination = safeReturnTo(returnTo);
  const { user } = useAccount();
  const t = useTranslations("account"),
    router = useRouter();
  const [config, setConfig] = useState<{
    siteKey: string;
    available: boolean;
  }>();
  const [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(0);
  const [resetStep, setResetStep] = useState(false),
    [complete, setComplete] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [wait, setWait] = useState(0),
    [resending, setResending] = useState(false);
  // The sign-in stopped at the second factor: no session exists until it is answered.
  const [factorStep, setFactorStep] = useState(false);
  const [factorEmail, setFactorEmail] = useState("");
  const [factorWait, setFactorWait] = useState(0),
    [factorBusy, setFactorBusy] = useState(false);
  const [totp, setTotp] = useState(""),
    [recovery, setRecovery] = useState("");
  // Guards against a same-frame repeat click or held Enter key; `disabled` only
  // applies after a render, and every action here is a security-sensitive write.
  const pending = useRef(false);
  // Copy-only variant for a stale (24h) session; it changes no server contract.
  const reauthMode = mode === "login" && reauth;
  const schema = z.object({
    email: z.email(t("emailInvalid")).max(254, t("emailInvalid")),
    password:
      mode === "register" || (mode === "reset" && resetStep)
        ? z
            .string()
            .min(8, t("passwordHint"))
            .max(128, t("passwordHint"))
            .regex(/[A-Za-z]/, t("passwordHint"))
            .regex(/[0-9]/, t("passwordHint"))
        : mode === "login"
          ? z.string().min(1, t("required"))
          : z.string(),
    otp:
      mode === "verify" || (mode === "reset" && resetStep)
        ? z.string().regex(/^\d{6}$/, t("codeInvalid"))
        : z.string(),
    name: z.string().max(80, t("nameHint")),
  });
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", otp: "", name: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  useEffect(() => {
    fetch("/api/auth-config", { cache: "no-store" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ siteKey: "", available: false }));
    try {
      setValue("email", sessionStorage.getItem("utils_verify_email") || "");
    } catch {
      /* Storage optional. */
    }
  }, [setValue]);
  // A passkey button is only meaningful once the browser's own capability is known, and
  // that never changes during a page's life: render nothing until after hydration rather
  // than guessing twice and flashing.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [passkeyReady] = useState(() => passkeySupport().available);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  useEffect(() => {
    if (!factorWait) return;
    const timer = setTimeout(() => setFactorWait((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [factorWait]);
  async function post(url: string, body: object): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40_000),
      });
    } catch {
      // Offline/timeout/abort: no confirmed server outcome.
      throw new Error("network_unknown");
    }
    let data: Record<string, unknown> = {};
    try {
      data = await response.json();
    } catch {
      /* Edge/proxy responses may not be JSON. */
    }
    if (!response.ok)
      throw new Error(
        (typeof data.error === "string" && data.error) ||
          (response.status === 429 ? "rate_limited" : "auth_failed"),
      );
    return data;
  }
  async function request(path: string, body: object) {
    try {
      return await post(`/api/auth/${path}`, body);
    } finally {
      setToken("");
      setChallenge((n) => n + 1);
    }
  }
  /** `passkey` picks the passkey wording for the codes the two surfaces share: a spent
   * challenge means a different thing after a passkey prompt than after a TOTP one. */
  function failure(error: unknown, passkey = false) {
    const code = error instanceof Error ? error.message : "";
    setError(
      t(
        (
          {
            rate_limited: "limited",
            challenge_failed: "challengeError",
            service_unavailable: "serviceFailed",
            mail_send_failed: "mailFailed",
            stop_unconfirmed: "securityFailed",
            account_busy: "securityFailed",
            network_unknown: "networkFailed",
            // Each second-factor failure is its own fact; a dead challenge or an
            // exhausted budget never reads like a wrong password.
            challenge_gone: passkey ? "passkeyChallengeGone" : "factorChallengeGone",
            attempts_exhausted: "factorAttemptsExhausted",
            locked: "factorLocked",
            code_failed: "factorCodeWrong",
            recovery_failed: "factorRecoveryWrong",
            signed_in: "factorSignedIn",
            // A passkey sign-in can fail for its own reasons, none of which is a
            // wrong password.
            assertion_failed: "passkeyAssertionFailed",
            not_user_verified: "passkeyNotVerified",
            not_found: "passkeyAssertionFailed",
          } as Record<string, string>
        )[code] || "failed",
      ),
    );
  }
  function startFactor(address: string) {
    setFactorEmail(address);
    setFactorStep(true);
    setFactorWait(FACTOR_WINDOW);
    setTotp("");
    setRecovery("");
  }
  async function submit(values: Values) {
    if (pending.current) return;
    setError("");
    setNotice("");
    const email = values.email.trim().toLowerCase();
    pending.current = true;
    try {
      try {
        sessionStorage.setItem("utils_verify_email", email);
      } catch {
        /* Optional. */
      }
      if (mode === "register") {
        await request("sign-up/email", {
          email,
          password: values.password,
          name: values.name.trim() || t("defaultName"),
          turnstileToken: token,
        });
        setValue("password", "");
        router.push(accountLink("verify-email", destination));
      } else if (mode === "login") {
        const result = await request("sign-in/email", {
          email,
          password: values.password,
        });
        if (result.twoFactorRequired === true) {
          // The credential step created no usable identity; the challenge cookie is
          // the only state, and it expires on its own.
          setValue("password", "");
          startFactor(email);
          return;
        }
        notifyAccountChange();
        setValue("password", "");
        router.push(destination);
        router.refresh();
      } else if (mode === "verify") {
        await request("email-otp/verify-email", { email, otp: values.otp });
        setValue("otp", "");
        setComplete(true);
      } else if (!resetStep) {
        await request("email-otp/request-password-reset", {
          email,
          turnstileToken: token,
        });
        setResetStep(true);
        setWait(60);
        setNotice(t("sentGeneric"));
      } else {
        await request("email-otp/reset-password", {
          email,
          otp: values.otp,
          password: values.password,
        });
        setValue("password", "");
        setValue("otp", "");
        notifyAccountChange();
        setComplete(true);
      }
    } catch (error) {
      // The account exists after sign-up even when the first verification
      // email fails; point at the verification page instead of a generic error.
      if (mode === "register" && error instanceof Error && error.message === "mail_send_failed")
        setError(t("mailFailedRegister"));
      else failure(error);
    } finally {
      pending.current = false;
    }
  }
  // Leave the second reset step with the old code and password cleared; the
  // challenge is re-issued before a new email can receive a code again.
  function restartReset() {
    setResetStep(false);
    setError("");
    setNotice("");
    setValue("otp", "");
    setValue("password", "");
    setChallenge((n) => n + 1);
  }
  async function resend() {
    const email = getValues("email").trim().toLowerCase();
    if (!z.email().safeParse(email).success) {
      setError(t("emailInvalid"));
      return;
    }
    setResending(true);
    setError("");
    setNotice("");
    try {
      await request(
        mode === "reset"
          ? "email-otp/request-password-reset"
          : "email-otp/send-verification-otp",
        mode === "reset"
          ? { email, turnstileToken: token }
          : { email, type: "email-verification", turnstileToken: token },
      );
      setWait(60);
      setNotice(t("sentGeneric"));
    } catch (error) {
      failure(error);
    } finally {
      setResending(false);
    }
  }
  /**
   * Signs in with a passkey the browser already holds. Nothing here asks who the user
   * is: the credential names the account, and the server decides whether it opens one.
   */
  async function signInWithPasskey() {
    if (pending.current) return;
    setError("");
    setNotice("");
    pending.current = true;
    setPasskeyBusy(true);
    try {
      let response: Response;
      try {
        response = await fetch("/api/passkey/options", { cache: "no-store" });
      } catch {
        throw new Error("network_unknown");
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "auth_failed");
      }
      const credential = await requestPasskey(await response.json());
      await post("/api/passkey/verify", { response: credential });
      notifyAccountChange();
      setValue("password", "");
      router.push(destination);
      router.refresh();
    } catch (error) {
      if (error instanceof CeremonyError) setError(t("passkeyCeremony_" + error.reason));
      else failure(error, true);
    } finally {
      pending.current = false;
      setPasskeyBusy(false);
    }
  }
  const needsChallenge =
    mode === "register" || mode === "verify" || mode === "reset";
  const sending = mode === "register" || (mode === "reset" && !resetStep);
  /** Leave the challenge with every credential cleared; the next attempt is a
   * fresh sign-in, not a retry of the same code. */
  function endFactor() {
    setFactorStep(false);
    setFactorWait(0);
    setTotp("");
    setRecovery("");
    setFactorEmail("");
    setError("");
    setNotice("");
  }
  async function answerFactor(url: string, code: string) {
    if (pending.current) return;
    setError("");
    setNotice("");
    pending.current = true;
    setFactorBusy(true);
    try {
      await post(url, { code });
      notifyAccountChange();
      endFactor();
      router.push(destination);
      router.refresh();
    } catch (raised) {
      const cause = raised instanceof Error ? raised.message : "";
      failure(raised);
      setTotp("");
      setRecovery("");
      // The challenge itself is gone, so the countdown is stopped at zero rather
      // than left counting down to a step that can no longer be completed.
      if (
        cause === "challenge_gone" ||
        cause === "attempts_exhausted" ||
        cause === "signed_in" ||
        cause === "not_found"
      )
        setFactorWait(0);
    } finally {
      pending.current = false;
      setFactorBusy(false);
    }
  }
  // A dead or expired challenge leaves only a restart: saying "try the code again"
  // would imply the same one can still be spent.
  const factorExpired = factorWait <= 0;
  const factorClock = `${Math.floor(Math.max(0, factorWait) / 60)}:${String(
    Math.max(0, factorWait) % 60,
  ).padStart(2, "0")}`;
  function field(
    name: keyof Values,
    label: string,
    props: React.ComponentProps<typeof Input>,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={`account-${name}`}>{label}</Label>
        <Input
          id={`account-${name}`}
          className="h-11"
          {...register(name)}
          {...props}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
        {errors[name] && (
          <p
            id={`${name}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {errors[name]?.message}
          </p>
        )}
      </div>
    );
  }
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>
            {reauthMode
              ? t("reauthTitle")
              : factorStep
                ? t("factorTitle")
                : t(`${mode}Title`)}
          </h1>
        </CardTitle>
        <CardDescription>
          {reauthMode
            ? t("reauthDescription")
            : factorStep
              ? t("factorDescription")
              : t(`${mode}Description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {user && (mode === "login" || mode === "register") && !reauthMode && !factorStep && <div className="space-y-2"><p className="text-sm">{t("signedIn", { name: user.name })}</p><Button variant="outline" asChild><Link href={destination}>{t("continue")}</Link></Button></div>}
        {user && reauthMode && <p className="text-sm text-muted-foreground">{t("reauthSignedIn", { name: user.name })}</p>}
        {!config ? (
          <Skeleton className="h-24 w-full" />
        ) : complete ? (
          <div className="space-y-4">
            <p role="status">
              {t(mode === "verify" ? "verified" : "resetDone")}
            </p>
            <Button asChild className="h-11 w-full">
              <Link href={accountLink("login", destination)}>{t("login")}</Link>
            </Button>
          </div>
        ) : factorStep ? (
          <div className="space-y-5">
            <p className="break-all text-sm">{t("factorAccount", { email: factorEmail })}</p>
            <p className="text-sm text-muted-foreground">{t("factorNoSession")}</p>
            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
            {factorExpired ? (
              <div className="space-y-4">
                <p role="status" className="text-sm text-destructive">{t("factorGone")}</p>
                <Button variant="outline" className="h-11 w-full" onClick={endFactor}>{t("factorRestart")}</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("factorExpiresIn", { time: factorClock })}</p>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (/^\d{6}$/.test(totp)) void answerFactor("/api/2fa/verify", totp);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="account-factor-code">{t("factorCode")}</Label>
                    <Input
                      id="account-factor-code"
                      className="h-11"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={totp}
                      onChange={(event) => setTotp(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t("factorCodeHint")}</p>
                  </div>
                  <Button type="submit" className="h-11 w-full" disabled={factorBusy || !/^\d{6}$/.test(totp)}>
                    {factorBusy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                    {t("factorVerify")}
                  </Button>
                </form>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (RECOVERY_FORMAT.test(recovery.trim())) void answerFactor("/api/2fa/recovery", recovery.trim());
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="account-recovery-code">{t("factorRecovery")}</Label>
                    <Input
                      id="account-recovery-code"
                      className="h-11"
                      autoComplete="off"
                      maxLength={11}
                      value={recovery}
                      onChange={(event) => setRecovery(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t("factorRecoveryHint")}</p>
                  </div>
                  <Button type="submit" variant="outline" className="h-11 w-full" disabled={factorBusy || !RECOVERY_FORMAT.test(recovery.trim())}>
                    {factorBusy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
                    {t("factorRecoveryAction")}
                  </Button>
                </form>
              </>
            )}
          </div>
        ) : (
          <>
            {!config.available && (
              <Alert>
                <AlertDescription>{t("unavailable")}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={(event) => void handleSubmit(submit)(event)} className="space-y-4">
              {field("email", t("email"), {
                type: "email",
                autoComplete: "email",
                maxLength: 254,
                readOnly: mode === "reset" && resetStep,
              })}
              {mode === "register" &&
                field("name", t("name"), {
                  autoComplete: "nickname",
                  maxLength: 80,
                })}
              {(mode === "register" ||
                mode === "login" ||
                (mode === "reset" && resetStep)) && (
                <>
                  <PasswordField
                    label={t(mode === "reset" ? "newPassword" : "password")}
                    id="account-password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    maxLength={128}
                    descriptionId={mode !== "login" ? "password-hint" : undefined}
                    {...register("password")}
                    error={errors.password?.message}
                  />
                  {mode !== "login" && (
                    <p
                      id="password-hint"
                      className="text-xs text-muted-foreground"
                    >
                      {t("passwordHint")}
                    </p>
                  )}
                </>
              )}
              {(mode === "verify" || (mode === "reset" && resetStep)) && (
                <>
                  {field("otp", t("code"), {
                    autoComplete: "one-time-code",
                    inputMode: "numeric",
                    maxLength: 6,
                  })}
                  <p className="text-xs text-muted-foreground">
                    {t("codeHint")}
                  </p>
                </>
              )}
              {needsChallenge && config.siteKey && (
                <Challenge
                  key={challenge}
                  siteKey={config.siteKey}
                  onToken={setToken}
                />
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              )}
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={
                  !config.available ||
                  isSubmitting ||
                  resending ||
                  (sending && !token)
                }
              >
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                )}
                {reauthMode
                  ? t("reauthAction")
                  : t(
                      mode === "reset" && !resetStep
                        ? "sendCode"
                        : mode === "reset"
                          ? "savePassword"
                          : mode === "verify"
                            ? "verify"
                            : mode,
                    )}
              </Button>
              {mode === "login" && !reauthMode && mounted && (
                <div className="space-y-2">
                  {!passkeyReady && (
                    <p className="text-xs text-muted-foreground">{t("passkeyUnavailable")}</p>
                  )}
                  {passkeyReady && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full"
                        disabled={passkeyBusy || isSubmitting}
                        onClick={() => void signInWithPasskey()}
                      >
                        {passkeyBusy && (
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        )}
                        {t("passkeySignIn")}
                      </Button>
                      <p className="text-xs text-muted-foreground">{t("passkeySignInHint")}</p>
                    </>
                  )}
                </div>
              )}
              {(mode === "verify" || (mode === "reset" && resetStep)) && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={
                    !token ||
                    wait > 0 ||
                    resending ||
                    isSubmitting ||
                    !config.available
                  }
                  onClick={() => void resend()}
                >
                  {wait ? t("resendWait", { seconds: wait }) : t("resend")}
                </Button>
              )}
              {mode === "reset" && resetStep && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full"
                  disabled={isSubmitting || resending}
                  onClick={restartReset}
                >
                  {t("resetChangeEmail")}
                </Button>
              )}
            </form>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {mode !== "login" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href={accountLink("login", destination)}
                >
                  {t("login")}
                </Link>
              )}
              {mode !== "register" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href={accountLink("register", destination)}
                >
                  {t("register")}
                </Link>
              )}
              {mode === "register" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href={accountLink("verify-email", destination)}
                >
                  {t("verify")}
                </Link>
              )}
              {mode === "login" && (
                <>
                  <Link
                    className="inline-flex min-h-10 items-center underline underline-offset-4"
                    href={accountLink("reset-password", destination)}
                  >
                    {t("forgot")}
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center underline underline-offset-4"
                    href={accountLink("verify-email", destination)}
                  >
                    {t("verify")}
                  </Link>
                </>
              )}
            </div>
          </>
        )}
        <Link
          href={destination}
          className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </CardContent>
    </Card>
  );
}
