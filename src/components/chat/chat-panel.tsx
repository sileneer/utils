"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  agentModelName,
} from "@/lib/agent/models";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SESSION_KEY = "htlb_chat_session_id";
const MODEL_KEY = "htlb_chat_model";

export function ChatPanel({ className, onClose }: { className?: string; onClose?: () => void }) {
  const t = useTranslations("chat");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_AGENT_MODEL);
  const sessionRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionRef.current = localStorage.getItem(SESSION_KEY);
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved && AGENT_MODELS.some((m) => m.id === saved)) setModel(saved);
    fetch("/api/agent/session")
      .then((r) => r.json())
      .then((d) => setAuthed(Boolean(d.authed)))
      .catch(() => setAuthed(false));
  }, []);

  function pickModel(id: string) {
    setModel(id);
    localStorage.setItem(MODEL_KEY, id);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streamText]);

  async function unlock() {
    setUnlocking(true);
    setPasscodeError(false);
    try {
      const res = await fetch("/api/agent/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        setAuthed(true);
      } else {
        setPasscodeError(true);
      }
    } catch {
      setPasscodeError(true);
    } finally {
      setUnlocking(false);
    }
  }

  function newChat() {
    sessionRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([]);
    setStreamText("");
    setError(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    setMessages((m) => [...m, { role: "user", content: text }]);

    let sessionId = sessionRef.current ?? undefined;
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, model }),
      });
      if (res.status === 429) {
        setError(t("busy"));
        setStreaming(false);
        return;
      }
      if (!res.ok || !res.body) {
        setError(t("error"));
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "start") {
            sessionId = payload.sessionId;
            sessionRef.current = payload.sessionId;
            localStorage.setItem(SESSION_KEY, payload.sessionId);
          } else if (payload.type === "delta") {
            acc += payload.text;
            setStreamText(acc);
          } else if (payload.type === "done") {
            setMessages((m) => [...m, { role: "assistant", content: acc }]);
            setStreamText("");
          } else if (payload.type === "error") {
            setError(t("error"));
          }
        }
      }
      if (acc) {
        // done event may have been missed on abrupt close — flush what we have
        setMessages((m) => [...m, { role: "assistant", content: acc }]);
        setStreamText("");
      }
    } catch {
      setError(t("error"));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <aside className={cn("flex flex-col bg-card", className)}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 border-b px-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <BookOpen className="size-4 shrink-0 text-primary" />
          <span className="truncate">{t("title")}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="max-w-[130px] px-2 text-xs text-muted-foreground"
                aria-label={t("model")}
                title={agentModelName(model)}
              >
                <span className="truncate">{agentModelName(model)}</span>
                <ChevronDown className="size-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {AGENT_MODELS.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => pickModel(m.id)}>
                  <span className="flex-1">
                    {m.name}
                    <span className="block text-[11px] text-muted-foreground">
                      {m.hint.zh}
                    </span>
                  </span>
                  {model === m.id && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label={t("newChat")} onClick={newChat}>
            <MessageSquarePlus />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("close")}
              className="md:hidden"
              onClick={onClose}
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {authed === null ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !authed ? (
        <form
          className="flex flex-1 flex-col justify-center gap-3 px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <p className="text-sm text-muted-foreground">{t("passcodePrompt")}</p>
          <Input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={t("passcodeLabel")}
            autoFocus
          />
          {passcodeError && <p className="text-xs text-destructive">{t("wrongPasscode")}</p>}
          <Button type="submit" disabled={unlocking || !passcode}>
            {unlocking ? <Loader2 className="size-4 animate-spin" /> : t("unlock")}
          </Button>
        </form>
      ) : (
        <>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.length === 0 && !streaming && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("greeting")}
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto bg-primary/10 text-foreground"
                    : "mr-auto bg-muted/60 text-foreground"
                )}
              >
                {m.content}
              </div>
            ))}
            {streaming && (
              <div className="mr-auto max-w-[90%] rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {streamText || (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("thinking")}
                  </span>
                )}
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <form
            className="flex shrink-0 items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              disabled={streaming}
              maxLength={4000}
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} aria-label={t("send")}>
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          <p className="shrink-0 px-3 pb-2 text-[11px] text-muted-foreground">{t("disclaimer")}</p>
        </>
      )}
    </aside>
  );
}
