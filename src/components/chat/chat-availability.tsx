"use client";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Availability } from "@/lib/chat/history";
export function ChatAvailability({
  quota,
  onRefresh,
}: {
  quota?: Availability;
  onRefresh: () => void;
}) {
  const t = useTranslations("chat"),
    locale = useLocale();
  if (!quota) return null;
  const reset = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(quota.resetAt);
  return (
    <Collapsible className="shrink-0 border-b px-3 text-xs text-muted-foreground">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto min-h-10 w-full justify-between gap-2 whitespace-normal px-0 text-left text-xs"
        >
          <span>
            {t("quotaSummary", {
              remaining: quota.remaining,
              limit: quota.limit,
            })}
          </span>
          <span>{t("availability_" + quota.service)}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-2">
        <p>{t("quotaReset", { time: reset, used: quota.used })}</p>
        <p className="leading-relaxed">{t("quotaScope")}</p>
        <Button variant="outline" className="h-10 text-xs" onClick={onRefresh}>
          {t("refreshQuota")}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
