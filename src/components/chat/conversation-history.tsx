"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { ConversationPage, ConversationSummary } from "@/lib/chat/history";
export function ConversationHistory({
  version,
  onOpen,
  onUpdate,
}: {
  version: number;
  onOpen: (id: string) => Promise<boolean>;
  onUpdate: (
    id: string,
    change: { title?: string; archived?: boolean },
  ) => Promise<void>;
}) {
  const t = useTranslations("chat"),
    locale = useLocale(),
    searchId = useId(),
    titleId = useId();
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false);
  const [items, setItems] = useState<ConversationSummary[]>([]),
    [cursor, setCursor] = useState<string>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string>(),
    [busy, setBusy] = useState<string>(),
    [refresh, setRefresh] = useState(0);
  const request = useRef<AbortController | null>(null);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t("titleLength"))
          .max(100, t("titleLength")),
      }),
    ),
    defaultValues: { title: "" },
  });
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(undefined);
      setItems([]);
      setCursor(undefined);
      try {
        const params = new URLSearchParams({
          q: query,
          archived: archived ? "1" : "0",
        });
        const response = await fetch("/api/agent/conversations?" + params, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const page: ConversationPage = await response.json();
        if (!controller.signal.aborted) {
          setItems(page.items);
          setCursor(page.cursor);
        }
      } catch {
        if (!controller.signal.aborted) setError("historyFailed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [query, archived, version, refresh]);
  async function more() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(undefined);
    const controller = request.current;
    try {
      const params = new URLSearchParams({
        q: query,
        archived: archived ? "1" : "0",
        cursor,
      });
      const response = await fetch("/api/agent/conversations?" + params, {
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error();
      const page: ConversationPage = await response.json();
      if (controller === request.current && !controller?.signal.aborted) {
        setItems((previous) => [
          ...new Map(
            [...previous, ...page.items].map((item) => [item.id, item]),
          ).values(),
        ]);
        setCursor(page.cursor);
      }
    } catch {
      if (controller === request.current && !controller?.signal.aborted)
        setError("historyFailed");
    } finally {
      if (controller === request.current && !controller?.signal.aborted)
        setLoading(false);
    }
  }
  async function mutate(
    id: string,
    changes: { title?: string; archived?: boolean },
  ) {
    setBusy(id);
    setError(undefined);
    try {
      await onUpdate(id, changes);
      setEditing(undefined);
      setRefresh((v) => v + 1);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === "busy"
          ? "historyBusy"
          : failure instanceof Error && failure.message === "stop_unconfirmed"
            ? "stop_unconfirmed"
            : "historyFailed",
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 p-3"
      aria-label={t("history")}
    >
      <div className="space-y-2">
        <Label htmlFor={searchId}>{t("searchHistory")}</Label>
        <Input
          id={searchId}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          autoComplete="off"
        />
        <Button
          variant="outline"
          className="h-10 text-xs"
          aria-pressed={archived}
          onClick={() => {
            setArchived((value) => !value);
            setEditing(undefined);
          }}
        >
          {t(archived ? "showActive" : "showArchived")}
        </Button>
      </div>
      {error && (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>{t(error)}</p>
          <Button
            variant="outline"
            className="h-10 text-xs"
            onClick={() => setRefresh((v) => v + 1)}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loading && items.length === 0 && (
          <div role="status" aria-label={t("loading")} className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!loading && items.length === 0 && !error && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("noHistory")}
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-2">
            <div className="flex min-w-0 items-start gap-1">
              <Button
                variant="ghost"
                disabled={Boolean(busy)}
                className="h-auto min-h-10 min-w-0 flex-1 flex-col items-start whitespace-normal px-1 text-left"
                onClick={() => {
                  setBusy(item.id);
                  void onOpen(item.id)
                    .catch(() => setError("historyFailed"))
                    .finally(() => setBusy(undefined));
                }}
              >
                <span className="w-full break-words text-sm">
                  {item.title || t("untitled")}
                </span>
                <time
                  className="text-xs font-normal text-muted-foreground"
                  dateTime={new Date(item.updatedAt).toISOString()}
                >
                  {new Intl.DateTimeFormat(locale, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(item.updatedAt)}
                </time>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={Boolean(busy)}
                    className="h-10 text-xs"
                  >
                    {t("manage")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="min-h-10"
                    onClick={() => {
                      setEditing(item.id);
                      reset({ title: item.title });
                    }}
                  >
                    {t("rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-10"
                    onClick={() =>
                      void mutate(item.id, { archived: !item.archived })
                    }
                  >
                    {t(item.archived ? "restoreConversation" : "archive")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {editing === item.id && (
              <form
                className="mt-2 space-y-2 border-t pt-2"
                onSubmit={handleSubmit(({ title }) =>
                  mutate(item.id, { title }),
                )}
              >
                <Label htmlFor={titleId}>{t("conversationTitle")}</Label>
                <Input
                  id={titleId}
                  maxLength={100}
                  {...register("title")}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={
                    errors.title ? titleId + "-error" : undefined
                  }
                />
                {errors.title && (
                  <p
                    id={titleId + "-error"}
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    {errors.title.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={Boolean(busy)}
                    className="h-10 text-xs"
                  >
                    {busy === item.id && (
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    )}
                    {t("saveTitle")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={Boolean(busy)}
                    className="h-10 text-xs"
                    onClick={() => setEditing(undefined)}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        ))}
        {cursor && (
          <Button
            variant="outline"
            className="h-10 w-full text-xs"
            disabled={loading}
            onClick={() => void more()}
          >
            {t("loadMore")}
          </Button>
        )}
      </div>
    </section>
  );
}
