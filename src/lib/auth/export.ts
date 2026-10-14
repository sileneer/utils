import { db } from "../db";
import { recordedDetails, totalTokens, type MessageDetails } from "../chat/details";
import { isTurnActive } from "../agent/active-query";
import { isValidSessionId } from "../agent/sessions";
import { readPreferences } from "./preferences";
import type { AccountUser } from "./identity";

export const EXPORT_SCHEMA_VERSION = 1;

/**
 * First release is deliberately bounded: no queue, no background job and no
 * unbounded read. Anything above these ceilings is reported as a partial export
 * that must be narrowed, never silently trimmed.
 */
export const EXPORT_LIMITS = {
  conversations: 200,
  messages: 2000,
  /** Pre-flight ceiling on materialized message text. */
  contentBytes: 6 * 1024 * 1024,
  /** Final ceiling on the serialized document. */
  outputBytes: 8 * 1024 * 1024,
};

/** Stated in every document so the reader knows what is deliberately absent. */
export const EXPORT_EXCLUDED = [
  "passwordHashes",
  "credentialRows",
  "verificationCodes",
  "sessionTokens",
  "sessionRows",
  "nativeSdkSessionIds",
  "mailDeliveryRecords",
  "rateLimitBuckets",
  "otherUsers",
  "environmentValues",
  "sdkTranscripts",
  "bookCacheAndVersionWorkspace",
] as const;

export type ExportFormat = "json" | "markdown";
export type ExportScope = { conversation?: string; from?: number; to?: number };
export type Counts = {
  conversations: number;
  messages: number;
  usageRecords: number;
  contentBytes: number;
  oldestAt: number | null;
  newestAt: number | null;
};
export type Segments = {
  conversations: { id: string; title: string; updatedAt: string }[];
  dateRanges: { from: string; to: string }[];
};
export type ExportSummary = {
  counts: Counts;
  limits: typeof EXPORT_LIMITS;
  complete: boolean;
  truncatedReason: "conversationCount" | "messageCount" | "contentSize" | null;
  suggestedSegments: Segments;
};
type Reject = { error: "bad_request" } | { error: "not_found" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Validate the entire query surface before any SQL runs. */
export function parseScope(
  params: URLSearchParams,
): { format: ExportFormat; scope: ExportScope } | Reject {
  for (const key of params.keys())
    if (!["format", "conversation", "from", "to"].includes(key)) return { error: "bad_request" };
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "markdown") return { error: "bad_request" };
  const scope: ExportScope = {};
  const conversation = params.get("conversation");
  if (conversation !== null) {
    if (!isValidSessionId(conversation)) return { error: "bad_request" };
    scope.conversation = conversation;
  }
  for (const key of ["from", "to"] as const) {
    const value = params.get(key);
    if (value === null) continue;
    if (!DAY.test(value)) return { error: "bad_request" };
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isSafeInteger(parsed)) return { error: "bad_request" };
    scope[key] = parsed;
  }
  if (scope.conversation !== undefined && (scope.from !== undefined || scope.to !== undefined))
    return { error: "bad_request" };
  if (scope.from !== undefined && scope.to !== undefined && scope.from >= scope.to)
    return { error: "bad_request" };
  return { format, scope };
}

/** A date range selects conversations by activity time; every selected
 * conversation always contributes all of its messages. */
function where(userId: string, scope: ExportScope) {
  const clauses = ["c.owner_user_id=?"];
  const values: (string | number)[] = [userId];
  if (scope.conversation !== undefined) { clauses.push("c.id=?"); values.push(scope.conversation); }
  if (scope.from !== undefined) { clauses.push("c.updated_at>=?"); values.push(scope.from); }
  if (scope.to !== undefined) { clauses.push("c.updated_at<?"); values.push(scope.to); }
  return { filter: clauses.join(" AND "), values };
}

function limitReason(counts: Counts): ExportSummary["truncatedReason"] {
  if (counts.conversations > EXPORT_LIMITS.conversations) return "conversationCount";
  if (counts.messages > EXPORT_LIMITS.messages) return "messageCount";
  if (counts.contentBytes > EXPORT_LIMITS.contentBytes) return "contentSize";
  return null;
}

/** Every read for one response runs inside a single SQLite transaction, so counts
 * and body can never straddle a concurrent write. The caller records the instant
 * it took the snapshot as the document's read boundary. */
function snapshot<T>(work: () => T): T {
  return db().transaction(work).deferred();
}

export function exportSummary(userId: string, scope: ExportScope): ExportSummary {
  return snapshot(() => {
    const counts = readCounts(userId, scope);
    const reason = limitReason(counts);
    return {
      counts,
      limits: EXPORT_LIMITS,
      complete: reason === null,
      truncatedReason: reason,
      suggestedSegments: suggestSegments(userId, scope),
    };
  });
}

function readCounts(userId: string, scope: ExportScope): Counts {
  const { filter, values } = where(userId, scope);
  const database = db();
  const aggregate = database.prepare(
    `SELECT count(*) conversations, min(c.updated_at) oldestAt, max(c.updated_at) newestAt,
        coalesce(sum((SELECT count(*) FROM messages m WHERE m.conversation_id=c.id)), 0) messages,
        coalesce(sum((SELECT length(m.content) FROM messages m WHERE m.conversation_id=c.id)), 0) contentBytes
     FROM conversations c WHERE ${filter}`,
  ).get(...values) as Pick<Counts, "conversations" | "messages" | "contentBytes"> & { oldestAt: number | null; newestAt: number | null };
  const usage = database.prepare(
    `SELECT count(*) n FROM ai_usage a
     WHERE a.user_id=? AND exists (
       SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id
       WHERE m.turn_id=a.turn_id AND ${filter})`,
  ).get(userId, ...values) as { n: number };
  return { ...aggregate, usageRecords: usage.n, oldestAt: aggregate.oldestAt, newestAt: aggregate.newestAt };
}

function suggestSegments(userId: string, scope: ExportScope): Segments {
  const { filter, values } = where(userId, scope);
  const rows = db().prepare(
    `SELECT c.id, c.updated_at, t.title,
        (SELECT m.content FROM messages m WHERE m.conversation_id=c.id AND m.role='user' ORDER BY m.position LIMIT 1) first_question
     FROM conversations c LEFT JOIN conversation_meta t ON t.conversation_id=c.id
     WHERE ${filter} ORDER BY c.updated_at DESC, c.id DESC LIMIT 40`,
  ).all(...values) as { id: string; updated_at: number; title: string | null; first_question: string | null }[];
  const months = new Map<string, { from: number; to: number }>();
  for (const row of rows) {
    const start = new Date(row.updated_at);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(1);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    months.set(start.toISOString().slice(0, 7), { from: start.getTime(), to: end.getTime() });
  }
  const sorted = [...months.values()].sort((a, b) => b.from - a.from);
  return {
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title ?? (row.first_question ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    dateRanges: sorted.map((range) => ({ from: isoDay(range.from), to: isoDay(range.to) })),
  };
}

type MessageRow = {
  id: string; turn_id: string; position: number; role: string; content: string;
  at: number; status: string; error: string | null; revision: string | null; context_json: string | null;
};
type UsageRow = { turn_id: string; status: string; created_at: number; usage_json: string | null };
type ExportedMessage = ReturnType<typeof projectMessage>;
type ExportedUsage = { turnId: string; status: string; at: string; reported?: MessageDetails; totalTokens?: number };
type ExportedConversation = {
  id: string; title: string; titleSource: "saved" | "derivedFromFirstQuestion"; archived: boolean;
  archivedAt?: string; updatedAt: string; sourceRevision?: string; needsRebuild: boolean;
  messageCount: number; usageRecordCount: number; messages: ExportedMessage[]; usage: ExportedUsage[];
};

function projectMessage(userId: string, conversationId: string, row: MessageRow) {
  const inProgress = row.status === "pending" || row.status === "streaming";
  const active = inProgress && isTurnActive(userId, row.turn_id, conversationId);
  // A turn left mid-flight by a dead connection is reported as interrupted,
  // matching the history projection; an owned live turn is marked, never finished.
  const status = inProgress && !active ? "failed" : row.status;
  const error = inProgress && !active ? "interrupted" : (row.error ?? undefined);
  let context: unknown;
  if (row.context_json) { try { context = JSON.parse(row.context_json); } catch { context = undefined; } }
  return {
    position: row.position,
    role: row.role,
    status,
    content: row.content,
    at: new Date(row.at).toISOString(),
    ...(error ? { error } : {}),
    ...(active ? { inProgressAtExport: true } : {}),
    ...(row.revision ? { sourceRevision: row.revision } : {}),
    ...(context === undefined ? {} : { sourceContext: context }),
  };
}

/** Reported usage only, through the same public allowlist the message UI uses. */
function projectUsage(row: UsageRow): ExportedUsage {
  const details = recordedDetails(row.usage_json);
  const tokens = details?.tokens ? totalTokens(details.tokens) : undefined;
  return {
    turnId: row.turn_id,
    status: row.status,
    at: new Date(row.created_at).toISOString(),
    ...(details ? { reported: details } : {}),
    ...(tokens === undefined ? {} : { totalTokens: tokens }),
  };
}

export type ExportBundle = {
  body: string;
  filename: string;
  contentType: string;
  complete: boolean;
  counts: Counts;
};
export type ExportOutcome =
  | { result: ExportBundle }
  | { error: "not_found" }
  | { error: "too_large"; summary: ExportSummary };

export function buildExport(
  user: AccountUser,
  format: ExportFormat,
  scope: ExportScope,
  readBoundary: string,
): ExportOutcome {
  const read = snapshot(():
    | { missing: true }
    | { counts: Counts; reason: NonNullable<ExportSummary["truncatedReason"]> }
    | { counts: Counts; reason: null; conversations: ExportedConversation[] } => {
    const counts = readCounts(user.id, scope);
    const reason = limitReason(counts);
    if (reason) return { counts, reason };
    if (scope.conversation !== undefined
      && !db().prepare("SELECT id FROM conversations WHERE id=? AND owner_user_id=?").get(scope.conversation, user.id))
      return { missing: true };
    const { filter, values } = where(user.id, scope);
    const rows = db().prepare(
      `SELECT c.id, c.revision, c.needs_rebuild, c.updated_at, t.title, t.archived_at
       FROM conversations c LEFT JOIN conversation_meta t ON t.conversation_id=c.id
       WHERE ${filter} ORDER BY c.updated_at DESC, c.id DESC`,
    ).all(...values) as {
      id: string; revision: string | null; needs_rebuild: number; updated_at: number;
      title: string | null; archived_at: number | null;
    }[];
    const messages = db().prepare(
      "SELECT id,turn_id,position,role,content,at,status,error,revision,context_json FROM messages WHERE conversation_id=? ORDER BY position",
    );
    const usage = db().prepare(
      "SELECT turn_id,status,created_at,usage_json FROM ai_usage WHERE user_id=? AND turn_id IN (SELECT turn_id FROM messages WHERE conversation_id=?) ORDER BY created_at,rowid",
    );
    const conversations = rows.map((row) => {
      const found = messages.all(row.id) as MessageRow[];
      const firstQuestion = found.find((message) => message.role === "user");
      return {
        id: row.id,
        title: row.title ?? (firstQuestion?.content ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
        titleSource: (row.title ? "saved" : "derivedFromFirstQuestion") as "saved" | "derivedFromFirstQuestion",
        archived: row.archived_at !== null,
        ...(row.archived_at === null ? {} : { archivedAt: new Date(row.archived_at).toISOString() }),
        updatedAt: new Date(row.updated_at).toISOString(),
        ...(row.revision ? { sourceRevision: row.revision } : {}),
        needsRebuild: Boolean(row.needs_rebuild),
        messageCount: found.length,
        usageRecordCount: 0,
        messages: found.map((message) => projectMessage(user.id, row.id, message)),
        usage: (usage.all(user.id, row.id) as UsageRow[]).map(projectUsage),
      };
    });
    for (const conversation of conversations) conversation.usageRecordCount = conversation.usage.length;
    return { counts, reason: null, conversations };
  });

  if ("missing" in read) return { error: "not_found" };
  if (read.reason) return { error: "too_large", summary: exportSummary(user.id, scope) };

  const document = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    readBoundary,
    format,
    scope: describeScope(scope),
    completeness: {
      complete: true,
      truncated: false,
      reason: null as ExportSummary["truncatedReason"],
      limits: EXPORT_LIMITS,
      note: "Every conversation matching this scope is included in full. Absent optional fields are genuinely unrecorded; nothing is estimated.",
    },
    counts: {
      conversations: read.counts.conversations,
      messages: read.counts.messages,
      usageRecords: read.counts.usageRecords,
      activityRange: {
        oldest: read.counts.oldestAt === null ? null : new Date(read.counts.oldestAt).toISOString(),
        newest: read.counts.newestAt === null ? null : new Date(read.counts.newestAt).toISOString(),
      },
    },
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      preferences: readPreferences(user.id),
    },
    conversations: read.conversations,
    excluded: [...EXPORT_EXCLUDED],
  };

  const body = format === "json"
    ? JSON.stringify(document, null, 2)
    : renderMarkdown(document, read.conversations);
  if (new TextEncoder().encode(body).length > EXPORT_LIMITS.outputBytes)
    return { error: "too_large", summary: exportSummary(user.id, scope) };
  return {
    result: {
      body,
      filename: `utils-export-${document.generatedAt.slice(0, 10)}.${format === "json" ? "json" : "md"}`,
      contentType: format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      complete: true,
      counts: read.counts,
    },
  };
}

function describeScope(scope: ExportScope) {
  if (scope.conversation !== undefined)
    return { kind: "conversation" as const, conversationId: scope.conversation, note: "All messages of this conversation are included." };
  if (scope.from !== undefined || scope.to !== undefined)
    return {
      kind: "dateRange" as const,
      from: scope.from === undefined ? null : isoDay(scope.from),
      to: scope.to === undefined ? null : isoDay(scope.to),
      note: "Conversations are selected by activity time within these UTC day bounds; each selected conversation includes all of its messages.",
    };
  return { kind: "allConversations" as const, note: "Every conversation owned by this account." };
}

type ExportScopeDescription = ReturnType<typeof describeScope>;
type ExportDocument = {
  schemaVersion: number;
  generatedAt: string;
  readBoundary: string;
  format: ExportFormat;
  scope: ExportScopeDescription;
  completeness: {
    complete: boolean;
    truncated: boolean;
    reason: ExportSummary["truncatedReason"];
    limits: typeof EXPORT_LIMITS;
    note: string;
  };
  counts: {
    conversations: number;
    messages: number;
    usageRecords: number;
    activityRange: { oldest: string | null; newest: string | null };
  };
  account: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    preferences: { theme: string | null; language: string | null };
  };
  conversations: ExportedConversation[];
  excluded: string[];
};

const stamp = (iso: string) => iso.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

function renderMarkdown(document: ExportDocument, conversations: ExportedConversation[]) {
  const out: string[] = [];
  const push = (value = "") => out.push(value);
  push("# Utils account export");
  push();
  push(`- Schema version: ${document.schemaVersion}`);
  push(`- Generated: ${stamp(document.generatedAt)}`);
  push(`- Consistent read boundary: ${stamp(document.readBoundary)}`);
  push(`- Scope: ${document.scope.kind}${"conversationId" in document.scope ? ` \`${String(document.scope.conversationId)}\`` : ""}`);
  push(`- Completeness: **complete** — ${document.completeness.note}`);
  push(`- Counts: ${document.counts.conversations} conversation(s) · ${document.counts.messages} message(s) · ${document.counts.usageRecords} usage record(s)`);
  push(`- Account: ${document.account.name} <${document.account.email}>, created ${stamp(document.account.createdAt)}`);
  push(`- Saved preferences: theme *${document.account.preferences.theme ?? "follow this device"}*, language *${document.account.preferences.language ?? "follow this device"}*`);
  push();
  push("Absent fields are genuinely unrecorded: no token total, timing or cost is estimated, and a turn still generating at the read boundary is marked rather than shown as finished.");
  push();
  if (conversations.length === 0) push("_This account has no conversations yet; the profile fields above are the whole export._");
  for (const conversation of conversations) {
    push("---");
    push();
    push(`## ${conversation.title || "(untitled conversation)"}`);
    push();
    push(`- Conversation id: \`${conversation.id}\``);
    push(`- Title source: ${conversation.titleSource}`);
    push(`- Last activity: ${stamp(conversation.updatedAt)}`);
    push(`- Archived: ${conversation.archived ? `yes (since ${conversation.archivedAt ? stamp(conversation.archivedAt) : "unknown"})` : "no"}`);
    push(`- Pinned source revision: ${conversation.sourceRevision ?? "not recorded"}`);
    push(`- Rebuild needed: ${conversation.needsRebuild ? "yes" : "no"}`);
    push(`- Messages: ${conversation.messageCount} · usage records: ${conversation.usageRecordCount}`);
    for (const message of conversation.messages) {
      push();
      push(`### ${message.role === "user" ? "Question" : "Answer"} — ${stamp(message.at)} · ${message.status}`);
      push();
      if (message.inProgressAtExport) push("> This turn was still being generated when the export was taken; the text below is partial as of the read boundary.");
      if (message.error) push(`> Ended with: \`${message.error}\``);
      if (message.sourceRevision) push(`> Message source revision: \`${message.sourceRevision}\``);
      const context = message.sourceContext as { text?: string; revision?: string; section?: number; item?: number } | undefined;
      if (context) {
        push(`> Pinned source context — revision \`${context.revision ?? "unknown"}\`${context.section !== undefined ? `, section ${context.section}` : ""}${context.item !== undefined ? `, item ${context.item}` : ""}`);
        for (const passage of String(context.text ?? "").split("\n")) push(`> ${passage}`);
      }
      push();
      push(message.content);
    }
    if (conversation.usage.length) {
      push();
      push("#### Reported usage");
      push();
      for (const record of conversation.usage) {
        const tokens = record.totalTokens === undefined ? "token counts not reported" : `${record.totalTokens} tokens reported`;
        push(`- Turn \`${record.turnId}\`: settled as **${record.status}** at ${stamp(record.at)}${record.reported?.model ? ` using \`${record.reported.model}\`` : ""}; ${tokens}. Cost is never computed.`);
      }
    }
    push();
  }
  push("---");
  push();
  push(`Not included by design: ${EXPORT_EXCLUDED.join(", ")}.`);
  return out.join("\n");
}
