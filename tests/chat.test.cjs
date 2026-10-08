/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
process.env.AGENT_DATA_DIR = path.join(
  process.cwd(),
  "data",
  "test-" + randomUUID(),
);
process.env.DATABASE_PATH = path.join(
  process.env.AGENT_DATA_DIR,
  "utils.sqlite",
);
const database = require("../scripts/database.cjs");
test.before(async () => {
  const db = await database.migrate();
  db.close();
  database
    .getDatabase()
    .prepare("INSERT INTO user VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      "owner",
      "Owner",
      "owner@example.test",
      1,
      null,
      Date.now(),
      Date.now(),
      "user",
      "active",
    );
});
const {
  readChatStream,
  completedHistory,
} = require("../src/lib/chat/protocol.ts");
const { extractCitations } = require("../src/lib/chat/citations.ts");
const { shouldSubmitKey } = require("../src/lib/chat/composer.ts");
const { abortable } = require("../src/lib/agent/abort.ts");
const { loadSession, saveSession } = require("../src/lib/agent/sessions.ts");
const { htmlRevision, getBook } = require("../src/lib/book/source.ts");
function body(text, split = 3) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += split)
        controller.enqueue(bytes.slice(i, i + split));
      controller.close();
    },
  });
}
const frame = (data) => `data: ${JSON.stringify(data)}\r\n\r\n`;
test("chunked UTF-8, keepalive and exactly one terminal event", async () => {
  const events = [];
  await readChatStream(
    body(
      ": keepalive\r\n\r\n" +
        frame({ type: "delta", text: "中文" }) +
        frame({ type: "done" }) +
        frame({ type: "done" }),
    ),
    (e) => events.push(e),
  );
  assert.deepEqual(events, [{ type: "delta", text: "中文" }, { type: "done" }]);
});
test("error is terminal even when followed by done", async () => {
  const events = [];
  await readChatStream(
    body(frame({ type: "error", code: "timeout" }) + frame({ type: "done" })),
    (e) => events.push(e),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "error");
});
test("empty and partial EOF remain incomplete", async () => {
  for (const text of ["", frame({ type: "delta", text: "partial" })])
    await assert.rejects(
      readChatStream(body(text), () => {}),
      /disconnected/,
    );
});
test("invalid payload cannot become answer text", async () => {
  await assert.rejects(
    readChatStream(
      body(frame({ type: "delta", text: { bad: true } })),
      () => {},
    ),
    /invalid_stream/,
  );
});
test("only completed visible exchanges rebuild SDK history", () => {
  const messages = [
    ["1", "user", "complete", "question"],
    ["1", "assistant", "complete", "answer"],
    ["2", "user", "complete", "failed question"],
    ["2", "assistant", "failed", "partial"],
  ].map(([turnId, role, status, content]) => ({
    turnId,
    role,
    status,
    content,
  }));
  assert.deepEqual(JSON.parse(completedHistory(messages)), [
    { role: "user", content: "question" },
    { role: "assistant", content: "answer" },
  ]);
});
test("grouped citations resolve, ambiguous/ranges and invalid sections do not", () => {
  assert.deepEqual(
    extractCitations("第 8 节第 18/45 条，第 8 节第 18 条").map(
      (c) => c.anchor,
    ),
    ["e-8-18", "e-8-45"],
  );
  assert.equal(
    extractCitations("第 8 节第 1-5 条；第 99 节第 2 条；本节第 3 条").length,
    0,
  );
});
test("legacy files are ignored; private ownership, interrupted restore and atomic writes", async () => {
  const id = randomUUID();
  const dir = path.join(process.env.AGENT_DATA_DIR, "sessions");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, id + ".json"),
    JSON.stringify({
      id,
      messages: [
        { role: "user", content: "q", at: 1 },
        { role: "assistant", content: "a", at: 2 },
      ],
    }),
  );
  assert.equal(await loadSession(id, "owner"), null);
  const session = {
    id,
    ownerUserId: "owner",
    messages: [
      {
        id: "msg-one",
        turnId: "turn-one",
        role: "assistant",
        content: "a",
        at: 2,
        status: "streaming",
      },
    ],
  };
  await saveSession(session);
  assert.equal((await loadSession(id, "owner")).messages[0].status, "stopped");
  assert.equal(await loadSession(id, "stranger"), null);
  await assert.rejects(
    saveSession({ ...session, ownerUserId: "stranger" }),
    /forbidden/,
  );
  assert.equal(await loadSession("../other", "owner"), null);
  await assert.rejects(
    saveSession({ id: "../other", messages: [] }),
    /invalid_session/,
  );
  assert.equal(
    (await fs.readdir(dir)).filter((f) => f.endsWith(".tmp")).length,
    0,
  );
});
test("unverified HTML cannot become a source revision", () => {
  assert.equal(htmlRevision("<div>正文提交 3e5bf7a</div>"), "3e5bf7a");
  assert.throws(
    () => htmlRevision("<div>No revision</div>"),
    /revision_missing/,
  );
});
test("failed refresh preserves a verified pair and cannot silently substitute a missing old revision", async () => {
  const revision = "a".repeat(40);
  const dir = path.join(process.env.AGENT_DATA_DIR, "versions", revision);
  await fs.mkdir(path.join(dir, "reader"), { recursive: true });
  await fs.writeFile(path.join(dir, "reader", "README.md"), "verified source");
  await fs.writeFile(
    path.join(dir, "book.html"),
    "正文提交 " + revision.slice(0, 7),
  );
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({ revision, checkedAt: 1 }),
  );
  await fs.writeFile(
    path.join(dir, "..", "current.json"),
    JSON.stringify({ revision, checkedAt: 1 }),
  );
  const fetch = global.fetch;
  global.fetch = async () => {
    throw new Error("offline");
  };
  try {
    assert.equal((await getBook(undefined, true)).revision, revision);
    await assert.rejects(getBook("b".repeat(40)));
  } finally {
    global.fetch = fetch;
  }
});
test("desktop Enter, Shift+Enter, IME and touch keyboard have separate semantics", () => {
  const event = {
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
  };
  assert.equal(shouldSubmitKey(event, true), true);
  for (const change of [
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { key: "a" },
  ])
    assert.equal(shouldSubmitKey({ ...event, ...change }, true), false);
  assert.equal(shouldSubmitKey(event, false), false);
});
test("stop during shared preparation rejects promptly without an unhandled rejection", async () => {
  const controller = new AbortController();
  let reject;
  const preparation = new Promise((resolve, fail) => {
    reject = fail;
  });
  const waiting = abortable(preparation, controller.signal);
  controller.abort();
  await assert.rejects(waiting, /stopped/);
  reject(new Error("late preparation failure"));
  await assert.rejects(
    abortable(Promise.reject(new Error("late")), controller.signal),
    /stopped/,
  );
});
test.after(async () => {
  database.getDatabase().close();
  await fs.rm(process.env.AGENT_DATA_DIR, { recursive: true, force: true });
});
