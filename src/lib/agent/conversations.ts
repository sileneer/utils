import { db } from "../db";
import { activeTurn } from "./active-query";
import { isValidSessionId } from "./sessions";
import type { ConversationPage, ConversationSummary } from "../chat/history";
const PAGE_SIZE = 20;
const TITLE =
  "COALESCE(h.title, substr((SELECT content FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY position LIMIT 1),1,100),'')";
export function listConversations(
  owner: string,
  search: string,
  archived: boolean,
  cursor?: string,
): ConversationPage {
  if (search.length > 100) throw new Error("bad_request");
  let after: { time: number; id: string } | undefined;
  if (cursor) {
    try {
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        cursor.length > 256 ||
        !Number.isSafeInteger(value.time) ||
        value.time < 0 ||
        typeof value.id !== "string" ||
        !isValidSessionId(value.id)
      )
        throw new Error();
      after = value;
    } catch {
      throw new Error("bad_request");
    }
  }
  const args: (string | number)[] = [
    owner,
    "%" + search.replace(/[!%_]/g, "!$&") + "%",
  ];
  if (after) args.push(after.time, after.time, after.id);
  const rows = db()
    .prepare(
      "SELECT c.id," +
        TITLE +
        " AS title,c.updated_at FROM conversations c LEFT JOIN conversation_meta h ON h.conversation_id=c.id WHERE c.owner_user_id=? AND h.archived_at IS " +
        (archived ? "NOT NULL" : "NULL") +
        " AND " +
        TITLE +
        " LIKE ? ESCAPE '!'" +
        (after ? " AND (c.updated_at<? OR (c.updated_at=? AND c.id<?))" : "") +
        " ORDER BY c.updated_at DESC,c.id DESC LIMIT 21",
    )
    .all(...args) as { id: string; title: string; updated_at: number }[];
  const items: ConversationSummary[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    title: r.title.replace(/\s+/g, " ").trim().slice(0, 100).trim(),
    updatedAt: r.updated_at,
    archived,
  }));
  const last = items.at(-1);
  return {
    items,
    ...(rows.length > PAGE_SIZE && last
      ? {
          cursor: Buffer.from(
            JSON.stringify({ time: last.updatedAt, id: last.id }),
          ).toString("base64url"),
        }
      : {}),
  };
}
export function updateConversation(
  owner: string,
  id: string,
  changes: { title?: string; archived?: boolean },
) {
  if (
    !isValidSessionId(id) ||
    (!Object.hasOwn(changes, "title") && !Object.hasOwn(changes, "archived"))
  )
    throw new Error("bad_request");
  if (changes.title !== undefined && typeof changes.title !== "string")
    throw new Error("bad_request");
  const title = changes.title?.replace(/\s+/g, " ").trim();
  if (
    changes.title !== undefined &&
    (typeof changes.title !== "string" || !title || title.length > 100)
  )
    throw new Error("bad_request");
  if (changes.archived !== undefined && typeof changes.archived !== "boolean")
    throw new Error("bad_request");
  const database = db();
  database
    .transaction(() => {
      if (
        !database
          .prepare("SELECT 1 FROM conversations WHERE id=? AND owner_user_id=?")
          .get(id, owner)
      )
        throw new Error("not_found");
      if (changes.archived !== undefined && activeTurn(owner, id))
        throw new Error("busy");
      database
        .prepare(
          "INSERT INTO conversation_meta(conversation_id) VALUES (?) ON CONFLICT(conversation_id) DO NOTHING",
        )
        .run(id);
      if (title !== undefined)
        database
          .prepare(
            "UPDATE conversation_meta SET title=? WHERE conversation_id IN (SELECT id FROM conversations WHERE id=? AND owner_user_id=?)",
          )
          .run(title, id, owner);
      if (changes.archived !== undefined)
        database
          .prepare(
            "UPDATE conversation_meta SET archived_at=? WHERE conversation_id IN (SELECT id FROM conversations WHERE id=? AND owner_user_id=?)",
          )
          .run(changes.archived ? Date.now() : null, id, owner);
    })
    .immediate();
}
