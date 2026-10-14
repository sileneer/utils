/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "export-test-" + randomUUID());
Object.assign(process.env, {
  DATABASE_PATH: path.join(directory, "utils.sqlite"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  APP_URL: "http://localhost:3000",
  BREVO_API_KEY: "unit-fixture", MAIL_FROM: "noreply@example.test",
  TURNSTILE_SITE_KEY: "unit-fixture", TURNSTILE_SECRET_KEY: "unit-fixture",
  AI_ENABLED: "0",
});
const database = require("../scripts/database.cjs");
const { getAuth } = require("../src/lib/auth/server.ts");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { EXPORT_LIMITS, EXPORT_SCHEMA_VERSION } = require("../src/lib/auth/export.ts");
const originalFetch = global.fetch;
const mail = [];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({ email: body.to[0].email, otp: body.textContent.match(/Verification code: (\d{6})/)[1] });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};
const password = () => "Q" + randomBytes(10).toString("hex") + "7";
let owner, stranger;
function req(route, cookie) {
  return new Request(process.env.APP_URL + route, { headers: { origin: process.env.APP_URL, cookie: cookie ?? "" } });
}
const auth = (route, body, cookie) => handleAuth(new Request(process.env.APP_URL + "/api/auth/" + route, {
  method: "POST", headers: { origin: process.env.APP_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
}));
const exportGet = (query, cookie) => handleAccount(req("/api/account/export" + query, cookie));
const otp = (email) => mail.filter((m) => m.email === email).at(-1).otp;
async function login(person) {
  const response = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
}
async function create(email, name) {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name, turnstileToken: "local" })).status, 200);
  assert.equal((await auth("email-otp/verify-email", { email, otp: otp(email) })).status, 200);
  person.cookie = await login(person);
  person.id = database.getDatabase().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
/** Insert a conversation with messages and usage in the shape the app writes.
 * One transaction, so a helper mistake fails the test instead of leaving orphans. */
function seed(owner_id, { title, archived = false, revision = "release-abc", at = Date.now(), messages = [], usage = [] }) {
  const db = database.getDatabase();
  const id = randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO conversations (id,owner_user_id,revision,needs_rebuild,updated_at) VALUES (?,?,?,0,?)")
      .run(id, owner_id, revision, at);
    db.prepare("INSERT INTO conversation_meta (conversation_id,title,archived_at) VALUES (?,?,?)")
      .run(id, title, archived ? at : null);
    messages.forEach((message, position) => db.prepare(
      "INSERT INTO messages (id,conversation_id,position,turn_id,role,content,at,status,error,revision,context_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(message.id ?? randomUUID(), id, position, message.turnId, message.role, message.content, message.at ?? at, message.status ?? "complete", message.error ?? null, message.revision ?? null, message.context ? JSON.stringify(message.context) : null));
    for (const record of usage) db.prepare(
      "INSERT INTO ai_usage (id,user_id,turn_id,created_at,status,usage_json) VALUES (?,?,?,?,?,?)",
    ).run(randomUUID(), owner_id, record.turnId, record.at ?? at, record.status, record.usage ? JSON.stringify(record.usage) : null);
  }).immediate();
  return id;
}
function tableState() {
  const db = database.getDatabase();
  const tables = ["user", "account", "session", "verification", "rateLimit", "conversations", "messages", "conversation_meta", "ai_usage", "user_preferences", "limits", "mail_requests"];
  return Object.fromEntries(tables.map((table) => {
    const row = db.prepare(`SELECT count(*) n, coalesce(sum(length(CAST(rowid AS TEXT))),0) shape FROM ${table}`).get();
    return [table, `${row.n}/${row.shape}`];
  }));
}
const turn = () => randomUUID();

test.before(async () => {
  const db = await database.migrate(); db.close();
  owner = await create("owner@example.test", "Owner");
  stranger = await create("stranger@example.test", "Stranger");
});
test.beforeEach(() => {
  database.getDatabase().prepare("DELETE FROM limits").run();
  database.getDatabase().prepare("DELETE FROM rateLimit").run();
});

test("export requires a login inside 24 hours and refuses anonymous callers", async () => {
  assert.equal((await exportGet("",)).status, 401);
  assert.equal((await exportGet("/summary", "")).status, 401);
  const cookie = await login(owner);
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  database.getDatabase().prepare("UPDATE session SET createdAt=? WHERE id=?")
    .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), session.session.id);
  for (const query of ["", "/summary"]) {
    const response = await exportGet(query, cookie);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "reauth_required" });
  }
});

test("export query surface is allowlisted and validated before any read", async () => {
  const cookie = await login(owner);
  for (const query of [
    "?format=yaml", "?format=json&other=1", "?conversation=not-a-uuid",
    "?from=2026-13-45", "?from=2026-01-02&to=2026-01-02", "?to=nonsense",
    `?conversation=${randomUUID()}&from=2026-01-01`,
  ]) assert.equal((await exportGet(query, cookie)).status, 400, query);
  assert.equal((await exportGet("/summary", cookie)).status, 200);
  assert.equal((await exportGet("?format=markdown", cookie)).status, 200);
});

test("a fresh account with no conversations still exports its own profile", async () => {
  const cookie = await login(owner);
  const summary = (await (await exportGet("/summary", cookie)).json()).summary;
  assert.equal(summary.counts.conversations, 0);
  assert.equal(summary.complete, true);
  const response = await exportGet("", cookie);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.equal(document.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.deepEqual(document.conversations, []);
  assert.equal(document.account.email, "owner@example.test");
  assert.equal(document.counts.conversations, 0);
  assert.equal(document.completeness.complete, true);
  assert.ok(document.generatedAt && document.readBoundary);
});

test("export carries scope, counts, completeness and an explicit exclusion list", async () => {
  const cookie = await login(owner);
  const turnId = turn();
  const conversation = seed(owner.id, {
    title: "Book question",
    messages: [
      { turnId, role: "user", content: "第一段提问", context: { text: "书摘原文", revision: "release-abc", section: 3, item: 12 } },
      { turnId, role: "assistant", content: "回答正文", status: "complete", revision: "release-abc" },
    ],
    usage: [{ turnId, status: "complete", usage: { details: { model: "unit-model", durationMs: 1200, tokens: { input: 10, output: 20 } } } }],
  });
  const document = await (await exportGet("", cookie)).json();
  assert.equal(document.scope.kind, "allConversations");
  assert.equal(document.counts.conversations, 1);
  assert.equal(document.counts.messages, 2);
  assert.equal(document.counts.usageRecords, 1);
  assert.equal(document.completeness.complete, true);
  assert.equal(document.completeness.truncated, false);
  assert.deepEqual(document.excluded, [
    "passwordHashes", "credentialRows", "verificationCodes", "sessionTokens", "sessionRows",
    "nativeSdkSessionIds", "mailDeliveryRecords", "rateLimitBuckets", "otherUsers",
    "environmentValues", "sdkTranscripts", "bookCacheAndVersionWorkspace",
  ]);
  const exported = document.conversations[0];
  assert.equal(exported.id, conversation);
  assert.equal(exported.title, "Book question");
  assert.equal(exported.titleSource, "saved");
  assert.equal(exported.sourceRevision, "release-abc");
  assert.equal(exported.messages[0].sourceContext.text, "书摘原文");
  assert.equal(exported.messages[0].sourceContext.item, 12);
  assert.equal(exported.messages[1].status, "complete");
  assert.deepEqual(exported.usage[0].reported, { model: "unit-model", durationMs: 1200, tokens: { input: 10, output: 20 } });
  assert.equal(exported.usage[0].totalTokens, 30);
  // A date segment names its own scope and still includes whole conversations.
  const day = new Date().toISOString().slice(0, 10);
  const ranged = await (await exportGet(`/summary?from=${day}&to=2999-01-01`, cookie)).json();
  assert.equal(ranged.summary.counts.conversations, 1);
  assert.equal(ranged.summary.suggestedSegments.conversations[0].id, conversation);
  assert.equal(ranged.summary.suggestedSegments.conversations[0].title, "Book question");
  assert.ok(ranged.summary.suggestedSegments.dateRanges.length >= 1);
});

test("exported documents contain no credential, session, SDK or other-user material", async () => {
  const cookie = await login(owner);
  const silentTurn = turn();
  seed(owner.id, {
    title: "Silent usage",
    messages: [{ turnId: silentTurn, role: "assistant", content: "没有用量记录的回答", status: "complete" }],
  });
  seed(stranger.id, { title: "Stranger private", messages: [{ turnId: turn(), role: "user", content: "不该出现的他人内容", status: "complete" }] });
  database.getDatabase().prepare("UPDATE conversations SET sdk_session_id=? WHERE owner_user_id=?")
    .run("native-sdk-session-must-not-leak", owner.id);
  // Compare against the real stored secrets, not just suspicious words.
  const db = database.getDatabase();
  const secret = db.prepare("SELECT password FROM account WHERE userId=? AND password IS NOT NULL").get(owner.id).password;
  const sessionToken = db.prepare("SELECT token FROM session WHERE userId=? ORDER BY createdAt DESC LIMIT 1").get(owner.id).token;
  const otpCode = otp(owner.email);
  const forbidden = [
    secret, sessionToken, otpCode, process.env.BETTER_AUTH_SECRET, process.env.BREVO_API_KEY,
    "native-sdk-session-must-not-leak", "不该出现的他人内容", "Stranger private", "stranger@example.test",
    "sdk_session_id", "usage_json", "mail_requests",
  ];
  assert.ok(secret.length > 10 && sessionToken.length > 10, "fixture secrets should be present before checking");
  for (const format of ["json", "markdown"]) {
    const body = await (await exportGet(`?format=${format}`, cookie)).text();
    for (const value of forbidden) assert.ok(!body.includes(value), `${format} leaked ${value.slice(0, 12)}…`);
  }
  const document = await (await exportGet("", cookie)).json();
  const silent = document.conversations.find((c) => c.title === "Silent usage");
  // Missing usage stays missing: no zero-filled tokens, no invented cost.
  assert.deepEqual(silent.usage, []);
  assert.equal(silent.messages[0].reported, undefined);
  assert.ok(!JSON.stringify(silent).includes("cost"));
});

test("interrupted and in-flight turns are reported honestly, not as completed", async () => {
  const cookie = await login(owner);
  const staleTurn = turn();
  seed(owner.id, {
    title: "Statuses",
    messages: [
      { turnId: staleTurn, role: "assistant", content: "半句话", status: "streaming" },
      { turnId: turn(), role: "assistant", content: "用户停止", status: "stopped" },
      { turnId: turn(), role: "assistant", content: "失败", status: "failed", error: "provider_error" },
    ],
    usage: [{ turnId: staleTurn, status: "released" }],
  });
  const document = await (await exportGet("", cookie)).json();
  const conversation = document.conversations.find((c) => c.title === "Statuses");
  assert.equal(conversation.messages[0].status, "failed");
  assert.equal(conversation.messages[0].error, "interrupted");
  assert.equal(conversation.messages[1].status, "stopped");
  assert.equal(conversation.messages[2].error, "provider_error");
  // A released reservation is reported with its real settlement status.
  assert.equal(conversation.usage[0].status, "released");
  assert.equal(conversation.usage[0].reported, undefined);
});

test("foreign and unknown conversation scopes are not_found and never cross accounts", async () => {
  const ownerCookie = await login(owner), strangerCookie = await login(stranger);
  const mine = seed(owner.id, { title: "Mine", messages: [{ turnId: turn(), role: "user", content: "我的内容", status: "complete" }] });
  const theirs = seed(stranger.id, { title: "Theirs", messages: [{ turnId: turn(), role: "user", content: "他人的内容", status: "complete" }] });
  assert.equal((await exportGet(`?conversation=${theirs}`, ownerCookie)).status, 404);
  assert.equal((await exportGet(`?conversation=${randomUUID()}`, ownerCookie)).status, 404);
  assert.equal((await exportGet(`/summary?conversation=${theirs}`, ownerCookie)).status, 200);
  const mineDocument = await (await exportGet(`?conversation=${mine}`, ownerCookie)).json();
  assert.deepEqual(mineDocument.scope, { kind: "conversation", conversationId: mine, note: "All messages of this conversation are included." });
  assert.equal(mineDocument.conversations.length, 1);
  assert.equal(mineDocument.conversations[0].title, "Mine");
  const strangerDocument = await (await exportGet("", strangerCookie)).json();
  assert.ok(strangerDocument.conversations.every((c) => c.title !== "Mine"));
  assert.ok(strangerDocument.conversations.some((c) => c.title === "Theirs"));
});

test("over-limit requests are refused as partial rather than trimmed, and segments still work", async () => {
  const cookie = await login(owner);
  // Spread the bulk over two UTC months so one month is a valid segment.
  const seeded = [];
  for (let index = 0; index <= EXPORT_LIMITS.conversations; index++)
    seeded.push(seed(owner.id, {
      title: `Bulk ${index}`,
      at: Date.UTC(2020, index < 101 ? 0 : 1, 1 + (index % 20), index),
      messages: [{ turnId: turn(), role: "user", content: "x", status: "complete" }],
    }));
  try {
    const summary = (await (await exportGet("/summary", cookie)).json()).summary;
    assert.equal(summary.complete, false);
    assert.equal(summary.truncatedReason, "conversationCount");
    assert.ok(summary.counts.conversations > EXPORT_LIMITS.conversations);
    const refused = await exportGet("", cookie);
    assert.equal(refused.status, 413);
    const refusal = await refused.json();
    assert.equal(refusal.error, "too_large");
    assert.equal(refusal.summary.complete, false);
    assert.ok(!refused.headers.get("content-disposition"), "a refusal is not a download");
    // Narrowing produces a complete, honestly scoped document.
    const single = await (await exportGet(`?conversation=${seeded[0]}`, cookie)).json();
    assert.equal(single.completeness.complete, true);
    assert.equal(single.scope.kind, "conversation");
    assert.equal(single.conversations.length, 1);
    const ranged = await (await exportGet("?from=2020-01-01&to=2020-02-01", cookie)).json();
    assert.equal(ranged.scope.kind, "dateRange");
    assert.equal(ranged.completeness.complete, true);
    const bulk = new Set(seeded);
    assert.equal(ranged.conversations.length, 101);
    assert.ok(ranged.conversations.every((c) => bulk.has(c.id)));
    assert.match(ranged.scope.note, /selected by activity time/);
    const recent = await (await exportGet("?from=2021-01-01&to=2999-01-01", cookie)).json();
    assert.equal(recent.conversations.length > 0, true);
    assert.ok(recent.conversations.every((c) => !bulk.has(c.id)));
  } finally {
    // Remove this case's bulk rows so later cases see a normal-sized account.
    const db = database.getDatabase();
    for (const id of seeded) {
      db.prepare("DELETE FROM conversation_meta WHERE conversation_id=?").run(id);
      db.prepare("DELETE FROM messages WHERE conversation_id=?").run(id);
      db.prepare("DELETE FROM conversations WHERE id=?").run(id);
    }
  }
});

test("downloads are private attachments and exporting changes nothing", async () => {
  const cookie = await login(owner);
  const before = tableState();
  const json = await exportGet("", cookie);
  assert.equal(json.status, 200);
  assert.equal(json.headers.get("cache-control"), "no-store");
  assert.equal(json.headers.get("vary"), "Cookie");
  assert.match(json.headers.get("content-disposition"), /^attachment; filename="utils-export-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.ok(!json.headers.get("content-disposition").includes("owner@example"));
  const markdown = await exportGet("?format=markdown", cookie);
  assert.equal(markdown.headers.get("cache-control"), "no-store");
  assert.match(markdown.headers.get("content-disposition"), /utils-export-\d{4}-\d{2}-\d{2}\.md"$/);
  assert.match(markdown.headers.get("content-type"), /^text\/markdown/);
  const text = await markdown.text();
  assert.match(text, /^# Utils account export$/m);
  assert.match(text, /- Completeness: \*\*complete\*\*/);
  assert.match(text, /## Mine/);
  assert.match(text, /### Question — /);
  // The pinned-context line must close its inline code span, not leak a quote.
  assert.match(text, /^> Pinned source context — revision `release-abc`, section 3, item 12$/m);
  assert.ok(!text.includes('release-abc",'), "malformed backtick/quote in pinned context line");
  assert.match(text, /Not included by design: passwordHashes/);
  assert.match(text, /Cost is never computed/);
  assert.deepEqual(tableState(), before);
});

test("a revoked login cannot continue reading the previous account's data", async () => {
  const cookie = await login(owner);
  assert.equal((await exportGet("", cookie)).status, 200);
  assert.equal((await auth("sign-out", {}, cookie)).status, 200);
  assert.equal(await getAuth().api.getSession({ headers: new Headers({ cookie }) }), null);
  assert.equal((await exportGet("", cookie)).status, 401);
  assert.equal((await exportGet("/summary", cookie)).status, 401);
});

test.after(async () => {
  global.fetch = originalFetch;
  database.getDatabase().close();
  await fs.rm(directory, { recursive: true, force: true });
});
