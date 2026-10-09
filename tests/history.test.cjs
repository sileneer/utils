/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module");
const { randomUUID } = require("node:crypto");
const directory = path.join(
  process.cwd(),
  "data",
  "history-test-" + randomUUID(),
);
process.env.DATABASE_PATH = path.join(directory, "utils.sqlite");
process.env.APP_URL = "http://localhost";
process.env.AI_ENABLED = "1";
process.env.AI_USER_DAILY_LIMIT = "5";
process.env.AI_GLOBAL_DAILY_LIMIT = "10";
const database = require("../scripts/database.cjs");
const legacyId = randomUUID(),
  turn = randomUUID();
let account = "owner";
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "@/lib/agent/auth")
    return {
      currentUser: async () =>
        account
          ? {
              id: account,
              name: "Disposable QA",
              email: account + "@example.test",
            }
          : null,
    };
  return original.call(this, name, ...args);
};
const { GET, PATCH } = require("../src/app/api/agent/conversations/route.ts");
const { GET: session } = require("../src/app/api/agent/session/route.ts");
const {
  listConversations,
  updateConversation,
} = require("../src/lib/agent/conversations.ts");
const { loadSession, saveSession } = require("../src/lib/agent/sessions.ts");
const {
  reserveQuery,
  releaseQuery,
  stopQuery,
} = require("../src/lib/agent/active-query.ts");
const {
  availability,
  reserveUsage,
  finishUsage,
} = require("../src/lib/agent/usage.ts");
const { confirmTerminal, draftKey } = require("../src/lib/chat/recovery.ts");
test.before(async () => {
  const db = database.open();
  db.exec(
    "CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)",
  );
  for (const file of ["001-auth.sql", "002-product.sql"]) {
    db.exec(fs.readFileSync(path.join("migrations", file), "utf8"));
    db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(file, 1);
  }
  for (const owner of ["owner", "other"])
    db.prepare("INSERT INTO user VALUES (?,?,?,?,?,?,?,?,?)").run(
      owner,
      "Disposable QA",
      owner + "@example.test",
      1,
      null,
      1,
      1,
      "user",
      "active",
    );
  db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?,?)").run(
    legacyId,
    "owner",
    "a".repeat(40),
    "private-native-marker",
    0,
    100,
  );
  db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    "legacy-question",
    legacyId,
    0,
    turn,
    "user",
    "Legacy title preserved",
    1,
    "complete",
    null,
    "a".repeat(40),
    null,
  );
  db.prepare("INSERT INTO ai_usage VALUES (?,?,?,?,?,?)").run(
    randomUUID(),
    "owner",
    turn,
    1,
    "complete",
    '{"input_tokens":7}',
  );
  await database.migrate(db);
  db.close();
});
const req = (params = "") =>
  new Request("http://localhost/api/agent/conversations" + params);
const patch = (body, origin = "http://localhost") =>
  new Request("http://localhost/api/agent/conversations", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function insert(owner, title, time = 200) {
  const id = randomUUID(),
    db = database.getDatabase();
  db.prepare(
    "INSERT INTO conversations(id,owner_user_id,needs_rebuild,updated_at) VALUES (?,?,1,?)",
  ).run(id, owner, time);
  db.prepare(
    "INSERT INTO conversation_meta(conversation_id,title) VALUES (?,?)",
  ).run(id, title);
  return id;
}

test("003 migration backs up legacy schema and preserves messages, native selection, source and usage", async () => {
  const db = database.getDatabase(),
    backup = database.open(
      process.env.DATABASE_PATH + ".before-003-chat-history.sql.bak",
    );
  try {
    assert.equal(
      backup.prepare("SELECT count(*) n FROM schema_migrations").get().n,
      2,
    );
    assert.equal(
      backup.prepare("SELECT content FROM messages").get().content,
      "Legacy title preserved",
    );
    assert.equal(
      backup
        .prepare("PRAGMA table_info(conversations)")
        .all()
        .some((r) => r.name === "title"),
      false,
    );
  } finally {
    backup.close();
  }
  assert.equal(
    (await loadSession(legacyId, "owner")).title,
    "Legacy title preserved",
  );
  const saved = await loadSession(legacyId, "owner");
  assert.equal(saved.sdkSessionId, "private-native-marker");
  assert.equal(saved.revision, "a".repeat(40));
  assert.deepEqual(saved.messages[0].content, "Legacy title preserved");
  assert.equal(
    db.prepare("SELECT usage_json FROM ai_usage WHERE turn_id=?").get(turn)
      .usage_json,
    '{"input_tokens":7}',
  );
  const rollbackId = randomUUID();
  db.prepare("INSERT INTO conversations VALUES (?,?,?,?,?,?)").run(
    rollbackId,
    "owner",
    null,
    null,
    1,
    101,
  );
  db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    "rollback-question",
    rollbackId,
    0,
    randomUUID(),
    "user",
    "Old image write after upgrade",
    1,
    "complete",
    null,
    null,
    null,
  );
  assert.equal(
    (await loadSession(rollbackId, "owner")).title,
    "Old image write after upgrade",
  );
  assert.ok(
    listConversations("owner", "Old image", false).items.some(
      (r) => r.id === rollbackId,
    ),
  );
  await database.migrate(db);
  assert.equal(
    db.prepare("SELECT count(*) n FROM schema_migrations").get().n,
    3,
  );
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});
test("history API enforces owner, origin and safe fields; rename/archive are reversible and survive final save", async () => {
  const foreign = insert("other", "Foreign private title");
  account = null;
  assert.equal((await GET(req())).status, 401);
  assert.equal((await PATCH(patch({ id: legacyId, title: "No" }))).status, 401);
  account = "owner";
  assert.equal(
    (await PATCH(patch({ id: legacyId, title: "No" }, "https://foreign.test")))
      .status,
    403,
  );
  assert.equal((await PATCH(patch({ id: foreign, title: "No" }))).status, 404);
  assert.equal(
    (await PATCH(patch({ id: foreign, archived: true }))).status,
    404,
  );
  for (const body of [
    { id: legacyId, title: "" },
    { id: legacyId, title: "x".repeat(101) },
    { id: legacyId, title: 7 },
    { id: legacyId, archived: "yes" },
    { id: legacyId },
  ])
    assert.equal((await PATCH(patch(body))).status, 400);
  assert.equal((await GET(req("?archived=invalid"))).status, 400);
  assert.equal((await GET(req("?cursor=bad"))).status, 400);
  const loaded = await loadSession(legacyId, "owner");
  assert.equal(
    (
      await PATCH(
        patch({ id: legacyId, title: "  My   renamed chat  ", archived: true }),
      )
    ).status,
    200,
  );
  assert.equal(
    listConversations("owner", "", false).items.some((r) => r.id === legacyId),
    false,
  );
  assert.equal(
    listConversations("owner", "", true).items[0].title,
    "My renamed chat",
  );
  await saveSession(loaded);
  const current = await loadSession(legacyId, "owner");
  assert.equal(current.title, "My renamed chat");
  assert.equal(current.archived, true);
  assert.equal(
    (await PATCH(patch({ id: legacyId, archived: false }))).status,
    200,
  );
  const response = await GET(req()),
    body = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    body.items.some((r) => r.id === foreign),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(body),
    /private-native|sdk|owner_user_id|usage_json|messages/,
  );
});

test("new default titles normalize the first question and remain consistent between session and history", async () => {
  const id = randomUUID(),
    content = "  First   question\ncontinued " + "long ".repeat(30),
    title = content.replace(/\s+/g, " ").trim().slice(0, 100).trim();
  await saveSession({
    id,
    ownerUserId: "owner",
    messages: [
      {
        id: randomUUID(),
        turnId: randomUUID(),
        role: "user",
        content,
        at: Date.now(),
        status: "complete",
      },
    ],
  });
  assert.equal((await loadSession(id, "owner")).title, title);
  assert.equal(
    listConversations("owner", "First question continued", false).items.find(
      (r) => r.id === id,
    ).title,
    title,
  );
});
test("literal title search escapes percent, underscore and backslash; tied timestamp pagination is stable and owner scoped", () => {
  const special = insert("owner", String.raw`literal %_\ title`, 300);
  insert("owner", "literal ABC title", 300);
  assert.deepEqual(
    listConversations("owner", "%_\\", false).items.map((r) => r.id),
    [special],
  );
  const ids = Array.from({ length: 42 }, () =>
    insert("owner", "paged title", 500),
  );
  insert("other", "paged title", 500);
  const first = listConversations("owner", "paged", false),
    second = listConversations("owner", "paged", false, first.cursor),
    third = listConversations("owner", "paged", false, second.cursor);
  assert.equal(first.items.length, 20);
  assert.equal(second.items.length, 20);
  assert.equal(third.items.length, 2);
  assert.equal(third.cursor, undefined);
  assert.deepEqual(
    [...first.items, ...second.items, ...third.items].map((r) => r.id),
    ids.sort().reverse(),
  );
  assert.throws(
    () => listConversations("owner", "x".repeat(101), false),
    /bad_request/,
  );
});
test("live activity remains pending until backend releases it; cancellation acknowledgement is not terminal; other owners see no active identifiers", async () => {
  const id = insert("owner", "Live turn"),
    active = {
      owner: "owner",
      sessionId: id,
      startedAt: Date.now(),
      turn: randomUUID(),
      abort: new AbortController(),
    };
  await saveSession({
    id,
    ownerUserId: "owner",
    messages: [
      {
        id: "pending-message",
        turnId: active.turn,
        role: "assistant",
        content: "partial",
        at: Date.now(),
        status: "streaming",
      },
    ],
  });
  assert.equal(reserveQuery(active), true);
  try {
    assert.equal(
      (await loadSession(id, "owner")).messages[0].status,
      "streaming",
    );
    assert.throws(
      () => updateConversation("owner", id, { archived: true }),
      /busy/,
    );
    updateConversation("owner", id, { title: "Rename while running" });
    const own = await (
      await session(new Request("http://localhost/api/agent/session?id=" + id))
    ).json();
    assert.equal(own.active.turnId, active.turn);
    assert.equal(own.active.state, "running");
    const pre = await (
      await session(
        new Request("http://localhost/api/agent/session?id=" + randomUUID()),
      )
    ).json();
    assert.equal(pre.error, "not_found");
    account = "other";
    const other = await (
      await session(new Request("http://localhost/api/agent/session"))
    ).json();
    assert.equal(other.active, undefined);
    assert.equal(other.availability.service, "busy");
    assert.doesNotMatch(
      JSON.stringify(other),
      new RegExp(active.turn + "|" + id),
    );
    account = "owner";
    stopQuery("owner", active.turn);
    assert.equal(
      (
        await (
          await session(
            new Request("http://localhost/api/agent/session?id=" + id),
          )
        ).json()
      ).active.state,
      "stopping",
    );
    assert.equal(
      (await loadSession(id, "owner")).messages[0].status,
      "streaming",
    );
  } finally {
    releaseQuery(active);
    account = "owner";
  }
  const interrupted = await loadSession(id, "owner");
  assert.equal(interrupted.messages[0].status, "failed");
  assert.equal(interrupted.messages[0].error, "interrupted");
  updateConversation("owner", id, { archived: true });
});
test("early owned activity is recoverable before persistence, without granting access to an existing foreign conversation", async () => {
  const id = randomUUID(),
    active = {
      owner: "owner",
      sessionId: id,
      startedAt: Date.now(),
      turn: randomUUID(),
      abort: new AbortController(),
    };
  reserveQuery(active);
  try {
    const body = await (
      await session(new Request("http://localhost/api/agent/session?id=" + id))
    ).json();
    assert.deepEqual(body.session.messages, []);
    assert.equal(body.active.turnId, active.turn);
    account = "other";
    assert.equal(
      (
        await session(
          new Request("http://localhost/api/agent/session?id=" + id),
        )
      ).status,
      404,
    );
  } finally {
    releaseQuery(active);
    account = "owner";
  }
  const foreign = insert("other", "Existing foreign conversation"),
    spoof = { ...active, sessionId: foreign };
  reserveQuery(spoof);
  try {
    assert.equal(
      (
        await session(
          new Request("http://localhost/api/agent/session?id=" + foreign),
        )
      ).status,
      404,
    );
  } finally {
    releaseQuery(spoof);
  }
});
test("availability matches quota reservations/releases, UTC reset and disabled state; readonly status/list calls consume nothing", async () => {
  const db = database.getDatabase(),
    before = db.prepare("SELECT count(*) n FROM ai_usage").get().n;
  await GET(req());
  await session(new Request("http://localhost/api/agent/session"));
  assert.equal(db.prepare("SELECT count(*) n FROM ai_usage").get().n, before);
  const reservation = reserveUsage("owner", randomUUID());
  assert.ok(reservation.id);
  assert.equal(availability("owner").used, 1);
  finishUsage(reservation.id, "released");
  assert.equal(availability("owner").used, 0);
  const attempted = reserveUsage("owner", randomUUID());
  finishUsage(attempted.id, "failed");
  assert.equal(availability("owner").used, 1);
  const midnight = new Date().setUTCHours(0, 0, 0, 0);
  assert.equal(availability("owner").resetAt, midnight + 86400000);
  assert.equal(availability("owner", midnight + 86400000).used, 0);
  process.env.AI_USER_DAILY_LIMIT = "1";
  assert.equal(availability("owner").service, "quota");
  assert.equal(reserveUsage("owner", randomUUID()).error, "quota_exceeded");
  process.env.AI_ENABLED = "0";
  assert.equal(availability("owner").service, "disabled");
  assert.equal(availability("owner").remaining, 0);
  process.env.AI_ENABLED = "1";
  process.env.AI_USER_DAILY_LIMIT = "5";
});
test("bounded recovery survives read errors, waits for terminal proof, cancels stale epochs and never resubmits; draft keys isolate account/conversation", async () => {
  let time = 0,
    reads = 0;
  const wait = async (ms) => {
    time += ms;
  };
  assert.equal(
    await confirmTerminal(
      async () => {
        reads++;
        if (reads === 1) throw Error("offline");
        return reads === 3;
      },
      () => true,
      wait,
      () => time,
    ),
    true,
  );
  assert.equal(reads, 3);
  reads = 0;
  time = 0;
  assert.equal(
    await confirmTerminal(
      async () => {
        reads++;
        return false;
      },
      () => true,
      wait,
      () => time,
    ),
    false,
  );
  assert.equal(reads, 15);
  assert.ok(time <= 30000);
  let alive = true;
  reads = 0;
  assert.equal(
    await confirmTerminal(
      async () => {
        reads++;
        alive = false;
        return true;
      },
      () => alive,
      wait,
      () => time,
    ),
    false,
  );
  assert.equal(reads, 1);
  assert.notEqual(draftKey("owner", "chat-one"), draftKey("owner", "chat-two"));
  assert.notEqual(draftKey("owner", null), draftKey("owner", "chat-one"));
  assert.notEqual(draftKey("owner", "chat-one"), draftKey("other", "chat-one"));
});
test.after(() => {
  Module._load = original;
  database.getDatabase().close();
  fs.rmSync(directory, { recursive: true, force: true });
});
