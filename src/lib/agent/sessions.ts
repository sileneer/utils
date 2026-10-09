import { db } from "../db";
import { isTurnActive } from "./active-query";
import { recordedDetails } from "../chat/details";
import type { ChatMessage } from "../chat/protocol";
export type { ChatMessage } from "../chat/protocol";
export type ChatSession = {
  id: string;
  ownerUserId: string;
  sdkSessionId?: string;
  messages: ChatMessage[];
  revision?: string;
  needsRebuild?: boolean;
  title?: string;
  archived?: boolean;
};
export function isValidSessionId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}
export function sessionExists(id: string) {
  return Boolean(
    db().prepare("SELECT 1 FROM conversations WHERE id=?").get(id),
  );
}
export async function loadSession(
  id: string,
  owner: string,
): Promise<ChatSession | null> {
  if (!isValidSessionId(id)) return null;
  const row = db()
    .prepare(
      "SELECT c.*,h.title,h.archived_at FROM conversations c LEFT JOIN conversation_meta h ON h.conversation_id=c.id WHERE c.id=? AND c.owner_user_id=?",
    )
    .get(id, owner) as
    | {
        id: string;
        revision?: string;
        sdk_session_id?: string;
        needs_rebuild: number;
        title: string | null;
        archived_at: number | null;
      }
    | undefined;
  if (!row) return null;
  const rows = db()
    .prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY position")
    .all(id) as {
    id: string;
    turn_id: string;
    role: ChatMessage["role"];
    content: string;
    at: number;
    status: ChatMessage["status"];
    error?: string;
    revision?: string;
    context_json?: string;
  }[];
  const usageRows = db()
    .prepare(
      "SELECT a.turn_id,a.usage_json FROM ai_usage a JOIN messages m ON m.turn_id=a.turn_id AND m.role='assistant' WHERE m.conversation_id=? AND a.user_id=? ORDER BY a.created_at,a.rowid",
    )
    .all(id, owner) as { turn_id: string; usage_json: string | null }[];
  const details = new Map(
    usageRows.map((r) => [r.turn_id, recordedDetails(r.usage_json)]),
  );
  return {
    id,
    ownerUserId: owner,
    revision: row.revision ?? undefined,
    sdkSessionId: row.sdk_session_id ?? undefined,
    needsRebuild: Boolean(row.needs_rebuild),
    title: (row.title ?? rows.find((m) => m.role === "user")?.content ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100)
      .trim(),
    archived: row.archived_at !== null,
    messages: rows.map((m) => ({
      id: m.id,
      turnId: m.turn_id,
      role: m.role,
      content: m.content,
      at: m.at,
      status:
        m.status === "streaming" || m.status === "pending"
          ? isTurnActive(owner, m.turn_id, id)
            ? m.status
            : "failed"
          : m.status,
      error:
        (m.status === "streaming" || m.status === "pending") &&
        !isTurnActive(owner, m.turn_id, id)
          ? "interrupted"
          : (m.error ?? undefined),
      revision: m.revision ?? undefined,
      ...(m.role === "assistant" && details.get(m.turn_id)
        ? { details: details.get(m.turn_id) }
        : {}),
      ...(m.context_json ? { context: JSON.parse(m.context_json) } : {}),
    })),
  };
}
export async function saveSession(session: ChatSession) {
  if (!isValidSessionId(session.id) || !session.ownerUserId)
    throw new Error("invalid_session");
  const database = db();
  database
    .transaction(() => {
      const existing = database
        .prepare("SELECT owner_user_id FROM conversations WHERE id=?")
        .get(session.id) as { owner_user_id: string } | undefined;
      if (existing && existing.owner_user_id !== session.ownerUserId)
        throw new Error("session_forbidden");
      database
        .prepare(
          "INSERT INTO conversations (id,owner_user_id,revision,sdk_session_id,needs_rebuild,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, sdk_session_id=excluded.sdk_session_id, needs_rebuild=excluded.needs_rebuild, updated_at=excluded.updated_at",
        )
        .run(
          session.id,
          session.ownerUserId,
          session.revision ?? null,
          session.sdkSessionId ?? null,
          session.needsRebuild ? 1 : 0,
          Date.now(),
        );
      database
        .prepare(
          "INSERT INTO conversation_meta(conversation_id,title) VALUES (?,?) ON CONFLICT(conversation_id) DO NOTHING",
        )
        .run(
          session.id,
          (session.messages.find((m) => m.role === "user")?.content ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 100)
            .trim(),
        );
      database
        .prepare("DELETE FROM messages WHERE conversation_id=?")
        .run(session.id);
      const insert = database.prepare(
        "INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      );
      session.messages.forEach((m, i) =>
        insert.run(
          m.id,
          session.id,
          i,
          m.turnId,
          m.role,
          m.content,
          m.at,
          m.status,
          m.error ?? null,
          m.revision ?? null,
          m.context ? JSON.stringify(m.context) : null,
        ),
      );
    })
    .immediate();
}
