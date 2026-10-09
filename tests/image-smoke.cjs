/* eslint-disable @typescript-eslint/no-require-imports */
// Run against the final image before publishing. No production env or services.
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const image = process.argv[2];
if (!image) throw new Error("Usage: node tests/image-smoke.cjs <image>");
const name = "utils-image-smoke-" + randomUUID();
const volume = name + "-data";
function docker(...args) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const constraints = [
  "--network=none", "--memory=512m", "--memory-swap=512m", "--cpus=1",
  "--pids-limit=256", "--cap-drop=ALL", "--security-opt=no-new-privileges",
];
function execNode(action, ...args) {
  return docker("exec", name, "node", "-e", `(${action.toString()})()`, ...args);
}
function artifactCheck() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs"), path = require("node:path");
  assert.equal(process.getuid(), 1001);
  assert.equal(process.versions.node.split(".")[0], "22");
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.ok(!/^\.env(?:\.|$)/.test(entry.name), "Environment artifact in image");
      assert.ok(!/\.(?:sqlite(?:-wal|-shm)?|bak)$/.test(entry.name), "Private database in image");
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
    }
  }
  visit("/app");
  assert.ok(!fs.existsSync("/app/tests"), "QA fixtures in image");
  const Database = require("better-sqlite3"), db = new Database(":memory:");
  assert.equal(db.prepare("SELECT sqlite_version() version").get().version, "3.53.4");
  db.close();
  const cli = "/app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude";
  fs.accessSync(cli, fs.constants.X_OK);
  // Offline version only: proves the ELF runs, makes no provider query.
  const version = require("node:child_process").execFileSync(cli, ["--version"], {
    encoding: "utf8", timeout: 15_000,
  });
  assert.match(version, /\d+\.\d+\.\d+/);
  console.log("Final image: non-root, clean artifacts, native SQLite and SDK CLI passed.");
}
async function ready() {
  const response = await fetch("http://127.0.0.1:3000/api/health", {
    signal: AbortSignal.timeout(2000),
  });
  require("node:assert/strict").equal(response.status, 200);
}
async function routeCheck() {
  const assert = require("node:assert/strict"), base = "http://127.0.0.1:3000";
  async function request(route, status, options) {
    const response = await fetch(base + route, {
      ...options, signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, status, route);
    return response;
  }
  for (const route of ["/login", "/register", "/verify-email", "/reset-password"])
    await request(route, 200);
  const config = await request("/api/auth-config", 200);
  assert.deepEqual(await config.json(), { siteKey: "", available: false });
  const session = await request("/api/agent/session", 200);
  assert.equal(session.headers.get("cache-control"), "no-store");
  const modelConfig = process.argv[1] === "configured"
    ? { defaultModel: "image-runtime-model", models: [{id: "image-runtime-model", name: "Runtime image model"}, {id: "image-alternative", name: "Image alternative"}] }
    : { defaultModel: "", models: [] };
  assert.deepEqual(await session.json(), { authed: false, user: null, modelConfig });
  await request("/api/agent/session?id=00000000-0000-4000-8000-000000000001", 401);
  await request("/api/agent/conversations", 401);
  await request("/api/admin/operations", 401);
  await request("/api/agent/conversations", 401, { method: "PATCH", body: "{}" });
  await request("/api/agent/chat", 401, { method: "POST", body: "{}" });
  await request("/api/agent/stop", 401, { method: "POST", body: "{}" });
  await request("/api/agent/auth", 410, { method: "POST", body: "{}" });
  await request("/api/auth/sign-in/email", 503, {
    method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ email: "image-smoke@example.test", password: "unusable-fixture-password" }),
  });
  console.log("Standalone HTTP routes and unconfigured/private gates passed.");
}
function databaseCheck() {
  const assert = require("node:assert/strict"), fs = require("node:fs");
  const { open, databasePath } = require("./src/lib/database.cjs"), db = open();
  assert.equal(db.prepare("SELECT count(*) n FROM schema_migrations").get().n, 3);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(fs.statSync(databasePath()).mode & 0o777, 0o600);
  if (process.argv[1] === "seed") {
    const now = Date.now();
    // Disposable account/chat records only; no credentials or login session.
    db.prepare('INSERT INTO user VALUES (?,?,?,?,?,?,?,?,?)').run(
      "image-smoke-owner", "Image smoke", "image-smoke@example.test", 1, null,
      now, now, "user", "active",
    );
    db.prepare("INSERT INTO conversations (id,owner_user_id,revision,sdk_session_id,needs_rebuild,updated_at) VALUES (?,?,?,?,?,?)").run(
      "image-smoke-chat", "image-smoke-owner", null, null, 1, now,
    );
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      "image-smoke-message", "image-smoke-chat", 0, "image-smoke-turn", "user",
      "Image smoke persistence marker", now, "complete", null, null, null,
    );
  }
  assert.equal(db.prepare("SELECT owner_user_id FROM conversations WHERE id=?").get("image-smoke-chat").owner_user_id, "image-smoke-owner");
  assert.equal(db.prepare("SELECT content FROM messages WHERE id=?").get("image-smoke-message").content, "Image smoke persistence marker");
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  db.close();
}
function backupCheck() {
  const assert = require("node:assert/strict"), fs = require("node:fs");
  const Database = require("better-sqlite3");
  const source = "/app/data/backups/image-smoke.sqlite", restored = "/app/data/restored.sqlite";
  assert.equal(fs.statSync(source).mode & 0o777, 0o600);
  fs.copyFileSync(source, restored);
  const db = new Database(restored);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.equal(db.prepare("SELECT count(*) n FROM schema_migrations").get().n, 3);
  assert.equal(db.prepare("SELECT owner_user_id FROM conversations WHERE id=?").get("image-smoke-chat").owner_user_id, "image-smoke-owner");
  assert.equal(db.prepare("SELECT content FROM messages WHERE id=?").get("image-smoke-message").content, "Image smoke persistence marker");
  db.close();
  console.log("Persistent account/chat records and coherent backup restoration passed.");
}
function scheduledBackupCheck() {
  const assert=require("node:assert/strict"),fs=require("node:fs"),DB=require("better-sqlite3");
  const status=JSON.parse(fs.readFileSync("/app/data/backups/status.json","utf8"));
  assert.equal(status.version,1);assert.equal(status.state,"complete");assert.equal(status.lastSuccess.integrity,"ok");
  assert.equal(fs.statSync("/app/data/backups/status.json").mode&0o777,0o600);
  const target="/app/data/backups/"+status.lastSuccess.file;
  assert.equal(fs.statSync(target).mode&0o777,0o600);
  const db=new DB(target,{readonly:true});assert.equal(db.pragma("integrity_check",{simple:true}),"ok");assert.equal(db.pragma("foreign_key_check").length,0);
  assert.equal(db.prepare("SELECT count(*) n FROM user").get().n,1);db.close();
  console.log("Scheduled backup status and restored image data passed.");
}
async function waitReady() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker("inspect", "--format", "{{.State.Running}}", name) !== "true")
      throw new Error("Standalone server stopped before becoming healthy");
    try {
      docker("exec", name, "node", "-e", `(${ready.toString()})().catch(() => process.exit(1))`);
      return;
    } catch { await delay(1000); }
  }
  throw new Error("Standalone healthcheck timed out");
}
async function main() {
  let volumeCreated = false, containerCreated = false;
  try {
    console.log(docker("run", "--rm", ...constraints, "--entrypoint=node", image,
      "-e", `(${artifactCheck.toString()})()`));
    docker("volume", "create", "--label", "utils.acceptance=temporary", volume);
    volumeCreated = true;
    docker("run", "-d", "--name", name, ...constraints,
      "--mount", `type=volume,source=${volume},target=/app/data`,
      "-e", "AI_ENABLED=0", "-e", "APP_URL=http://127.0.0.1:3000", image);
    containerCreated = true;
    await waitReady();
    console.log(docker("exec", name, "node", "-e", `(${routeCheck.toString()})().catch(error => { console.error(error.message); process.exit(1); })`));
    execNode(databaseCheck, "seed");
    docker("restart", "--time=5", name);
    await waitReady();
    execNode(databaseCheck);
    docker("exec", name, "node", "scripts/database.cjs", "backup", "/app/data/backups/image-smoke.sqlite");
    console.log(execNode(backupCheck));
    docker("exec",name,"node","scripts/backup.cjs");
    console.log(execNode(scheduledBackupCheck));
    // Same accepted image, new runtime env, same volume; network remains disabled.
    docker("rm", "-f", name);
    containerCreated = false;
    docker("run", "-d", "--name", name, ...constraints,
      "--mount", "type=volume,source=" + volume + ",target=/app/data",
      "-e", "AI_ENABLED=0", "-e", "APP_URL=http://127.0.0.1:3000",
      "-e", "ANTHROPIC_BASE_URL=http://127.0.0.1:9",
      "-e", "AI_API_KEY=" + randomUUID(),
      "-e", "ANTHROPIC_MODEL=image-runtime-model",
      "-e", "AI_MODELS=" + JSON.stringify([{id:"image-runtime-model",name:"Runtime image model"},{id:"image-alternative",name:"Image alternative"}]), image);
    containerCreated = true;
    await waitReady();
    console.log(docker("exec", name, "node", "-e", "(" + routeCheck.toString() + ")().catch(error => { console.error(error.message); process.exit(1); })", "configured"));
    execNode(databaseCheck);
    console.log("Same-image runtime model configuration and retained private guards/data passed.");
    console.log("Final-image smoke acceptance passed; no mail, CAPTCHA or paid AI calls.");
  } finally {
    // Only unique resources created by this invocation are eligible for removal.
    const errors = [];
    if (containerCreated) {
      try { docker("rm", "-f", name); } catch { errors.push("container"); }
    }
    if (volumeCreated) {
      try { docker("volume", "rm", volume); } catch { errors.push("volume"); }
    }
    if (errors.length) throw new Error("Temporary smoke resources need cleanup: " + name + " (" + errors.join(", ") + ")");
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
