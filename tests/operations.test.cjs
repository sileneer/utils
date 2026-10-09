/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), Module = require("node:module"), { randomUUID } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "operations-test-" + randomUUID());
process.env.DATABASE_PATH = path.join(directory, "utils.sqlite");
const database = require("../scripts/database.cjs"), { operationsSnapshot, backupStatus } = require("../src/lib/admin/operations.ts"), { isAdministrator } = require("../src/lib/admin/access.ts"), { performBackup } = require("../scripts/backup.cjs");
let identity = null;
const load = Module._load;
Module._load = function (name, ...args) { if (name === "@/lib/agent/auth")
    return { currentUser: async () => identity }; return load.call(this, name, ...args); };
const { GET } = require("../src/app/api/admin/operations/route.ts");
const now = Date.now();
test.before(async () => { const db = await database.migrate(); db.close(); for (const [id, role, verified, status] of [["admin", "admin", 1, "active"], ["reader", "user", 1, "active"], ["pending", "admin", 0, "active"], ["disabled", "admin", 1, "disabled"]])
    database.getDatabase().prepare("INSERT INTO user VALUES (?,?,?,?,?,?,?,?,?)").run(id, id, id + "@example.test", verified, null, now, now, role, status); });
test("administrator API requires current verified active database role and does not trust identity claims", async () => {
    assert.equal((await GET(new Request("http://localhost/api/admin/operations"))).status, 401);
    for (const id of ["reader", "pending", "disabled", "missing"]) {
        identity = { id, role: "admin" };
        assert.equal((await GET(new Request("http://localhost/api/admin/operations"))).status, 403);
        assert.equal(isAdministrator(id), false);
    }
    identity = { id: "admin", role: "user" };
    assert.equal((await GET(new Request("http://localhost/api/admin/operations?hours=999"))).status, 400);
    const response = await GET(new Request("http://localhost/api/admin/operations?hours=168"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    database.getDatabase().prepare("UPDATE user SET role='user' WHERE id='admin'").run();
    assert.equal((await GET(new Request("http://localhost/api/admin/operations"))).status, 403);
    database.getDatabase().prepare("UPDATE user SET role='admin' WHERE id='admin'").run();
});
test("operations totals distinguish missing/cache/estimated values and expose only bounded aggregates", async () => {
    const insert = database.getDatabase().prepare("INSERT INTO ai_usage VALUES (?,?,?,?,?,?)");
    for (const [status, json, offset] of [
        ["complete", { details: { durationMs: 1000, firstTextMs: 300, tokens: { input: 10, output: 20, cacheRead: 0, cacheWrite: 5 } }, secret: "must-never-appear", usage: { session_id: "must-never-appear" } }, 0],
        ["failed", null, 0], ["stopped", { details: { durationMs: 500, firstTextMs: 100, timingEstimated: true } }, 0],
        ["released", { details: { durationMs: 50 } }, 0], ["reserved", null, 0], ["unrecognised", { details: { tokens: { input: -1, output: 2 } } }, 0],
        ["complete", { details: { durationMs: 9000 } }, -169 * 3600000]
    ])
        insert.run(randomUUID(), "reader", randomUUID(), now + offset, status, json ? JSON.stringify(json) : null);
    const result = await operationsSnapshot(24, now);
    assert.equal(result.attempts, 6);
    assert.deepEqual(result.outcomes, { complete: 1, failed: 1, stopped: 1, released: 1, reserved: 1, unknown: 1 });
    assert.deepEqual(result.tokens, { input: 10, output: 20, cacheRead: 0, cacheWrite: 5, total: 35, samples: 1, missing: 5, cacheReadSamples: 1, cacheWriteSamples: 1 });
    assert.deepEqual(result.duration, { count: 2, missing: 4, median: 525, p95: null });
    assert.equal(result.firstText.count, 1);
    assert.equal(result.firstText.median, 300);
    assert.doesNotMatch(JSON.stringify(result), /must-never-appear|reader@example|session_id|usage_json|user_id|turn_id/);
});
test("backup status allowlists metadata and distinguishes stale, failure, interruption, missing and malformed data", async () => {
    const dir = path.join(directory, "status-fixture");
    await fs.mkdir(dir, { recursive: true });
    const write = value => fs.writeFile(path.join(dir, "status.json"), JSON.stringify(value));
    assert.deepEqual(await backupStatus(now, dir), { state: "unavailable" });
    const success = { at: now - 1000, bytes: 1024, integrity: "ok", file: "private-name", secret: "must-never-appear" };
    await write({ version: 1, state: "complete", lastAttemptAt: now - 2000, lastSuccess: success });
    const fresh = await backupStatus(now, dir);
    assert.equal(fresh.state, "fresh");
    assert.equal(fresh.integrityVerified, true);
    assert.doesNotMatch(JSON.stringify(fresh), /private-name|secret/);
    await write({ version: 1, state: "complete", lastAttemptAt: now - 40 * 3600000, lastSuccess: { ...success, at: now - 40 * 3600000 } });
    assert.equal((await backupStatus(now, dir)).state, "stale");
    for (const [state, age, expected] of [["failed", 1, "failed"], ["running", 1, "running"], ["running", 2000000, "failed"]]) {
        await write({ version: 1, state, lastAttemptAt: now - age, lastSuccess: success });
        assert.equal((await backupStatus(now, dir)).state, expected);
    }
    await write({ version: 1, state: "complete", lastAttemptAt: now + 120000, lastSuccess: success });
    assert.equal((await backupStatus(now, dir)).state, "unavailable");
    await fs.writeFile(path.join(dir, "status.json"), "{");
    assert.equal((await backupStatus(now, dir)).state, "unavailable");
});
test("coherent scheduled backup validates restore and records failure without losing previous success", async () => {
    const dir = path.join(directory, "backups"), db = database.getDatabase();
    const receipt = await performBackup(dir, db), restored = new (require("better-sqlite3"))(path.join(dir, receipt.file), { readonly: true });
    assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(restored.pragma("foreign_key_check").length, 0);
    assert.equal(restored.prepare("SELECT count(*) n FROM user").get().n, 4);
    assert.equal(restored.prepare("SELECT count(*) n FROM ai_usage").get().n, 7);
    restored.close();
    const status = JSON.parse(await fs.readFile(path.join(dir, "status.json"), "utf8"));
    assert.equal(status.state, "complete");
    assert.equal(status.lastSuccess.integrity, "ok");
    await assert.rejects(performBackup(dir, { backup: async () => { throw Error("must-not-be-exposed"); } }));
    const failed = JSON.parse(await fs.readFile(path.join(dir, "status.json"), "utf8"));
    assert.equal(failed.state, "failed");
    assert.deepEqual(failed.lastSuccess, status.lastSuccess);
    assert.doesNotMatch(JSON.stringify(failed), /must-not-be-exposed/);
});
test("timing percentiles require measured sample coverage and large periods are explicitly truncated", async () => {
    const db = database.getDatabase(), insert = db.prepare("INSERT INTO ai_usage VALUES (?,?,?,?,?,?)");
    db.prepare("DELETE FROM ai_usage").run();
    db.transaction(() => { for (let i = 1; i <= 20; i++)
        insert.run(randomUUID(), "reader", randomUUID(), now, "complete", JSON.stringify({ details: { durationMs: i * 100, firstTextMs: i * 10 } })); })();
    const measured = await operationsSnapshot(24, now);
    assert.equal(measured.duration.median, 1050);
    assert.equal(measured.duration.p95, 1900);
    assert.equal(measured.firstText.p95, 190);
    db.prepare("DELETE FROM ai_usage").run();
    db.transaction(() => { for (let i = 0; i < 10001; i++)
        insert.run(randomUUID(), "reader", randomUUID(), now, "complete", null); })();
    const limited = await operationsSnapshot(168, now);
    assert.equal(limited.truncated, true);
    assert.equal(limited.attempts, 10000);
    assert.equal(limited.outcomes.complete, 10000);
    assert.equal(limited.tokens.missing, 10000);
});
test.after(async () => { Module._load = load; database.getDatabase().close(); await fs.rm(directory, { recursive: true, force: true }); });
