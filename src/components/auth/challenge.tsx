"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

type TurnstileAPI = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
type ChallengeState = "loading" | "ready" | "expired" | "failed" | "script";

/**
 * Cloudflare Turnstile with explicit, user-bounded recovery for every non-ready
 * state. Shared by the public auth forms and the account centre's mail-sending
 * operations so a challenge cannot behave differently on the two surfaces.
 */
export function Challenge({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (value: string) => void;
}) {
  const t = useTranslations("account");
  const node = useRef<HTMLDivElement>(null),
    widget = useRef<string>(undefined);
  const [state, setState] = useState<ChallengeState>("loading");
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [scriptAttempt, setScriptAttempt] = useState(0);
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
  // `onReady` alone is not a dependable load signal: Next reuses a same-src tag
  // without reporting ready again, and Cloudflare rejects `turnstile.ready()` while
  // the tag is async/deferred. The global only exists once api.js has executed, so
  // it is the authoritative signal, and a timeout becomes the explicit retryable
  // script-error state instead of a silent permanent "loading".
  useEffect(() => {
    if (state !== "loading") return;
    let tries = 0;
    const id = setInterval(() => {
      if (window.turnstile) {
        clearInterval(id);
        setState("ready");
        return;
      }
      if (++tries >= 50) {
        clearInterval(id);
        setState("script");
      }
    }, 200);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => {
    if (state !== "ready" || !node.current || !window.turnstile) return;
    onToken("");
    try {
      widget.current = window.turnstile.render(node.current, {
        sitekey: siteKey,
        size: compact ? "compact" : "flexible",
        theme: resolvedTheme === "dark" ? "dark" : "light",
        language: locale === "zh" ? "zh-cn" : "en",
        callback: onToken,
        "expired-callback": () => {
          onToken("");
          setState("expired");
        },
        "error-callback": () => {
          onToken("");
          setState("failed");
        },
      });
    } catch {
      // A rejected render must surface as the explicit failed state, not crash the form.
      queueMicrotask(() => setState("failed"));
      return;
    }
    return () => {
      if (widget.current) {
        window.turnstile?.remove(widget.current);
        widget.current = undefined;
      }
    };
  }, [state, widgetAttempt, siteKey, onToken, locale, compact, resolvedTheme]);
  // Explicit, user-bounded retry: reload the script only when it never loaded.
  function retry() {
    onToken("");
    setWidgetAttempt((value) => value + 1);
    if (state === "script" || !window.turnstile) {
      setScriptAttempt((value) => value + 1);
      setState("loading");
    } else setState("ready");
  }
  const scriptSrc = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit${scriptAttempt ? `&retry=${scriptAttempt}` : ""}`;
  const message =
    state === "expired"
      ? t("challengeExpired")
      : state === "failed"
        ? t("challengeFailed")
        : state === "script"
          ? t("challengeScriptFailed")
          : null;
  return (
    <>
      <Script
        key={scriptAttempt}
        src={scriptSrc}
        // The default `lazy` strategy loads only once the node is in the viewport,
        // so a widget mounted below the fold — the account centre's collapsed card —
        // would never report ready. This component only mounts when it is needed.
        strategy="afterInteractive"
        onReady={() => setState("ready")}
        onError={() => setState("script")}
      />
      <div ref={node} className="flex min-h-16 w-full justify-center" />
      {state === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("challengeLoading")}
        </p>
      )}
      {message && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-destructive">
            {message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            onClick={retry}
          >
            {t("challengeRetry")}
          </Button>
        </div>
      )}
    </>
  );
}
