/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { databasePath } = require("../database.cjs");
const { readLedger, appendLedger } = require("../durable-jsonl.cjs");
const ownershipPath = () => path.join(path.dirname(databasePath()), "sdk-transcripts.jsonl");
const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const valid = (entry) => entry && typeof entry.userId === "string" && entry.userId.length > 0 && entry.userId.length <= 128 && validId(entry.sdkSessionId);

/** Resume state may be discarded, but a database restore must not lose file ownership. */
function ownedTranscriptIds(userId) {
  return readLedger(ownershipPath(), valid).records.filter((entry) => entry.userId === userId).map((entry) => entry.sdkSessionId);
}
function recordTranscript(userId, sdkSessionId) {
  if (!valid({ userId, sdkSessionId })) throw new Error("invalid_transcript_owner");
  const owners = readLedger(ownershipPath(), valid).records;
  if (owners.some((entry) => entry.sdkSessionId === sdkSessionId && entry.userId !== userId))
    throw new Error("transcript_owner_conflict");
  if (!owners.some((entry) => entry.userId === userId && entry.sdkSessionId === sdkSessionId))
    appendLedger(ownershipPath(), { userId, sdkSessionId }, valid);
}
function backfillTranscriptOwners(database) {
  // Only ids with an existing explicit owner can be claimed; never scan/guess old logs.
  for (const row of database.prepare("SELECT owner_user_id,sdk_session_id FROM conversations WHERE sdk_session_id IS NOT NULL").all()) {
    if (validId(row.sdk_session_id)) recordTranscript(row.owner_user_id, row.sdk_session_id);
  }
  // Validate the preserved ledger even when the restored DB has no native resume ids.
  readLedger(ownershipPath(), valid);
}
module.exports = { ownershipPath, recordTranscript, ownedTranscriptIds, backfillTranscriptOwners };
