"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_AGENT_MODEL, isAllowedAgentModel } from "@/lib/agent/models";
import {
  readChatStream,
  type BookContext,
  type ChatMessage,
} from "@/lib/chat/protocol";
const SESSION_KEY = "htlb_chat_session_id";
const DRAFT_KEY = "htlb_chat_draft";
const MODEL_KEY = "htlb_chat_model";
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private/restricted storage still permits chat. */
  }
}
function saved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useChat() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string;
  } | null>(null);
  const owner = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraftState] = useState("");
  const [model, setModelState] = useState(DEFAULT_AGENT_MODEL);
  const [revision, setRevision] = useState<string>();
  const [context, setContext] = useState<BookContext>();
  const [streaming, setStreaming] = useState(false);
  const [stage, setStage] = useState("preparing");
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string>();
  const sessionId = useRef<string | null>(null);
  const epoch = useRef(0);
  const active = useRef<{ abort: AbortController; turnId: string } | null>(
    null,
  );
  const scrollTop = useRef(0);
  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    if (owner.current) store(`${DRAFT_KEY}:${owner.current}`, value);
  }, []);
  const setModel = (value: string) => {
    if (isAllowedAgentModel(value)) {
      setModelState(value);
      if (owner.current) store(`${MODEL_KEY}:${owner.current}`, value);
    }
  };
  const restore = useCallback(async () => {
    let token = epoch.current;
    setLoading(true);
    try {
      const identity = await fetch("/api/agent/session", { cache: "no-store" });
      if (!identity.ok) throw new Error("history_failed");
      const account = await identity.json();
      if (token !== epoch.current) return;
      if (owner.current !== (account.user?.id ?? null)) {
        active.current?.abort.abort();
        active.current = null;
        token = ++epoch.current;
        setStreaming(false);
        setMessages([]);
        setRevision(undefined);
        setContext(undefined);
        owner.current = account.user?.id ?? null;
        sessionId.current = owner.current
          ? saved(`${SESSION_KEY}:${owner.current}`)
          : null;
        setDraftState(
          owner.current ? (saved(`${DRAFT_KEY}:${owner.current}`) ?? "") : "",
        );
        const preference = owner.current
          ? saved(`${MODEL_KEY}:${owner.current}`)
          : null;
        setModelState(
          isAllowedAgentModel(preference) ? preference : DEFAULT_AGENT_MODEL,
        );
      }
      setUser(account.user ?? null);
      setAuthed(Boolean(account.user));
      if (!account.user) {
        setError(undefined);
        return;
      }
      const id = sessionId.current;
      if (!id) {
        setError(undefined);
        return;
      }
      const response = await fetch(
        `/api/agent/session${id ? `?id=${encodeURIComponent(id)}` : ""}`,
        { cache: "no-store" },
      );
      if (token !== epoch.current) return;
      if (response.status === 401) {
        setAuthed(false);
        setUser(null);
        setMessages([]);
        setDraftState("");
        setContext(undefined);
        setRevision(undefined);
        owner.current = null;
        sessionId.current = null;
        return;
      }
      if (response.status === 404) {
        sessionId.current = null;
        store(`${SESSION_KEY}:${owner.current}`, "");
        setMessages([]);
        setRevision(undefined);
        setError(undefined);
        return;
      }
      if (!response.ok) throw new Error("history_failed");
      const data = await response.json();
      if (token !== epoch.current) return;
      setAuthed(Boolean(data.authed));
      if (data.session) {
        setMessages(data.session.messages);
        setRevision(data.session.revision);
      }
      setError(undefined);
    } catch {
      if (token === epoch.current) setError("history_failed");
    } finally {
      if (token === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void restore();
    });
    const changed = () => {
      void restore();
    };
    const focus = () => {
      if (!active.current) void restore();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "utils_auth_changed") changed();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storage);
    const requestEpoch = epoch;
    const requestState = active;
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
      requestEpoch.current++;
      requestState.current?.abort.abort();
    };
  }, [restore]);
  function stop() {
    const running = active.current;
    if (!running) return;
    epoch.current++;
    running.abort.abort();
    active.current = null;
    setMessages((items) =>
      items.map((m) =>
        m.turnId === running.turnId && m.role === "assistant"
          ? { ...m, status: "stopped", error: "stopped" }
          : m,
      ),
    );
    setStreaming(false);
  }
  function newChat() {
    stop();
    epoch.current++;
    sessionId.current = null;
    if (owner.current) store(`${SESSION_KEY}:${owner.current}`, "");
    setMessages([]);
    setRevision(undefined);
    setContext(undefined);
    setDraft("");
    setError(undefined);
    setLoading(false);
    scrollTop.current = 0;
  }
  async function send(bookRevision: string, retry?: ChatMessage) {
    if (active.current || loading || !authed) return;
    const text = retry?.content ?? draft.trim();
    if (!text || text.length > 4000) return;
    const turnId = retry?.turnId ?? crypto.randomUUID();
    const quote = retry?.context ?? context;
    const pinned = revision ?? bookRevision;
    const token = ++epoch.current;
    const abort = new AbortController();
    active.current = { abort, turnId };
    const id = sessionId.current ?? crypto.randomUUID();
    sessionId.current = id;
    store(`${SESSION_KEY}:${owner.current}`, id);
    const user: ChatMessage = {
      id: `${turnId}-user`,
      turnId,
      role: "user",
      revision: pinned,
      content: text,
      at: Date.now(),
      status: "complete",
      ...(quote ? { context: quote } : {}),
    };
    const assistant: ChatMessage = {
      id: `${turnId}-assistant`,
      turnId,
      role: "assistant",
      revision: pinned,
      content: "",
      at: Date.now(),
      status: "streaming",
    };
    setMessages((items) => [
      ...items.filter((m) => m.turnId !== turnId),
      user,
      assistant,
    ]);
    if (!retry) {
      setDraft("");
      setContext(undefined);
    }
    setStreaming(true);
    setStartedAt(Date.now());
    setStage("preparing");
    setError(undefined);
    const update = (change: Partial<ChatMessage>) =>
      setMessages((items) =>
        items.map((m) => (m.id === assistant.id ? { ...m, ...change } : m)),
      );
    let textSoFar = "";
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        signal: abort.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: id,
          turnId,
          model,
          revision: pinned,
          ...(quote ? { context: quote } : {}),
        }),
      });
      if (token !== epoch.current) return;
      if (response.status === 401) {
        setAuthed(false);
        setUser(null);
        setMessages([]);
        setDraftState("");
        setContext(undefined);
        setRevision(undefined);
        owner.current = null;
        sessionId.current = null;
        epoch.current++;
        active.current = null;
        setStreaming(false);
        return;
      }
      if (!response.ok || !response.body) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "agent_failed");
      }
      await readChatStream(response.body, (event) => {
        if (token !== epoch.current) return;
        if (event.type === "start") {
          setRevision(event.revision);
          store(`${SESSION_KEY}:${owner.current}`, event.sessionId);
          sessionId.current = event.sessionId;
        }
        if (event.type === "status") setStage(event.stage);
        if (event.type === "delta" || event.type === "replace") {
          textSoFar =
            event.type === "delta" ? textSoFar + event.text : event.text;
          update({ content: textSoFar });
        }
        if (event.type === "done")
          update({ status: "complete", error: undefined });
        if (event.type === "error")
          update({
            status: event.code === "stopped" ? "stopped" : "failed",
            error: event.code,
          });
      });
    } catch (failure) {
      if (token === epoch.current) {
        const code =
          failure instanceof Error ? failure.message : "agent_failed";
        update({ status: "failed", error: code });
        // Draft typed during the request wins; otherwise restore a rejected send.
        if (!textSoFar && !retry)
          setDraftState((value) => {
            const next = value || text;
            if (owner.current) store(`${DRAFT_KEY}:${owner.current}`, next);
            return next;
          });
      }
    } finally {
      if (token === epoch.current) {
        active.current = null;
        setStreaming(false);
      }
    }
  }
  async function logout() {
    stop();
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      setError("history_failed");
      return;
    }
    if (owner.current) {
      store(`${SESSION_KEY}:${owner.current}`, "");
      store(`${DRAFT_KEY}:${owner.current}`, "");
    }
    epoch.current++;
    owner.current = null;
    sessionId.current = null;
    setMessages([]);
    setDraftState("");
    setContext(undefined);
    setRevision(undefined);
    setUser(null);
    setAuthed(false);
    store("utils_auth_changed", String(Date.now()));
    await restore();
  }
  const saveScroll = useCallback((position: number) => {
    scrollTop.current = position;
  }, []);
  return {
    authed,
    user,
    loading,
    messages,
    draft,
    setDraft,
    model,
    setModel,
    revision,
    context,
    setContext,
    streaming,
    stage,
    startedAt,
    error,
    restore,
    logout,
    stop,
    newChat,
    send,
    scrollTop,
    saveScroll,
  };
}
export type ChatController = ReturnType<typeof useChat>;
