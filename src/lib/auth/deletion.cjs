/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The account-deletion engine, and the only implementation of the removal order registered
 * in ARCHITECTURE §5 "Account deletion".
 *
 * It is CommonJS on purpose: the reconciliation that stops a restored database from
 * resurrecting a deleted identity has to run from `migrate()`, before any TypeScript
 * runtime exists, and it must execute exactly the same statements the browser-triggered
 * path does. A second copy of that list would be a second thing to get wrong.
 *
 * Nothing here decides *whether* a deletion is authorized — the caller completes the
 * password, second-factor, cooling-off, export and last-administrator gates first. This
 * module only performs an authorized removal, re-entrantly.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { databasePath } = require("../database.cjs");
const { privateKey } = require("./keying.cjs");

const DAY = 86_400_000;
/** How long the final ceremony is refused for. See ARCHITECTURE §5 for the basis. */
const COOLING_OFF_MS = 7 * DAY;
/** How long an eligible request stays completable before it lapses back to nothing. */
const COMPLETION_WINDOW_MS = 30 * DAY;
/**
 * Replaces a deleted account's mail-metadata digest. The row itself stays on purpose: the
 * daily mail budget counts what this site actually sent, and deleting the row would quietly
 * hand the next person more of that budget. What must not survive is the link to an address.
 */
const DELETED_MAIL_HASH = "deleted-account";
const INTENT_FILE = "deleted-accounts.jsonl";

const intentPath = () => path.join(path.dirname(databasePath()), INTENT_FILE);

/**
 * Appends and fsyncs, because the whole value of the record is that it outlives the database
 * it guards against being restored.
 */
function appendIntent(entry) {
  const file = intentPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const handle = fs.openSync(file, "a", 0o600);
  try {
    fs.writeSync(handle, JSON.stringify(entry) + "\n");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  return file;
}

/** The latest entry per identity wins; a torn trailing line from a crash is skipped. */
function readIntents() {
  let raw;
  try { raw = fs.readFileSync(intentPath(), "utf8"); } catch { return []; }
  const latest = new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry.userId !== "string") continue;
    latest.set(entry.userId, entry);
  }
  return [...latest.values()];
}

/**
 * The SDK transcript files this account owns. They sit one level deep in a directory named
 * after the *shared* reader workspace, so only the exact `<sdk_session_id>.jsonl` names this
 * account's conversations carry are ever claimed — never the directory, and never a sibling.
 */
function transcriptPaths(database, userId) {
  const ids = database
    .prepare("SELECT sdk_session_id FROM conversations WHERE owner_user_id=? AND sdk_session_id IS NOT NULL")
    .all(userId)
    .map((row) => row.sdk_session_id)
    // A session id is a filename here, so anything path-shaped is ignored rather than joined.
    .filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(String(id ?? "")));
  if (!ids.length) return [];
  const root = path.join(os.homedir(), ".claude", "projects");
  let projects;
  try { projects = fs.readdirSync(root); } catch { return []; }
  const found = [];
  for (const project of projects) for (const id of ids) {
    const file = path.join(root, project, id + ".jsonl");
    try { if (fs.statSync(file).isFile()) found.push(file); } catch { /* not ours */ }
  }
  return found;
}

/** Returns the paths still standing, so the caller can record what is still owed. */
function removeTranscripts(paths) {
  const outstanding = [];
  for (const file of paths) {
    try { fs.unlinkSync(file); }
    catch (error) { if (error?.code !== "ENOENT") outstanding.push(file); }
  }
  return outstanding;
}

/**
 * Reads the request row, healing a lapsed one by removing it: an expired request is not a
 * queue entry waiting to fire, it is a request that was never completed, and the account it
 * described goes on unchanged.
 */
function readDeletion(database, userId, now = Date.now()) {
  const row = database.prepare(
    "SELECT requested_at requestedAt, eligible_at eligibleAt, expires_at expiresAt, exported_at exportedAt FROM account_deletions WHERE user_id=?",
  ).get(userId);
  if (!row) return { status: "none" };
  if (now >= row.expiresAt) {
    database.prepare("DELETE FROM account_deletions WHERE user_id=?").run(userId);
    return { status: "none" };
  }
  return { status: "pending", ...row, eligible: now >= row.eligibleAt };
}

function requestDeletion(database, userId, now = Date.now()) {
  const current = readDeletion(database, userId, now);
  if (current.status === "pending") return { error: "already_requested", state: current };
  if (!database.prepare("SELECT id FROM user WHERE id=?").get(userId)) return { error: "not_found" };
  database.prepare(
    "INSERT INTO account_deletions (user_id, requested_at, eligible_at, expires_at, exported_at) VALUES (?,?,?,?,NULL)",
  ).run(userId, now, now + COOLING_OFF_MS, now + COOLING_OFF_MS + COMPLETION_WINDOW_MS);
  return { state: readDeletion(database, userId, now) };
}

function withdrawDeletion(database, userId) {
  return database.prepare("DELETE FROM account_deletions WHERE user_id=?").run(userId).changes > 0;
}

/** Only a request that is still open can be stamped, and the newest export is the one that counts. */
function stampExport(database, userId, now = Date.now()) {
  database.prepare("UPDATE account_deletions SET exported_at=? WHERE user_id=?").run(now, userId);
}

/** The `/admin` predicate exactly: this is what would stop being reachable. */
function administratorCount(database) {
  return database.prepare(
    "SELECT count(*) n FROM user WHERE role='admin' AND status='active' AND emailVerified=1",
  ).get().n;
}
function isAdministrator(database, userId) {
  return Boolean(database.prepare(
    "SELECT id FROM user WHERE id=? AND role='admin' AND status='active' AND emailVerified=1",
  ).get(userId));
}

/**
 * Removes one account and everything that describes it, in the order the inventory states.
 *
 * The intent is written first and the database work happens in a single immediate
 * transaction, so the observable outcomes are "nothing happened" and "the identity is gone":
 * `foreign_keys = ON` is what makes a store this list missed an error rather than an orphan,
 * and `foreign_key_check` is asserted before the commit for the same reason. Only the file
 * sweep is outside the transaction, and what it could not finish stays recorded as owed.
 */
function executeDeletion(database, userId, now = Date.now()) {
  const user = database.prepare("SELECT id, email FROM user WHERE id=?").get(userId);
  if (!user) return { deleted: false, alreadyGone: true };
  const emailHash = privateKey(user.email);
  // Every bucket is keyed by a digest, and the site addresses some of them by the address as
  // typed and some by the normalized form. Both are this account's rows.
  const normalizedHash = privateKey(String(user.email).trim().toLowerCase());
  const userHash = privateKey(userId);
  const transcripts = transcriptPaths(database, userId);
  appendIntent({ userId, at: now, emailHash, transcripts });

  database.transaction(() => {
    // `verification` is the one table that can outlive the account while still naming it:
    // email-OTP identifiers embed the address in plaintext, and the two-factor and passkey
    // rows carry the user id in their value.
    database.prepare(
      `DELETE FROM verification
        WHERE identifier LIKE ?
           OR value = ?
           OR json_extract(value, '$.userData.id') = ?`,
    ).run("%-otp-" + user.email, userId, userId);
    database.prepare(
      "DELETE FROM limits WHERE key LIKE ? OR key LIKE ? OR key LIKE ?",
    ).run("%" + emailHash + "%", "%" + normalizedHash + "%", "%" + userHash + "%");
    database.prepare(
      "UPDATE mail_requests SET email_hash=? WHERE email_hash IN (?,?)",
    ).run(DELETED_MAIL_HASH, emailHash, normalizedHash);
    // No user-level cascade exists for these two, which is precisely why a bare
    // `delete user` is not a deletion plan.
    database.prepare("DELETE FROM conversations WHERE owner_user_id=?").run(userId);
    database.prepare("DELETE FROM ai_usage WHERE user_id=?").run(userId);
    database.prepare("DELETE FROM account_deletions WHERE user_id=?").run(userId);
    // Everything that does cascade — account, session, preferences, email changes,
    // security events, factors, passkeys — goes with this statement or nothing commits.
    database.prepare("DELETE FROM user WHERE id=?").run(userId);
    const leftovers = database.prepare("PRAGMA foreign_key_check").all();
    if (leftovers.length) throw new Error("foreign_keys_left_after_delete");
  }).immediate();

  const outstanding = removeTranscripts(transcripts);
  appendIntent({ userId, at: Date.now(), emailHash, transcripts: outstanding });
  return { deleted: true, transcripts, outstanding };
}

/**
 * Honours every durable intent: an identity that is still standing is deleted again, and a
 * file sweep that did not finish is retried. Called from `migrate()`, so it runs before any
 * request is served — including right after an operator restores an older database.
 *
 * It acts rather than asks because a line can only have been written by someone who had
 * already completed the full confirmation ceremony for that account.
 */
function reconcileDeletions(database, now = Date.now()) {
  const repaired = [];
  for (const intent of readIntents()) {
    if (database.prepare("SELECT id FROM user WHERE id=?").get(intent.userId)) {
      repaired.push({ userId: intent.userId, kind: "identity" });
      executeDeletion(database, intent.userId, now);
      continue;
    }
    const owed = (intent.transcripts ?? []).filter((file) => fs.existsSync(file));
    if (!owed.length) continue;
    repaired.push({ userId: intent.userId, kind: "transcripts", files: owed.length });
    appendIntent({ userId: intent.userId, at: now, emailHash: intent.emailHash, transcripts: removeTranscripts(owed) });
  }
  return repaired;
}

module.exports = {
  COOLING_OFF_MS, COMPLETION_WINDOW_MS, DELETED_MAIL_HASH, INTENT_FILE,
  intentPath, appendIntent, readIntents, transcriptPaths, removeTranscripts,
  readDeletion, requestDeletion, withdrawDeletion, stampExport,
  administratorCount, isAdministrator, executeDeletion, reconcileDeletions,
};
