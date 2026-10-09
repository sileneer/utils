"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_AGENT_MODEL, isAllowedAgentModel } from "@/lib/agent/models";
import {
  readChatStream,
  type BookContext,
  type ChatMessage,
} from "@/lib/chat/protocol";
import type { ActiveTurn, Availability } from "@/lib/chat/history";
import { confirmTerminal, draftKey } from "@/lib/chat/recovery";
const SESSION_KEY = "htlb_chat_session_id";
const MODEL_KEY = "htlb_chat_model";
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Restricted storage still permits chat. */
  }
}
function saved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
async function requestStop(turnId: string) {
  const response = await fetch("/api/agent/stop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnId }),
    keepalive: true,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("stop_unconfirmed");
  // Accepted/queued cancellation is not proof of terminal SDK state.
}
type Identity = { id: string; email: string; name: string };
type Snapshot = {
  user: Identity | null;
  availability?: Availability;
  active?: ActiveTurn;
  session?: {
    id: string;
    messages: ChatMessage[];
    revision?: string;
    title: string;
    archived: boolean;
  };
};
export function useChat() {
  const [authed, setAuthed] = useState<boolean | null>(null),
    [user, setUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true),
    [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraftState] = useState(""),
    [model, setModelState] = useState(DEFAULT_AGENT_MODEL);
  const [revision, setRevision] = useState<string>(),
    [context, setContext] = useState<BookContext>();
  const [streaming, setStreaming] = useState(false),
    [stage, setStage] = useState("preparing"),
    [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const [stopping, setStopping] = useState(false),
    [quota, setQuota] = useState<Availability>();
  const [title, setTitle] = useState(""),
    [archived, setArchived] = useState(false),
    [historyVersion, setHistoryVersion] = useState(0);
  const owner = useRef<string | null>(null),
    sessionId = useRef<string | null>(null),
    epoch = useRef(0);
  const active = useRef<{
    abort: AbortController;
    turnId: string;
    sessionId: string;
  } | null>(null);
  const remote = useRef<ActiveTurn | undefined>(undefined),
    synchronization = useRef<{ key: string; task: Promise<boolean> } | null>(
      null,
    );
  const scrollTop = useRef(0),
    positions = useRef(new Map<string, number>());
  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    if (owner.current) store(draftKey(owner.current, sessionId.current), value);
  }, []);
  const setModel = (value: string) => {
    if (isAllowedAgentModel(value)) {
      setModelState(value);
      if (owner.current) store(`${MODEL_KEY}:${owner.current}`, value);
    }
  };
  const expire = useCallback(() => {
    epoch.current++;
    active.current?.abort.abort();
    active.current = null;
    remote.current = undefined;
    owner.current = null;
    sessionId.current = null;
    setAuthed(false);
    setUser(null);
    setMessages([]);
    setDraftState("");
    setContext(undefined);
    setRevision(undefined);
    setQuota(undefined);
    setTitle("");
    setArchived(false);
    setStreaming(false);
    setStopping(false);
    setLoading(false);
    setNotice(undefined);
    setError(undefined);
  }, []);
  const applySnapshot = useCallback(
    (data: Snapshot, id: string | null, includeMessages = true) => {
      if (data.user?.id !== owner.current) return;
      setQuota(data.availability);
      remote.current = data.active;
      if (data.active) {
        setStreaming(true);
        setStartedAt(data.active.startedAt);
        if (!active.current) setStage("recovering");
        setStopping(data.active.state === "stopping");
      } else if (!active.current) {
        setStreaming(false);
        setStopping(false);
      }
      if (includeMessages && id === sessionId.current && data.session) {
        setMessages((items) =>
          data.session!.messages.map((m) => {
            const previous = items.find((p) => p.id === m.id);
            return previous &&
              (m.status === "pending" || m.status === "streaming")
              ? {
                  ...m,
                  content: previous.content || m.content,
                  details: m.details ?? previous.details,
                }
              : m;
          }),
        );
        setRevision(data.session.revision);
        setTitle(data.session.title);
        setArchived(data.session.archived);
      }
    },
    [],
  );
  const reconcile = useCallback(
    async (target?: {
      sessionId: string;
      turnId: string;
    }): Promise<boolean> => {
      const query = target ?? active.current ?? remote.current;
      if (!query || !owner.current) return true;
      const account = owner.current,
        generation = epoch.current;
      const key = `${account}:${query.sessionId}:${query.turnId}:${generation}`;
      if (synchronization.current?.key === key)
        return synchronization.current.task;
      const alive = () =>
        owner.current === account && epoch.current === generation;
      const task = (async () => {
        setNotice("confirming");
        const confirmed = await confirmTerminal(async () => {
          const response = await fetch(
            `/api/agent/session?id=${encodeURIComponent(query.sessionId)}`,
            { cache: "no-store", signal: AbortSignal.timeout(5000) },
          );
          if (!alive()) return false;
          if (response.status === 401) {
            expire();
            return false;
          }
          if (response.status === 404) {
            // A rejected send may never have reached persistence. Wait until its
            // local transport has settled so an early Stop cannot be false proof.
            return !active.current;
          }
          if (!response.ok) throw new Error("history_failed");
          const data: Snapshot = await response.json();
          if (!alive() || data.user?.id !== account) return false;
          applySnapshot(data, query.sessionId);
          const message = data.session?.messages.find(
            (m) => m.turnId === query.turnId && m.role === "assistant",
          );
          return (
            data.active?.turnId !== query.turnId &&
            Boolean(
              message && !["pending", "streaming"].includes(message.status),
            )
          );
        }, alive);
        if (alive()) {
          if (confirmed) {
            const transport = active.current;
            if (transport?.turnId === query.turnId) {
              epoch.current++;
              active.current = null;
              transport.abort.abort();
            }
            remote.current = undefined;
            setStreaming(false);
            setStopping(false);
            setNotice(undefined);
            setHistoryVersion((v) => v + 1);
          } else {
            setNotice("stop_unconfirmed");
          }
        }
        return confirmed;
      })();
      synchronization.current = { key, task };
      try {
        return await task;
      } finally {
        if (synchronization.current?.task === task)
          synchronization.current = null;
      }
    },
    [applySnapshot, expire],
  );
  const restore = useCallback(async () => {
    let generation = epoch.current;
    setLoading(true);
    try {
      const response = await fetch("/api/agent/session", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("history_failed");
      const identity: Snapshot = await response.json();
      if (generation !== epoch.current) return;
      if (owner.current !== (identity.user?.id ?? null)) {
        if (active.current)
          void requestStop(active.current.turnId).catch(() => undefined);
        active.current?.abort.abort();
        active.current = null;
        remote.current = undefined;
        synchronization.current = null;
        generation = ++epoch.current;
        owner.current = identity.user?.id ?? null;
        setMessages([]);
        setRevision(undefined);
        setContext(undefined);
        setTitle("");
        setArchived(false);
        setNotice(undefined);
        setStreaming(false);
        sessionId.current = owner.current
          ? saved(`${SESSION_KEY}:${owner.current}`)
          : null;
        const account = owner.current;
        if (account) {
          const key = draftKey(account, sessionId.current);
          const legacy = saved(`htlb_chat_draft:${account}`);
          if (saved(key) === null && legacy !== null) {
            store(key, legacy);
            store(`htlb_chat_draft:${account}`, "");
          }
          setDraftState(saved(key) ?? "");
          const preference = saved(`${MODEL_KEY}:${account}`);
          setModelState(
            isAllowedAgentModel(preference) ? preference : DEFAULT_AGENT_MODEL,
          );
        } else setDraftState("");
      }
      setUser(identity.user);
      setAuthed(Boolean(identity.user));
      if (!identity.user) {
        setQuota(undefined);
        setError(undefined);
        return;
      }
      applySnapshot(identity, null, false);
      const id = sessionId.current;
      if (id) {
        const history = await fetch(
          `/api/agent/session?id=${encodeURIComponent(id)}`,
          { cache: "no-store", signal: AbortSignal.timeout(5000) },
        );
        if (generation !== epoch.current) return;
        if (history.status === 401) {
          expire();
          return;
        }
        if (history.status === 404) {
          const text = saved(draftKey(identity.user.id, id)) ?? "";
          sessionId.current = null;
          store(`${SESSION_KEY}:${identity.user.id}`, "");
          if (text) store(draftKey(identity.user.id, null), text);
          setMessages([]);
          setRevision(undefined);
          setTitle("");
          setArchived(false);
          setDraftState(saved(draftKey(identity.user.id, null)) ?? "");
        } else {
          if (!history.ok) throw new Error("history_failed");
          const data: Snapshot = await history.json();
          if (generation !== epoch.current) return;
          applySnapshot(data, id, !active.current);
        }
      }
      setError(undefined);
      if (remote.current && !active.current) void reconcile(remote.current);
    } catch {
      if (generation === epoch.current) setError("history_failed");
    } finally {
      if (generation === epoch.current) setLoading(false);
    }
  }, [applySnapshot, reconcile, expire]);
  useEffect(() => {
    queueMicrotask(() => void restore());
    const focus = () => {
      if (!active.current) void restore();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === "utils_auth_changed") void restore();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", changed);
    const controller = active,
      generation = epoch;
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", changed);
      generation.current++;
      if (controller.current)
        void requestStop(controller.current.turnId).catch(() => undefined);
      controller.current?.abort.abort();
    };
  }, [restore]);
  async function stop(): Promise<boolean> {
    const query = active.current ?? remote.current;
    if (!query) return true;
    setStopping(true);
    setNotice("confirming");
    try {
      await requestStop(query.turnId);
    } catch {
      setNotice("stop_unconfirmed");
    }
    return reconcile(query);
  }
  async function newChat() {
    const account = owner.current;
    if (!(await stop()) || account !== owner.current) return false;
    epoch.current++;
    sessionId.current = null;
    if (owner.current) store(`${SESSION_KEY}:${owner.current}`, "");
    setMessages([]);
    setRevision(undefined);
    setContext(undefined);
    setTitle("");
    setArchived(false);
    setError(undefined);
    setNotice(undefined);
    setLoading(false);
    setDraftState(
      owner.current ? (saved(draftKey(owner.current, null)) ?? "") : "",
    );
    scrollTop.current = 0;
    return true;
  }
  async function openConversation(id: string) {
    const account = owner.current;
    if (!(await stop()) || !account || account !== owner.current) return false;
    epoch.current++;
    sessionId.current = id;
    store(`${SESSION_KEY}:${owner.current}`, id);
    setMessages([]);
    setContext(undefined);
    setRevision(undefined);
    setNotice(undefined);
    setDraftState(saved(draftKey(owner.current, id)) ?? "");
    scrollTop.current = positions.current.get(id) ?? 0;
    await restore();
    return true;
  }
  async function updateConversation(
    id: string,
    changes: { title?: string; archived?: boolean },
  ) {
    if (
      changes.archived !== undefined &&
      (active.current?.sessionId ?? remote.current?.sessionId) === id &&
      !(await stop())
    )
      throw new Error("stop_unconfirmed");
    const account = owner.current;
    const response = await fetch("/api/agent/conversations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error ?? "history_failed");
    }
    if (account !== owner.current) return;
    if (id === sessionId.current) {
      if (changes.title !== undefined) setTitle(changes.title);
      if (changes.archived !== undefined) setArchived(changes.archived);
    }
    setHistoryVersion((v) => v + 1);
  }
  async function refreshAvailability() {
    const account = owner.current,
      generation = epoch.current;
    try {
      const response = await fetch("/api/agent/session", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const data: Snapshot = await response.json();
      if (account === owner.current && generation === epoch.current)
        applySnapshot(data, null, false);
    } catch {
      /* Explicit refresh/restore remains available. */
    }
  }
  async function send(bookRevision: string, retry?: ChatMessage) {
    if (
      active.current ||
      remote.current ||
      streaming ||
      loading ||
      !authed ||
      archived
    )
      return;
    const text = retry?.content ?? draft.trim();
    if (!text || text.length > 4000) return;
    const turnId = retry?.turnId ?? crypto.randomUUID(),
      id = sessionId.current ?? crypto.randomUUID();
    const quote = retry?.context ?? context,
      pinned = revision ?? bookRevision,
      generation = ++epoch.current,
      abort = new AbortController(),
      turnStartedAt = Date.now();
    if (!sessionId.current && owner.current)
      store(draftKey(owner.current, null), "");
    if (!sessionId.current)
      setTitle(text.replace(/\s+/g, " ").trim().slice(0, 100).trim());
    sessionId.current = id;
    if (owner.current) store(`${SESSION_KEY}:${owner.current}`, id);
    active.current = { abort, turnId, sessionId: id };
    remote.current = {
      turnId,
      sessionId: id,
      startedAt: turnStartedAt,
      state: "running",
    };
    const userMessage: ChatMessage = {
      id: `${turnId}-user`,
      turnId,
      role: "user",
      revision: pinned,
      content: text,
      at: turnStartedAt,
      status: "complete",
      ...(quote ? { context: quote } : {}),
    };
    const assistant: ChatMessage = {
      id: `${turnId}-assistant`,
      turnId,
      role: "assistant",
      revision: pinned,
      content: "",
      at: turnStartedAt,
      status: "streaming",
      details: { model },
    };
    setMessages((items) => [
      ...items.filter((m) => m.turnId !== turnId),
      userMessage,
      assistant,
    ]);
    if (!retry) {
      setDraft("");
      setContext(undefined);
    }
    setStreaming(true);
    setStartedAt(turnStartedAt);
    setStage("preparing");
    setStopping(false);
    setNotice(undefined);
    setError(undefined);
    const update = (change: Partial<ChatMessage>) =>
      setMessages((items) =>
        items.map((m) => (m.id === assistant.id ? { ...m, ...change } : m)),
      );
    let textSoFar = "",
      terminal = false,
      accepted = false;
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
      if (generation !== epoch.current) return;
      if (response.status === 401) {
        expire();
        return;
      }
      if (!response.ok || !response.body) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error ?? "agent_failed");
      }
      accepted = true;
      void refreshAvailability();
      await readChatStream(response.body, (event) => {
        if (generation !== epoch.current) return;
        if (event.type === "start") {
          setRevision(event.revision);
          sessionId.current = event.sessionId;
          if (owner.current)
            store(`${SESSION_KEY}:${owner.current}`, event.sessionId);
        }
        if (event.type === "status") setStage(event.stage);
        if (event.type === "details") update({ details: event.details });
        if (event.type === "delta" || event.type === "replace") {
          textSoFar =
            event.type === "delta" ? textSoFar + event.text : event.text;
          update({ content: textSoFar });
        }
        if (event.type === "done") {
          terminal = true;
          update({ status: "complete", error: undefined });
        }
        if (event.type === "error") {
          terminal = true;
          update({
            status: event.code === "stopped" ? "stopped" : "failed",
            error: event.code,
          });
        }
      });
    } catch (failure) {
      if (generation === epoch.current && accepted) {
        setStage("recovering");
        setNotice("confirming");
      } else if (generation === epoch.current) {
        const code =
          failure instanceof Error ? failure.message : "agent_failed";
        setMessages((items) =>
          items.map((m) =>
            m.id === assistant.id
              ? {
                  ...m,
                  status: "failed",
                  error: code,
                  details: {
                    ...m.details,
                    durationMs:
                      m.details?.durationMs ?? Date.now() - turnStartedAt,
                    timingEstimated: m.details?.durationMs === undefined,
                  },
                }
              : m,
          ),
        );
        if (!textSoFar && !retry)
          setDraftState((value) => {
            const next = value || text;
            if (owner.current) store(draftKey(owner.current, id), next);
            return next;
          });
      }
    } finally {
      if (generation === epoch.current) {
        active.current = null;
        if (terminal || !accepted) {
          remote.current = undefined;
          setStreaming(false);
          setStopping(false);
          setNotice(undefined);
          setHistoryVersion((v) => v + 1);
          void refreshAvailability();
        } else void reconcile({ sessionId: id, turnId });
      }
    }
  }
  async function logout() {
    if (!(await stop())) return;
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
    } catch {
      setNotice("logout_failed");
      return;
    }
    epoch.current++;
    owner.current = null;
    sessionId.current = null;
    remote.current = undefined;
    setMessages([]);
    setDraftState("");
    setContext(undefined);
    setRevision(undefined);
    setUser(null);
    setAuthed(false);
    setQuota(undefined);
    setNotice(undefined);
    store("utils_auth_changed", String(Date.now()));
    await restore();
  }
  const saveScroll = useCallback((position: number) => {
    scrollTop.current = position;
    if (sessionId.current) positions.current.set(sessionId.current, position);
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
    stage: stopping ? "stopping" : stage,
    startedAt,
    error,
    notice,
    quota,
    title,
    archived,
    historyVersion,
    restore,
    confirmStatus: reconcile,
    refreshAvailability,
    logout,
    stop,
    newChat,
    openConversation,
    updateConversation,
    send,
    scrollTop,
    saveScroll,
  };
}
export type ChatController = ReturnType<typeof useChat>;
