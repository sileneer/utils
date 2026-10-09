"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  History,
  ChevronDown,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Square,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AGENT_MODELS, agentModelName } from "@/lib/agent/models";
import { cn } from "@/lib/utils";
import { Answer } from "./answer";
import { MessageDetails } from "./message-details";
import { ConversationHistory } from "./conversation-history";
import { ChatAvailability } from "./chat-availability";
import type { ChatController } from "./use-chat";
import { shouldSubmitKey } from "@/lib/chat/composer";

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export function ChatPanel({
  chat,
  bookRevision,
  anchors,
  onCitation,
  onClose,
  className,
}: {
  chat: ChatController;
  bookRevision?: string;
  anchors: Set<string>;
  onCitation: (anchor: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations("chat");
  const account = useTranslations("account");
  const locale = useLocale();
  const [following, setFollowing] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const followRef = useRef(true);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
    }
  }, [chat.draft]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    element.scrollTop = chat.scrollTop.current;
    followRef.current =
      element.scrollHeight - element.clientHeight - element.scrollTop < 80;
  }, [chat.scrollTop, chat.loading]);
  useEffect(() => {
    if (followRef.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [chat.messages]);
  const mismatch = Boolean(
    chat.revision && bookRevision && chat.revision !== bookRevision,
  );
  const canSend = Boolean(
    bookRevision &&
    !mismatch &&
    chat.draft.trim() &&
    !chat.streaming &&
    !chat.loading &&
    !chat.archived &&
    (!chat.quota ||
      (chat.quota.enabled &&
        chat.quota.remaining > 0 &&
        chat.quota.service !== "quota")),
  );
  function errorText(code?: string) {
    if (code === "quota_exceeded") return account("quota");
    if (code === "ai_disabled") return account("aiDisabled");
    const key =
      (
        {
          busy: "busy",
          rate_limited: "rateLimited",
          timeout: "timeout",
          stopped: "stopped",
          disconnected: "disconnected",
          book_unavailable: "bookUnavailable",
          history_failed: "historyFailed",
          unauthorized: "sessionExpired",
          interrupted: "interrupted",
          conversation_archived: "archivedNotice",
        } as Record<string, string>
      )[code ?? ""] ?? "error";
    return t(key);
  }
  function send() {
    if (canSend) {
      followRef.current = true;
      setFollowing(true);
      void chat.send(bookRevision!);
    }
  }
  return (
    <aside
      className={cn("flex min-h-0 flex-col bg-card", className)}
      aria-label={t("title")}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4 shrink-0 text-primary" />
          <span className="truncate" title={chat.title || t("title")}>
            {historyOpen ? t("history") : chat.title || t("title")}
          </span>
        </h2>
        <div className="flex">
          {chat.user && (
            <IconButton
              label={account("logout")}
              onClick={() => void chat.logout()}
            >
              <LogOut />
            </IconButton>
          )}
          {chat.user && (
            <IconButton
              label={t(historyOpen ? "backToChat" : "history")}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <History />
            </IconButton>
          )}
          <IconButton
            label={t("newChat")}
            onClick={() => {
              void chat.newChat().then((opened) => {
                if (opened) setHistoryOpen(false);
              });
            }}
          >
            <MessageSquarePlus />
          </IconButton>
          <IconButton label={t("close")} onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-xs">
        <span className="text-muted-foreground">{t("model")}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 min-w-0 flex-1 justify-between text-xs"
              disabled={chat.streaming}
              aria-label={t("model")}
            >
              <span className="truncate">{agentModelName(chat.model)}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-w-[calc(100vw-2rem)] min-w-64"
          >
            {AGENT_MODELS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                className="min-h-10"
                onClick={() => chat.setModel(m.id)}
              >
                <span className="flex-1">
                  {m.name}
                  <span className="block text-xs text-muted-foreground">
                    {m.hint[locale === "zh" ? "zh" : "en"]}
                  </span>
                </span>
                {chat.model === m.id && <Check />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {chat.user && (
        <p
          className="truncate border-b px-3 py-2 text-xs text-muted-foreground"
          title={chat.user.email}
        >
          {chat.user.name} · {chat.user.email}
        </p>
      )}
      {chat.user && (
        <ChatAvailability
          quota={chat.quota}
          onRefresh={() => void chat.refreshAvailability()}
        />
      )}
      {chat.notice && (
        <div className="shrink-0 space-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
          <p role="status">{t(chat.notice)}</p>
          {chat.notice === "stop_unconfirmed" && (
            <Button
              variant="outline"
              className="h-10 text-xs"
              onClick={() => void chat.confirmStatus()}
            >
              {t("checkStatus")}
            </Button>
          )}
        </div>
      )}
      {chat.archived && !historyOpen && (
        <p
          role="status"
          className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground"
        >
          {t("archivedNotice")}
        </p>
      )}
      {historyOpen && chat.user ? (
        <ConversationHistory
          key={chat.user.id}
          version={chat.historyVersion}
          onOpen={async (id) => {
            const opened = await chat.openConversation(id);
            if (opened) setHistoryOpen(false);
            return opened;
          }}
          onUpdate={chat.updateConversation}
        />
      ) : chat.loading ? (
        <div
          className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          {t("loading")}
        </div>
      ) : chat.error ? (
        <div className="flex flex-1 flex-col justify-center gap-3 p-6">
          <p role="alert" className="text-sm text-destructive">
            {errorText(chat.error)}
          </p>
          <Button onClick={() => void chat.restore()}>{t("retry")}</Button>
        </div>
      ) : !chat.authed ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto p-6">
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("greeting")}
          </p>
          {chat.messages.length > 0 && (
            <p role="status" className="text-xs text-destructive">
              {t("sessionExpired")}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {account("loginPrompt")}
          </p>
          <Button asChild className="h-10">
            <Link href="/login">{account("login")}</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/register">{account("register")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {mismatch && (
            <div className="shrink-0 border-b bg-muted p-3 text-xs">
              <p>{t("versionChanged")}</p>
              <Button
                variant="outline"
                className="mt-2 h-10"
                onClick={chat.newChat}
              >
                {t("newChat")}
              </Button>
            </div>
          )}
          <div
            ref={list}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              chat.saveScroll(el.scrollTop);
              const near =
                el.scrollHeight - el.clientHeight - el.scrollTop < 80;
              followRef.current = near;
              setFollowing(near);
            }}
          >
            {chat.messages.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/40 p-4">
                  <BookOpen className="mb-3 size-6 text-primary" />
                  <p className="font-medium">{t("emptyTitle")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("greeting")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("tryQuestion")}
                </p>
                {["exampleDecision", "exampleEvidence", "exampleExcerpt"].map(
                  (key) => (
                    <Button
                      key={key}
                      variant="outline"
                      disabled={key === "exampleExcerpt" && !chat.context}
                      className="h-auto min-h-10 w-full justify-start whitespace-normal py-3 text-left text-sm"
                      onClick={() =>
                        chat.setDraft(
                          t(key === "exampleExcerpt" ? "excerptQuestion" : key),
                        )
                      }
                    >
                      {t(key)}
                    </Button>
                  ),
                )}
              </div>
            )}
            {chat.messages.map((message, index) => (
              <div
                key={message.id}
                className={cn(
                  "min-w-0 rounded-xl p-3",
                  message.role === "user"
                    ? "ml-6 bg-primary/10"
                    : "mr-0 bg-muted/50",
                )}
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t(message.role === "user" ? "you" : "assistant")}
                </p>
                {message.context && (
                  <blockquote className="mb-2 max-h-28 overflow-y-auto border-l-2 border-primary pl-2 text-xs text-muted-foreground">
                    {message.context.text}
                  </blockquote>
                )}
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.content}
                  </p>
                ) : (
                  <Answer
                    text={message.content}
                    incomplete={message.status !== "complete"}
                    revision={
                      message.revision === bookRevision
                        ? message.revision
                        : undefined
                    }
                    anchors={anchors}
                    onCitation={onCitation}
                  />
                )}
                {message.role === "assistant" &&
                  (message.status === "failed" ||
                    message.status === "stopped") && (
                    <div className="mt-2 border-t pt-2">
                      <p role="status" className="text-xs text-destructive">
                        {errorText(message.error ?? message.status)}
                      </p>
                      {index === chat.messages.length - 1 && (
                        <Button
                          variant="outline"
                          className="mt-2 h-10 text-xs"
                          disabled={
                            chat.streaming ||
                            chat.loading ||
                            chat.archived ||
                            !bookRevision ||
                            mismatch ||
                            Boolean(
                              chat.quota &&
                              (!chat.quota.enabled ||
                                chat.quota.remaining < 1 ||
                                chat.quota.service === "quota"),
                            )
                          }
                          onClick={() =>
                            void chat.send(
                              bookRevision!,
                              chat.messages.find(
                                (m) =>
                                  m.turnId === message.turnId &&
                                  m.role === "user",
                              ),
                            )
                          }
                        >
                          {t("retry")}
                        </Button>
                      )}
                    </div>
                  )}
                <MessageDetails
                  message={message}
                  stage={chat.stage}
                  startedAt={chat.startedAt}
                />
              </div>
            ))}
          </div>
          {!following && chat.messages.length > 0 && (
            <Button
              variant="outline"
              className="mx-auto mb-2 h-10 shrink-0 text-xs"
              onClick={() => {
                followRef.current = true;
                setFollowing(true);
                list.current?.scrollTo({ top: list.current.scrollHeight });
              }}
            >
              <ArrowDown />
              {t("latest")}
            </Button>
          )}
          <form
            className="shrink-0 space-y-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {chat.context && (
              <div className="flex items-start gap-2 rounded-lg bg-muted p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {t("excerptLabel")} ·{" "}
                    {t("citation", {
                      section: chat.context.section ?? 0,
                      item: chat.context.item ?? 0,
                    })}
                  </p>
                  <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {chat.context.text}
                  </p>
                </div>
                <IconButton
                  label={t("removeExcerpt")}
                  onClick={() => chat.setContext(undefined)}
                >
                  <X />
                </IconButton>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                ref={input}
                value={chat.draft}
                onChange={(e) => chat.setDraft(e.target.value)}
                className="max-h-40 min-h-10 resize-none text-base md:text-sm"
                aria-label={t("messageLabel")}
                placeholder={t("placeholder")}
                maxLength={4000}
                onKeyDown={(e) => {
                  if (
                    shouldSubmitKey(
                      {
                        key: e.key,
                        shiftKey: e.shiftKey,
                        isComposing: e.nativeEvent.isComposing,
                        keyCode: e.nativeEvent.keyCode,
                      },
                      matchMedia("(pointer: fine)").matches,
                    )
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {chat.streaming ? (
                <IconButton label={t("stop")} onClick={() => void chat.stop()}>
                  <Square />
                </IconButton>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      size="icon"
                      className="size-10 shrink-0"
                      disabled={!canSend}
                      aria-label={t("send")}
                    >
                      <ArrowUp />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("send")}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {chat.draft.length}/4000 · {t("inputHint")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("disclaimer")}
            </p>
          </form>
        </>
      )}
    </aside>
  );
}
