import { randomUUID } from "node:crypto";
import { db } from "../db";

/** Closed vocabulary: nothing outside this list can be written or displayed. */
export const SECURITY_EVENT_KINDS = [
  "password_change",
  "email_change",
  "session_revoke_one",
  "session_revoke_others",
  "two_factor_enable",
  "two_factor_disable",
  "two_factor_recovery_codes_regenerated",
  "passkey_register",
  "passkey_remove",
] as const;
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

/** A row is visible for 180 days, and an account never keeps more than 100. */
export const RETENTION_DAYS = 180;
export const MAX_EVENTS_PER_USER = 100;

export type SecurityEvent = {
  id: string;
  kind: SecurityEventKind;
  occurredAt: number;
  browser: string;
  system: string;
  maskedEmail?: string;
  sessionsAffected?: number;
};

type Row = {
  id: string;
  kind: string;
  occurred_at: number;
  browser: string | null;
  system: string | null;
  masked_email: string | null;
  sessions_affected: number | null;
};

const retentionCutoff = () => Date.now() - RETENTION_DAYS * 86_400_000;

/**
 * Expired rows and anything past the per-account cap are dropped here, so the window
 * is enforced by the store rather than by the reader. This deletes only from
 * `security_events`; no other account, session, chat, book or backup data is in scope.
 */
function prune(userId: string) {
  const database = db();
  database
    .prepare("DELETE FROM security_events WHERE user_id=? AND occurred_at<?")
    .run(userId, retentionCutoff());
  database
    .prepare(
      "DELETE FROM security_events WHERE user_id=? AND id NOT IN (SELECT id FROM security_events WHERE user_id=? ORDER BY occurred_at DESC, id DESC LIMIT ?)",
    )
    .run(userId, userId, MAX_EVENTS_PER_USER);
}

/**
 * Callers that mutate through the library invoke this only after the change is
 * confirmed; a throw there is swallowed by the caller rather than reported as a
 * failed security operation. `applyEmailChange` calls it inside its own transaction
 * instead, so that change and record commit or roll back together.
 */
export function recordSecurityEvent(event: {
  userId: string;
  kind: SecurityEventKind;
  browser?: string;
  system?: string;
  maskedEmail?: string;
  sessionsAffected?: number;
}) {
  const { userId, kind, browser, system, maskedEmail, sessionsAffected } = event;
  if (!SECURITY_EVENT_KINDS.includes(kind)) throw new Error("invalid_event_kind");
  db()
    .prepare(
      "INSERT INTO security_events (id,user_id,kind,occurred_at,browser,system,masked_email,sessions_affected) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      userId,
      kind,
      Date.now(),
      browser ?? null,
      system ?? null,
      maskedEmail ?? null,
      sessionsAffected ?? null,
    );
  prune(userId);
}

/** The caller's own events, newest first, already inside the retention window. */
export function readSecurityEvents(userId: string): SecurityEvent[] {
  const rows = db()
    .prepare(
      "SELECT id,kind,occurred_at,browser,system,masked_email,sessions_affected FROM security_events WHERE user_id=? AND occurred_at>=? ORDER BY occurred_at DESC, id DESC LIMIT ?",
    )
    .all(userId, retentionCutoff(), MAX_EVENTS_PER_USER) as Row[];
  return rows.flatMap((row) =>
    (SECURITY_EVENT_KINDS as readonly string[]).includes(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind as SecurityEventKind,
            occurredAt: row.occurred_at,
            browser: row.browser ?? "unknown",
            system: row.system ?? "unknown",
            ...(row.masked_email ? { maskedEmail: row.masked_email } : {}),
            ...(row.sessions_affected === null
              ? {}
              : { sessionsAffected: row.sessions_affected }),
          } satisfies SecurityEvent,
        ]
      : [],
  );
}
