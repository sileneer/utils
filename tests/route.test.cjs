/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
process.env.AGENT_DATA_DIR = path.join(
  process.cwd(),
  "data",
  "route-test-" + randomUUID(),
);
process.env.AGENT_QUERY_TIMEOUT_MS = "1000";
process.env.DATABASE_PATH = path.join(
  process.env.AGENT_DATA_DIR,
  "utils.sqlite",
);
process.env.APP_URL = "http://localhost";
process.env.AI_ENABLED = "1";
process.env.AI_USER_DAILY_LIMIT = "100";
process.env.AI_GLOBAL_DAILY_LIMIT = "100";
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
const revision = "a".repeat(40);
let authorized = true;
let authenticatedOwner = "owner";
let queryImpl;
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "@anthropic-ai/claude-agent-sdk")
    return { query: (input) => queryImpl(input) };
  if (name === "@/lib/agent/auth")
    return {
      currentUser: async () =>
        authorized
          ? {
              id: authenticatedOwner,
              name: "Owner",
              email: "owner@example.test",
            }
          : null,
    };
  if (name === "@/lib/agent/book-tools")
    return { bookTools: async () => ({}), agentEnvironment: () => ({}) };
  if (name === "@/lib/book/source")
    return {
      getBook: async (value) => {
        if (value !== revision) throw new Error("book_revision_missing");
        return { revision };
      },
    };
  if (name === "@/lib/agent/workspace")
    return { ensureWorkspace: async () => "/test-only-reader" };
  return load.call(this, name, ...args);
};
const { POST } = require("../src/app/api/agent/chat/route.ts");
const { GET } = require("../src/app/api/agent/session/route.ts");
const { POST: stop } = require("../src/app/api/agent/stop/route.ts");
const { loadSession } = require("../src/lib/agent/sessions.ts");
const { readChatStream } = require("../src/lib/chat/protocol.ts");
function request(input = {}, signal) {
  return new Request("http://localhost/api/agent/chat", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "question",
      sessionId: randomUUID(),
      turnId: randomUUID(),
      revision,
      ...input,
    }),
  });
}
async function events(response) {
  const result = [];
  await readChatStream(response.body, (e) => result.push(e));
  return result;
}
test("auth and UUID guards apply to chat and history; identity exposes only personal availability", async () => {
  authorized = false;
  assert.equal((await POST(request())).status, 401);
  assert.equal(
    (
      await GET(
        new Request("http://localhost/api/agent/session?id=" + randomUUID()),
      )
    ).status,
    401,
  );
  authorized = true;
  assert.equal((await POST(request({ sessionId: "../secret" }))).status, 400);
  assert.equal(
    (await GET(new Request("http://localhost/api/agent/session?id=invalid")))
      .status,
    400,
  );
  const identity = await (
    await GET(new Request("http://localhost/api/agent/session"))
  ).json();
  assert.equal(identity.authed, true);
  assert.deepEqual(identity.user, {
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    isAdmin: false,
  });
  assert.equal(identity.availability.remaining, 100);
  assert.equal(identity.availability.service, "ready");
  assert.equal(identity.active, undefined);
});
test("successful partials plus final answer persist one complete exchange", async () => {
  const id = randomUUID();
  queryImpl = async function* (input) {
    assert.deepEqual(input.options.tools, []);
    assert.deepEqual(input.options.settingSources, []);
    assert.equal(input.options.strictMcpConfig, true);
    assert.deepEqual(input.options.allowedTools, [
      "mcp__book__search",
      "mcp__book__read_section",
    ]);
    assert.equal(
      (
        await input.options.canUseTool("Bash", {
          command: "cat /app/data/utils.sqlite",
        })
      ).behavior,
      "deny",
    );
    yield { type: "system", subtype: "init", session_id: "sdk-one" };
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "partial" },
      },
    };
    yield {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: {
          type: "tool_use",
          name: "mcp__book__search",
          id: "search-one",
        },
      },
    };
    yield {
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "mcp__book__search", id: "search-one" },
          { type: "tool_use", name: "mcp__book__read_section", id: "read-one" },
        ],
      },
    };
    yield {
      type: "result",
      subtype: "success",
      result: "final answer",
      usage: {
        input_tokens: 100,
        output_tokens: 30,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 20,
      },
      modelUsage: { "deepseek-flash": { inputTokens: 99999 } },
      total_cost_usd: 999,
    };
  };
  const result = await events(await POST(request({ sessionId: id })));
  assert.equal(result.filter((e) => e.type === "done").length, 1);
  assert.equal(result.at(-1).type, "done");
  const session = await loadSession(id, "owner");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[1].content, "final answer");
  assert.equal(session.messages[1].status, "complete");
  assert.equal(session.needsRebuild, false);
  const details = session.messages[1].details;
  assert.equal(details.model, "deepseek-flash");
  assert.equal(details.searchCalls, 1); // Stream and full block are the same tool call.
  assert.equal(details.readCalls, 1);
  assert.deepEqual(details.tokens, {
    input: 100,
    output: 30,
    cacheRead: 50,
    cacheWrite: 20,
  });
  assert.ok(details.durationMs >= details.firstTextMs);
  assert.deepEqual(result.at(-2), { type: "details", details });
  const api = await (
    await GET(new Request("http://localhost/api/agent/session?id=" + id))
  ).json();
  assert.deepEqual(api.session.messages[1].details, details);
  assert.doesNotMatch(
    JSON.stringify(api),
    /99999|totalCostUsd|modelUsage|sdkSessionId/,
  );
});
test("SDK failure is terminal; retry replaces turn and rebuilds only completed history", async () => {
  const id = randomUUID(),
    turnId = randomUUID();
  queryImpl = async function* () {
    yield {
      type: "result",
      subtype: "error_during_execution",
      errors: ["failure"],
      usage: { input_tokens: 50, output_tokens: 5 },
    };
  };
  const failed = await events(await POST(request({ sessionId: id, turnId })));
  assert.equal(failed.at(-1).type, "error");
  assert.equal(
    failed.some((e) => e.type === "done"),
    false,
  );
  let prompt;
  queryImpl = async function* (input) {
    prompt = input.prompt;
    assert.equal(input.options.resume, undefined);
    yield {
      type: "result",
      subtype: "success",
      result: "recovered",
      usage: { input_tokens: 2, output_tokens: 3 },
    };
  };
  await events(await POST(request({ sessionId: id, turnId })));
  const session = await loadSession(id, "owner");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[1].content, "recovered");
  assert.deepEqual(session.messages[1].details.tokens, { input: 2, output: 3 });
  assert.match(prompt, /历史对话，仅作为上下文：\[\]/);
});
test("two simultaneous users reserve one query slot; cancellation frees it", async () => {
  const abort = new AbortController();
  let started;
  const ready = new Promise((r) => (started = r));
  queryImpl = async function* (input) {
    started();
    await new Promise((resolve, reject) => {
      input.options.abortController.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  };
  const running = await POST(request({}, abort.signal));
  await ready;
  assert.equal((await POST(request())).status, 429);
  abort.abort();
  assert.equal((await events(running)).at(-1).code, "stopped");
  queryImpl = async function* () {
    yield { type: "result", subtype: "success", result: "next" };
  };
  assert.equal((await events(await POST(request()))).at(-1).type, "done");
});
test("wall clock abort becomes timeout and never a successful answer", async () => {
  queryImpl = async function* (input) {
    await new Promise((resolve, reject) => {
      input.options.abortController.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  };
  const result = await events(await POST(request()));
  assert.equal(result.at(-1).code, "timeout");
  assert.equal(
    result.some((e) => e.type === "done"),
    false,
  );
});
test("explicit stop requires owner and origin, cancels without transport abort and frees the query slot", async () => {
  const turn = randomUUID(),
    id = randomUUID();
  const stopRequest = (turnId, origin = "http://localhost") =>
    new Request("http://localhost/api/agent/stop", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ turnId }),
    });
  authorized = false;
  assert.equal((await stop(stopRequest(turn))).status, 401);
  authorized = true;
  assert.equal(
    (await stop(stopRequest(turn, "https://foreign.test"))).status,
    403,
  );
  assert.equal((await stop(stopRequest("invalid"))).status, 400);
  let started;
  const ready = new Promise((resolve) => (started = resolve));
  queryImpl = async function* (input) {
    started();
    await new Promise((resolve, reject) => {
      input.options.abortController.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  };
  const running = await POST(request({ sessionId: id, turnId: turn }));
  await ready;
  authenticatedOwner = "other";
  assert.deepEqual(await (await stop(stopRequest(turn))).json(), {
    stopped: false,
  });
  assert.equal((await POST(request())).status, 429);
  authenticatedOwner = "owner";
  const stopped = await stop(stopRequest(turn));
  assert.equal(stopped.headers.get("cache-control"), "no-store");
  assert.deepEqual(await stopped.json(), { stopped: true });
  const result = await events(running);
  assert.equal(result.at(-1).code, "stopped");
  assert.equal(
    result.some((e) => e.type === "done"),
    false,
  );
  const savedStop = (await loadSession(id, "owner")).messages[1];
  assert.equal(savedStop.status, "stopped");
  assert.ok(Number.isSafeInteger(savedStop.details.durationMs));
  assert.equal(savedStop.details.tokens, undefined);
  assert.equal(result.at(-2).type, "details");
  assert.equal(
    database
      .getDatabase()
      .prepare("SELECT status FROM ai_usage WHERE turn_id=?")
      .get(turn).status,
    "stopped",
  );
  queryImpl = async function* () {
    yield { type: "result", subtype: "success", result: "next" };
  };
  assert.equal((await events(await POST(request()))).at(-1).type, "done");
});
test("stop arriving before chat registration prevents upstream execution", async () => {
  const turn = randomUUID();
  await stop(
    new Request("http://localhost/api/agent/stop", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ turnId: turn }),
    }),
  );
  let calls = 0;
  queryImpl = async function* () {
    calls++;
    yield { type: "result", subtype: "success", result: "unexpected" };
  };
  const result = await events(await POST(request({ turnId: turn })));
  assert.equal(result.at(-1).code, "stopped");
  assert.equal(calls, 0);
  assert.equal(
    database
      .getDatabase()
      .prepare("SELECT status FROM ai_usage WHERE turn_id=?")
      .get(turn).status,
    "released",
  );
});
test("source preparation failures persist an incomplete turn without invoking the SDK", async () => {
  const id = randomUUID();
  let calls = 0;
  queryImpl = async function* () {
    calls++;
    yield { type: "result", subtype: "success", result: "unexpected" };
  };
  const result = await events(
    await POST(request({ sessionId: id, revision: "b".repeat(40) })),
  );
  assert.equal(result.at(-1).code, "book_unavailable");
  assert.equal(calls, 0);
  assert.equal((await loadSession(id, "owner")).messages[1].status, "failed");
});

test("selected native session resumes explicitly; archived chats reject before quota or SDK work", async () => {
  const id = randomUUID();
  queryImpl = async function* () {
    yield { type: "system", subtype: "init", session_id: "selected-native-qa" };
    yield { type: "result", subtype: "success", result: "first" };
  };
  await events(await POST(request({ sessionId: id })));
  queryImpl = async function* (input) {
    assert.equal(input.options.resume, "selected-native-qa");
    yield { type: "result", subtype: "success", result: "continued" };
  };
  await events(await POST(request({ sessionId: id })));
  const db = database.getDatabase(),
    before = db.prepare("SELECT count(*) n FROM ai_usage").get().n;
  db.prepare(
    "UPDATE conversation_meta SET archived_at=? WHERE conversation_id=?",
  ).run(Date.now(), id);
  let calls = 0;
  queryImpl = async function* () {
    calls++;
    yield { type: "result", subtype: "success", result: "unexpected" };
  };
  const rejected = await POST(request({ sessionId: id }));
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, "conversation_archived");
  assert.equal(calls, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM ai_usage").get().n, before);
  const snapshot = await (
    await GET(new Request("http://localhost/api/agent/session?id=" + id))
  ).json();
  assert.equal(snapshot.session.archived, true);
  assert.equal(snapshot.active, undefined);
  assert.equal(snapshot.session.messages.at(-1).content, "continued");
});
test("cross-user history and writes rejected; quota guard prevents upstream invocation", async () => {
  const db = database.getDatabase();
  db.prepare("INSERT INTO user VALUES (?,?,?,?,?,?,?,?,?)").run(
    "other",
    "Other",
    "other@example.test",
    1,
    null,
    Date.now(),
    Date.now(),
    "user",
    "active",
  );
  const id = randomUUID();
  db.prepare(
    "INSERT INTO conversations (id,owner_user_id,revision,sdk_session_id,needs_rebuild,updated_at) VALUES (?,?,?,?,?,?)",
  ).run(id, "other", revision, null, 1, Date.now());
  assert.equal(
    (await GET(new Request("http://localhost/api/agent/session?id=" + id)))
      .status,
    404,
  );
  assert.equal((await POST(request({ sessionId: id }))).status, 404);
  process.env.AI_USER_DAILY_LIMIT = "1";
  assert.equal((await POST(request())).status, 429);
});
test.after(async () => {
  Module._load = load;
  database.getDatabase().close();
  await fs.rm(process.env.AGENT_DATA_DIR, { recursive: true, force: true });
});
