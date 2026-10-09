"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { agentModelName, type AgentModel } from "@/lib/agent/models";
import { totalTokens } from "@/lib/chat/details";
import type { ChatMessage } from "@/lib/chat/protocol";
export function MessageDetails({
  message,
  models,
  stage,
  startedAt,
}: {
  message: ChatMessage;
  models: AgentModel[];
  stage: string;
  startedAt: number;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const [elapsed, setElapsed] = useState(0);
  const live = message.status === "streaming" || message.status === "pending";
  useEffect(() => {
    if (!live) return;
    const tick = () => setElapsed(Math.max(0, Date.now() - startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [live, startedAt]);
  const sent = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(message.at);
  if (message.role === "user")
    return (
      <time
        dateTime={new Date(message.at).toISOString()}
        className="mt-2 block text-xs text-muted-foreground"
      >
        {t("sentAt", { time: sent })}
      </time>
    );
  const details = message.details;
  const number = (value: number | undefined) =>
    value === undefined ? t("notReported") : value.toLocaleString(locale);
  const seconds = (ms: number) =>
    (ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 });
  const duration = live
    ? t("elapsed", { seconds: Math.floor(elapsed / 1000) })
    : details?.durationMs === undefined
      ? t("timeUnavailable")
      : t(details.timingEstimated ? "approxDuration" : "duration", {
          seconds: seconds(details.durationMs),
        });
  const total = details?.tokens ? totalTokens(details.tokens) : undefined;
  const status = live
    ? t(stage)
    : t(
        message.status === "complete"
          ? "completed"
          : message.status === "stopped"
            ? "stoppedStatus"
            : "failedStatus",
      );
  return (
    <Collapsible className="mt-3 border-t pt-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
        {live && (
          <Loader2
            aria-hidden="true"
            className="size-3.5 animate-spin motion-reduce:animate-none"
          />
        )}
        <span role="status" aria-live="polite">
          {status}
        </span>
        <span>· {duration}</span>
        <span>
          ·{" "}
          {total === undefined
            ? t(live ? "tokensPending" : "tokensUnavailable")
            : t("tokenTotal", { count: number(total) })}
        </span>
      </div>
      {live && details?.searchCalls !== undefined && (
        <p className="mt-1">
          {t("toolCounts", {
            search: details.searchCalls,
            read: details.readCalls ?? 0,
          })}
        </p>
      )}
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-10 max-w-full px-0 text-xs text-muted-foreground"
        >
          {t("messageDetails")}
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-1">
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3 gap-y-2 [&>dd]:min-w-0 [&>dd]:break-words">
          <dt>{t("sentTime")}</dt>
          <dd>{sent}</dd>
          <dt>{t("model")}</dt>
          <dd>
            {details?.model ? agentModelName(details.model, models) : t("notReported")}
          </dd>
          <dt>{t("durationLabel")}</dt>
          <dd>{duration}</dd>
          <dt>{t("firstText")}</dt>
          <dd>
            {details?.firstTextMs === undefined
              ? t("notReported")
              : t("elapsed", { seconds: seconds(details.firstTextMs) })}
          </dd>
          <dt>{t("inputTokens")}</dt>
          <dd>{number(details?.tokens?.input)}</dd>
          <dt>{t("outputTokens")}</dt>
          <dd>{number(details?.tokens?.output)}</dd>
          <dt>{t("cacheReadTokens")}</dt>
          <dd>{number(details?.tokens?.cacheRead)}</dd>
          <dt>{t("cacheWriteTokens")}</dt>
          <dd>{number(details?.tokens?.cacheWrite)}</dd>
          <dt>{t("bookSearches")}</dt>
          <dd>{number(details?.searchCalls)}</dd>
          <dt>{t("bookReads")}</dt>
          <dd>{number(details?.readCalls)}</dd>
          {message.revision && (
            <>
              <dt>{t("sourceRevision")}</dt>
              <dd className="font-mono">{message.revision.slice(0, 8)}</dd>
            </>
          )}
        </dl>
        <p className="leading-relaxed">{t("tokenScope")}</p>
        {details?.timingEstimated && (
          <p className="leading-relaxed">{t("timingNote")}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
