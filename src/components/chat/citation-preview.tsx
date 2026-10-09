"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { parsePreview, type EntryPreview } from "@/lib/chat/source-preview";
import type { Citation } from "@/lib/chat/citations";

export type SourceDisclosure = {
  open: boolean;
  entry?: EntryPreview;
  failed?: boolean;
};

export function CitationPreview({
  citation,
  revision,
  canNavigate,
  onNavigate,
  remembered,
  onRemember,
}: {
  citation: Citation;
  revision?: string;
  canNavigate: boolean;
  onNavigate: () => void;
  remembered?: SourceDisclosure;
  onRemember: (value: SourceDisclosure) => void;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(remembered?.open ?? false);
  const [entry, setEntry] = useState<EntryPreview | undefined>(remembered?.entry);
  const [failed, setFailed] = useState(remembered?.failed ?? false);
  const [retry, setRetry] = useState(0);
  const remember = useEffectEvent(onRemember);

  useEffect(() => {
    if (!open || !revision || entry || failed) return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    let current = true;
    const params = new URLSearchParams({
      revision,
      section: String(citation.section),
      item: String(citation.item),
    });
    void fetch("/api/book/entry?" + params, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("source_unavailable");
        return parsePreview(await response.json(), revision, {
          section: citation.section,
          item: citation.item,
          anchor: citation.anchor,
        });
      })
      .then((value) => {
        if (!current) return;
        setEntry(value);
        remember({ open: true, entry: value });
      })
      .catch(() => {
        if (!current) return;
        setFailed(true);
        remember({ open: true, failed: true });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      current = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [
    open, revision, citation.section, citation.item, citation.anchor,
    retry, entry, failed,
  ]);

  return (
    <Collapsible
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setFailed(false);
        onRemember({ open: value, entry, failed: value ? false : failed });
      }}
      className="min-w-0 rounded-lg border bg-background/50"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="min-h-10 h-auto w-full justify-between whitespace-normal px-3 py-2 text-left text-xs"
        >
          {t("citation", { section: citation.section, item: citation.item })}
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-3 text-xs">
        {!revision || failed ? (
          <div className="space-y-2">
            <p role="status">{t("sourceUnavailable")}</p>
            {revision && (
              <Button
                variant="outline"
                className="h-10 text-xs"
                onClick={() => {
                  setFailed(false);
                  setEntry(undefined);
                  setRetry((value) => value + 1);
                  onRemember({ open: true });
                }}
              >
                {t("retry")}
              </Button>
            )}
          </div>
        ) : !entry ? (
          <div role="status" aria-label={t("sourceLoading")}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-16 w-full" />
          </div>
        ) : (
          <>
            <p className="font-medium">{entry.title}</p>
            <blockquote
              className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-primary pl-2 leading-relaxed"
              tabIndex={0}
            >
              {entry.excerpt}
            </blockquote>
            <p className="text-muted-foreground">
              {t("previewScope")}
              {entry.truncated && " " + t("previewTruncated")}
            </p>
            <p className="text-muted-foreground">
              {t("sourceRevision")}:{" "}
              <span className="font-mono">{revision.slice(0, 8)}</span>
            </p>
            <Button
              variant="outline"
              className="h-10 text-xs"
              disabled={!canNavigate}
              onClick={onNavigate}
            >
              {t("openSource")}
            </Button>
            {!canNavigate && (
              <p role="status" className="text-muted-foreground">
                {t("sourceLocationMissing")}
              </p>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
