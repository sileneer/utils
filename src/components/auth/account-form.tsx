"use client";
import { useEffect, useRef, useState } from "react";
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

type Mode = "login" | "register" | "verify" | "reset";
type Values = { email: string; password: string; otp: string; name: string };
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
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  async function request(path: string, body: object) {
    try {
      let response: Response;
      try {
        response = await fetch(`/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(40_000),
        });
      } catch {
        // Offline/timeout/abort: no confirmed server outcome.
        throw new Error("network_unknown");
      }
      let data: { error?: string } = {};
      try {
        data = await response.json();
      } catch {
        /* Edge/proxy responses may not be JSON. */
      }
      if (!response.ok)
        throw new Error(
          data.error ||
            (response.status === 429 ? "rate_limited" : "auth_failed"),
        );
    } finally {
      setToken("");
      setChallenge((n) => n + 1);
    }
  }
  function failure(error: unknown) {
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
          } as Record<string, string>
        )[code] || "failed",
      ),
    );
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
        await request("sign-in/email", { email, password: values.password });
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
  const needsChallenge =
    mode === "register" || mode === "verify" || mode === "reset";
  const sending = mode === "register" || (mode === "reset" && !resetStep);
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
          <h1>{reauthMode ? t("reauthTitle") : t(`${mode}Title`)}</h1>
        </CardTitle>
        <CardDescription>
          {reauthMode ? t("reauthDescription") : t(`${mode}Description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {user && (mode === "login" || mode === "register") && !reauthMode && <div className="space-y-2"><p className="text-sm">{t("signedIn", { name: user.name })}</p><Button variant="outline" asChild><Link href={destination}>{t("continue")}</Link></Button></div>}
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
