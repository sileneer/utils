"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

type Mode = "login" | "register" | "verify" | "reset";
type Values = { email: string; password: string; otp: string; name: string };
type TurnstileAPI = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
function notifyAccountChange() {
  try {
    localStorage.setItem("utils_auth_changed", String(Date.now()));
  } catch {
    /* Optional. */
  }
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
function Challenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (value: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null),
    widget = useRef<string>(undefined);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(true);
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  useEffect(() => {
    if (!node.current) return;
    const observer = new ResizeObserver((entries) =>
      setCompact(entries[0].contentRect.width < 300),
    );
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ready || !node.current || !window.turnstile) return;
    onToken("");
    widget.current = window.turnstile.render(node.current, {
      sitekey: siteKey,
      size: compact ? "compact" : "flexible",
      theme: resolvedTheme === "dark" ? "dark" : "light",
      language: locale === "zh" ? "zh-cn" : "en",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    };
  }, [ready, siteKey, onToken, locale, compact, resolvedTheme]);
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setReady(true)}
      />
      <div ref={node} className="flex min-h-16 w-full justify-center" />
    </>
  );
}
export function AccountForm({ mode }: { mode: Mode }) {
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
  const schema = z.object({
    email: z.email(t("emailInvalid")).max(254, t("emailInvalid")),
    password:
      mode === "register" || (mode === "reset" && resetStep)
        ? z.string().min(12, t("passwordHint")).max(128, t("passwordHint"))
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
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "auth_failed");
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
            service_unavailable: "unavailable",
            mail_send_failed: "mailFailed",
          } as Record<string, string>
        )[code] || "failed",
      ),
    );
  }
  async function submit(values: Values) {
    setError("");
    setNotice("");
    const email = values.email.trim().toLowerCase();
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
        router.push("/verify-email");
      } else if (mode === "login") {
        await request("sign-in/email", { email, password: values.password });
        notifyAccountChange();
        setValue("password", "");
        router.push("/htlb");
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
        setComplete(true);
      }
    } catch (error) {
      failure(error);
    }
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
        { email, type: "email-verification", turnstileToken: token },
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
          aria-describedby={
            errors[name]
              ? `${name}-error`
              : name === "password" && mode !== "login"
                ? "password-hint"
                : undefined
          }
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
          <h1>{t(`${mode}Title`)}</h1>
        </CardTitle>
        <CardDescription>{t(`${mode}Description`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!config ? (
          <Skeleton className="h-24 w-full" />
        ) : complete ? (
          <div className="space-y-4">
            <p role="status">
              {t(mode === "verify" ? "verified" : "resetDone")}
            </p>
            <Button asChild className="h-11 w-full">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
        ) : (
          <>
            {!config.available && (
              <Alert>
                <AlertDescription>{t("unavailable")}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit(submit)} className="space-y-4">
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
                  {field(
                    "password",
                    t(mode === "reset" ? "newPassword" : "password"),
                    {
                      type: "password",
                      autoComplete:
                        mode === "login" ? "current-password" : "new-password",
                      maxLength: 128,
                    },
                  )}
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
                {t(
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
            </form>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {mode !== "login" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href="/login"
                >
                  {t("login")}
                </Link>
              )}
              {mode !== "register" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href="/register"
                >
                  {t("register")}
                </Link>
              )}
              {mode === "register" && (
                <Link
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                  href="/verify-email"
                >
                  {t("verify")}
                </Link>
              )}
              {mode === "login" && (
                <>
                  <Link
                    className="inline-flex min-h-10 items-center underline underline-offset-4"
                    href="/reset-password"
                  >
                    {t("forgot")}
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center underline underline-offset-4"
                    href="/verify-email"
                  >
                    {t("verify")}
                  </Link>
                </>
              )}
            </div>
          </>
        )}
        <Link
          href="/htlb"
          className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </CardContent>
    </Card>
  );
}
