/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { randomUUID } = require("node:crypto");
const { readLedger, appendLedger } = require("../src/lib/durable-jsonl.cjs");
const directory = path.join(process.cwd(), "data", "ledger-test-" + randomUUID());
const file = path.join(directory, "fixture.jsonl");
const valid = (entry) => entry?.kind === "fixture";
test("append recovers only an unfinished crash tail and preserves every complete record", () => {
  assert.deepEqual(readLedger(file, valid).records, []);
  appendLedger(file, { kind: "fixture", id: 1 }, valid);
  const prefix = fs.readFileSync(file, "utf8");
  fs.appendFileSync(file, '{"kind":');
  assert.equal(readLedger(file, valid).records.length, 1);
  appendLedger(file, { kind: "fixture", id: 2 }, valid);
  assert.ok(fs.readFileSync(file, "utf8").startsWith(prefix));
  assert.deepEqual(readLedger(file, valid).records.map((entry) => entry.id), [1, 2]);
  fs.appendFileSync(file, '{"kind":"fixture","id":3}');
  appendLedger(file, { kind: "fixture", id: 4 }, valid);
  assert.deepEqual(readLedger(file, valid).records.map((entry) => entry.id), [1, 2, 3, 4]);
});
test("complete malformed or invalid ledger records cannot be silently skipped", () => {
  for (const content of ['broken\n', '{"kind":"unknown"}\n', '{"kind":"fixture"}\nbroken\n{"kind":"fixture"}']) {
    fs.writeFileSync(file, content);
    assert.throws(() => readLedger(file, valid), /invalid_ledger_record/);
    assert.throws(() => appendLedger(file, { kind: "fixture" }, valid), /invalid_ledger_record/);
    assert.equal(fs.readFileSync(file, "utf8"), content);
  }
});
test("native transcript ownership survives cleared resume pointers and cannot change owners", async () => {
  process.env.DATABASE_PATH = path.join(directory, "utils.sqlite");
  const database = require("../scripts/database.cjs");
  const transcripts = require("../src/lib/agent/transcripts.cjs");
  const db = await database.migrate();
  try {
    const owner = randomUUID(), sdk = randomUUID();
    db.prepare("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,role,status) VALUES (?,?,?,?,?,?,?,?)")
      .run(owner, "Fixture", owner + "@example.test", 1, Date.now(), Date.now(), "user", "active");
    db.prepare("INSERT INTO conversations(id,owner_user_id,sdk_session_id,updated_at) VALUES (?,?,?,?)")
      .run(randomUUID(), owner, sdk, Date.now());
    await database.migrate(db);
    assert.deepEqual(transcripts.ownedTranscriptIds(owner), [sdk]);
    db.prepare("UPDATE conversations SET sdk_session_id=NULL,needs_rebuild=1").run();
    await database.migrate(db);
    assert.deepEqual(transcripts.ownedTranscriptIds(owner), [sdk]);
    assert.throws(() => transcripts.recordTranscript(randomUUID(), sdk), /transcript_owner_conflict/);
    transcripts.recordTranscript(owner, sdk);
    const lines = fs.readFileSync(transcripts.ownershipPath(), "utf8").trim().split("\n");
    assert.equal(lines.length, 1, "backfill and duplicate init do not grow the ledger");
    assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), ["sdkSessionId", "userId"]);
  } finally { db.close(); }
});
test("an unreadable ownership ledger prevents startup even with no resume pointers", async () => {
  const database = require("../scripts/database.cjs");
  const { ownershipPath } = require("../src/lib/agent/transcripts.cjs");
  const db = database.open(), read = fs.readFileSync;
  try {
    fs.readFileSync = function (file, ...args) {
      if (path.resolve(String(file)) === ownershipPath()) throw Object.assign(Error("fixture failure"), { code: "EACCES" });
      return read.call(this, file, ...args);
    };
    await assert.rejects(database.migrate(db), { code: "EACCES" });
  } finally { fs.readFileSync = read; db.close(); }
});
test.after(() => { fs.rmSync(directory, { recursive: true, force: true }); });
