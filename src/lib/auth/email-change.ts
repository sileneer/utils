import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { privateKey, consumeLimits } from "./limits";
import { sendOTP } from "./mail";
import { withAccountChange, beforePasswordWrite } from "./lifecycle";

/** Same 600s / five-attempt policy as the registration and reset codes. */
const CODE_TTL_MS = 600_000;
const MAX_ATTEMPTS = 5;

export type Side = "old" | "new";

export type Pending = {
  id: string;
  maskedNewEmail: string;
  expiresAt: number;
  attemptsLeft: { old: number; new: number };
};

type Row = {
  id: string; user_id: string; old_email_hash: string; new_email: string;
  old_code_digest: string; new_code_digest: string; old_attempts: number;
  new_attempts: number; status: string; created_at: number; expires_at: number;
};

const select = (id: string) =>
  db().prepare("SELECT * FROM email_changes WHERE id=?").get(id) as Row | undefined;

const digest = (value: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(`change-email:${value}`).digest("hex");

/** Length-checked fixed-time compare; a wrong length is a mismatch, not an exception. */
function matches(stored: string, candidate: string) {
  const a = Buffer.from(stored, "hex"), b = Buffer.from(digest(candidate), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function newCode() {
  return String(randomBytes(3).readUIntBE(0, 3) % 900_000 + 100_000);
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain || !name) return "***";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(8, name.length - visible.length)))}@${domain}`;
}

/** Expired rows are closed rather than left ambiguous for the next request. */
function expire(userId: string) {
  db()
    .prepare("UPDATE email_changes SET status='cancelled' WHERE user_id=? AND status='pending' AND expires_at<=?")
    .run(userId, Date.now());
}

function cancel(id: string) {
  db().prepare("UPDATE email_changes SET status='cancelled' WHERE id=?").run(id);
}

/**
 * The account's one live transaction, if it still has one. The caller supplies the
 * address the session is currently signing in with so a target that moved since the
 * request was opened cannot be confirmed.
 */
export function pendingEmailChange(userId: string, oldEmail: string): Pending | null {
  expire(userId);
  const row = db()
    .prepare("SELECT * FROM email_changes WHERE user_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1")
    .get(userId, Date.now()) as Row | undefined;
  if (!row) return null;
  if (row.old_email_hash !== privateKey(oldEmail)) return null;
  return {
    id: row.id,
    maskedNewEmail: maskEmail(row.new_email),
    expiresAt: row.expires_at,
    attemptsLeft: {
      old: Math.max(0, MAX_ATTEMPTS - row.old_attempts),
      new: Math.max(0, MAX_ATTEMPTS - row.new_attempts),
    },
  };
}

function sendBucket(side: Side, email: string) {
  const key = privateKey(email);
  return [
    { key: `send:${key}:change-email-${side}:minute`, max: 1, window: 60_000 },
    { key: `send:${key}:change-email-${side}:hour`, max: 3, window: 3_600_000 },
  ];
}

/**
 * Open a request. Both addresses receive their own code; the sign-in address stays
 * untouched until both are confirmed. A caller that cannot receive at the old address
 * cannot complete this, which is why no path here commits on the new code alone.
 */
export async function startEmailChange(userId: string, oldEmail: string, newEmail: string) {
  expire(userId);
  if (oldEmail.toLowerCase() === newEmail.toLowerCase()) throw new Error("email_same");
  if (
    !consumeLimits([
      { key: `emailchange:${privateKey(userId)}:start`, max: 3, window: 3_600_000 },
      ...sendBucket("old", oldEmail),
      ...sendBucket("new", newEmail),
    ])
  )
    throw new Error("rate_limited");
  db().prepare("UPDATE email_changes SET status='cancelled' WHERE user_id=? AND status='pending'").run(userId);
  const id = randomUUID(), now = Date.now();
  const codes = { old: newCode(), new: newCode() };
  try {
    db()
      .prepare(
        "INSERT INTO email_changes (id,user_id,old_email_hash,new_email,old_code_digest,new_code_digest,old_attempts,new_attempts,status,created_at,expires_at) VALUES (?,?,?,?,?,?,0,0,'pending',?,?)",
      )
      .run(id, userId, privateKey(oldEmail), newEmail, digest(codes.old), digest(codes.new), now, now + CODE_TTL_MS);
  } catch (error) {
    // Either the target already belongs to an account or another live request holds it.
    // The answer is the same generic one either way, so nothing confirms registration.
    if (error instanceof Error && error.message.includes("UNIQUE")) return { started: true, generic: true };
    throw error;
  }
  try {
    await sendOTP({ email: oldEmail, otp: codes.old, type: "change-email-old" });
    await sendOTP({ email: newEmail, otp: codes.new, type: "change-email-new" });
  } catch (error) {
    // A half-issued transaction must not stay confirmable by nobody.
    cancel(id);
    throw error;
  }
  return { started: true, generic: false, pending: { id, maskedNewEmail: maskEmail(newEmail), expiresAt: now + CODE_TTL_MS, attemptsLeft: { old: MAX_ATTEMPTS, new: MAX_ATTEMPTS } } satisfies Pending };
}

/** Rotate one side's code and renew the transaction window. */
export async function resendEmailChange(
  userId: string,
  id: string,
  oldEmail: string,
  side: Side,
) {
  expire(userId);
  const row = select(id);
  if (!row || row.user_id !== userId || row.status !== "pending" || row.expires_at <= Date.now())
    throw new Error("not_found");
  if (row.old_email_hash !== privateKey(oldEmail)) throw new Error("stale_target");
  if (!consumeLimits(sendBucket(side, side === "old" ? oldEmail : row.new_email)))
    throw new Error("rate_limited");
  const code = newCode(), now = Date.now();
  db()
    .prepare(`UPDATE email_changes SET ${side}_code_digest=?, ${side}_attempts=0, created_at=?, expires_at=? WHERE id=?`)
    .run(digest(code), now, now + CODE_TTL_MS, id);
  await sendOTP({
    email: side === "old" ? oldEmail : row.new_email,
    otp: code,
    type: `change-email-${side}`,
  });
  return { resent: true, expiresAt: now + CODE_TTL_MS };
}

export function cancelEmailChange(userId: string, id: string, oldEmail: string) {
  const row = select(id);
  if (!row || row.user_id !== userId || row.old_email_hash !== privateKey(oldEmail))
    throw new Error("not_found");
  if (row.status === "completed") throw new Error("already_completed");
  if (row.status === "cancelled") return { cancelled: true };
  cancel(id);
  return { cancelled: true };
}

/** Write the new address and sign every session out, atomically. */
export function applyEmailChange(userId: string, newEmail: string) {
  const database = db();
  try {
    // `user` timestamps are ISO text because that is what the library writes;
    // `account` has no email column, so the sign-in address lives on `user` alone.
    database
      .transaction(() => {
        const now = new Date().toISOString();
        if (!database.prepare("UPDATE user SET email=?, emailVerified=1, updatedAt=? WHERE id=?").run(newEmail, now, userId).changes)
          throw new Error("not_found");
        database.prepare("DELETE FROM session WHERE userId=?").run(userId);
      })
      .immediate();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) throw new Error("email_taken");
    throw error;
  }
}

/**
 * Confirm both codes and commit. Nothing before the fence can change the address;
 * the write happens only after the account's running AI request reached a confirmed
 * terminal state, in the same step that revokes every session.
 */
export async function commitEmailChange(
  userId: string,
  id: string,
  oldEmail: string,
  codes: { old: string; new: string },
  stopAndCommit: (newEmail: string) => Promise<void>,
) {
  expire(userId);
  const row = select(id);
  if (!row || row.user_id !== userId || row.status !== "pending") throw new Error("not_found");
  if (row.old_email_hash !== privateKey(oldEmail)) {
    cancel(id);
    throw new Error("stale_target");
  }
  if (row.expires_at <= Date.now()) {
    cancel(id);
    throw new Error("expired");
  }
  for (const side of ["old", "new"] as const) {
    if (row[`${side}_attempts`] >= MAX_ATTEMPTS) {
      cancel(id);
      throw new Error("attempts_exhausted");
    }
    if (!matches(row[`${side}_code_digest`], codes[side])) {
      const attempts = row[`${side}_attempts`] + 1;
      db().prepare(`UPDATE email_changes SET ${side}_attempts=? WHERE id=?`).run(attempts, id);
      // The attempt that closes the budget says so, instead of leaving the user
      // with a generic "wrong code" for a request that no longer exists.
      if (attempts >= MAX_ATTEMPTS) {
        cancel(id);
        throw new Error("attempts_exhausted");
      }
      throw new Error("code_failed");
    }
  }
  // Consumed before the write so a concurrent replay of the same pair cannot commit twice.
  db().prepare("UPDATE email_changes SET status='completed' WHERE id=? AND status='pending'").run(id);
  try {
    await withAccountChange(userId, async () => {
      await beforePasswordWrite();
      await stopAndCommit(row.new_email);
    }, false);
  } catch (error) {
    if (error instanceof Error && error.message === "email_taken") {
      cancel(id);
      throw error;
    }
    // The address did not move: reopen so a confirmed stop can be retried.
    db().prepare("UPDATE email_changes SET status='pending' WHERE id=?").run(id);
    throw error;
  }
  return { changedTo: row.new_email };
}

/** Best-effort heads-up to the retired address; never part of the decision. */
export async function notifyOldEmail(oldEmail: string) {
  await sendOTP({ email: oldEmail, otp: "", type: "change-email-notice" });
}
