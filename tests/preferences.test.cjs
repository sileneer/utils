/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "preferences-test-" + randomUUID());
Object.assign(process.env, {
  DATABASE_PATH: path.join(directory, "utils.sqlite"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  APP_URL: "http://localhost:3000",
  BREVO_API_KEY: "unit-fixture",
  MAIL_FROM: "noreply@example.test",
  TURNSTILE_SITE_KEY: "unit-fixture",
  TURNSTILE_SECRET_KEY: "unit-fixture",
  AI_ENABLED: "0",
});
const database = require("../scripts/database.cjs");
const { getAuth } = require("../src/lib/auth/server.ts");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { accountPresentation, readPreferences, writePreferences } = require("../src/lib/auth/preferences.ts");
const originalFetch = global.fetch;
const mail = [];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({ email: body.to[0].email, otp: body.textContent.match(/Verification code: (\d{6})/)[1] });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  // Anything else, a provider call included, fails the suite.
  throw new Error("Unexpected external request");
};
const password = () => "Q" + randomBytes(10).toString("hex") + "7";
let reader, other;
function cookies(response) { return response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; "); }
function req(route, body, cookie, origin = process.env.APP_URL) {
  return new Request(process.env.APP_URL + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const auth = (route, body, cookie) => handleAuth(req("/api/auth/" + route, body, cookie));
const account = (route, body, cookie, origin) => handleAccount(req("/api/account" + route, body, cookie, origin));
const otp = (email) => mail.filter((m) => m.email === email).at(-1).otp;
async function login(person) {
  const response = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(response.status, 200);
  return cookies(response);
}
async function create(email) {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name: "Test", turnstileToken: "local" })).status, 200);
  assert.equal((await auth("email-otp/verify-email", { email, otp: otp(email) })).status, 200);
  person.cookie = await login(person);
  person.id = database.getDatabase().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
const preferences = async (cookie) => (await (await account("/preferences", undefined, cookie)).json()).preferences;
function snapshot() {
  const db = database.getDatabase();
  const count = (table) => db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  return {
    users: count("user"), accounts: count("account"), sessions: count("session"),
    verifications: count("verification"), conversations: count("conversations"),
    messages: count("messages"), usage: count("ai_usage"), preferences: count("user_preferences"),
  };
}

test.before(async () => {
  const db = await database.migrate(); db.close();
  reader = await create("reader@example.test"); other = await create("other@example.test");
});
test.beforeEach(() => {
  database.getDatabase().prepare("DELETE FROM limits").run();
  database.getDatabase().prepare("DELETE FROM rateLimit").run();
  database.getDatabase().prepare("DELETE FROM user_preferences").run();
  database.getDatabase().prepare("DELETE FROM ai_usage").run();
});

test("preferences are absent until explicitly saved and clear back to the device", async () => {
  const cookie = await login(reader);
  assert.deepEqual(await preferences(cookie), { theme: null, language: null });
  assert.deepEqual(await accountPresentation(new Headers({ cookie })), { theme: null, language: null });
  const saved = await account("/preferences", { theme: "dark", language: "zh" }, cookie);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { preferences: { theme: "dark", language: "zh" } });
  assert.deepEqual(await accountPresentation(new Headers({ cookie })), { theme: "dark", language: "zh" });
  // Clearing one setting keeps the other; clearing both removes the row.
  assert.deepEqual(await (await account("/preferences", { theme: null }, cookie)).json().then((v) => v.preferences), { theme: null, language: "zh" });
  assert.deepEqual(await (await account("/preferences", { language: null }, cookie)).json().then((v) => v.preferences), { theme: null, language: null });
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM user_preferences").get().n, 0);
});

test("preference writes reject bad values, extra fields and foreign origins", async () => {
  const cookie = await login(reader);
  for (const body of [{ theme: "neon" }, { language: "fr" }, { theme: 1 }, {}, { theme: "dark", role: "admin" }, { status: "inactive" }, { email: "x@example.test" }, { emailVerified: 1 }, { userId: other.id }])
    assert.equal((await account("/preferences", body, cookie)).status, 400, JSON.stringify(body));
  assert.equal((await account("/preferences", { theme: "dark" }, cookie, "https://evil.test")).status, 403);
  assert.deepEqual(await preferences(cookie), { theme: null, language: null });
  assert.equal((await account("/preferences", { theme: "light" }, cookie)).status, 200);
  assert.equal((await preferences(cookie)).theme, "light");
});

test("a login older than 24 hours keeps preferences and usage but not sessions", async () => {
  const cookie = await login(reader);
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
  database.getDatabase().prepare("UPDATE session SET createdAt=? WHERE id=?")
    .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), session.session.id);
  assert.equal((await account("/sessions", undefined, cookie)).status, 403);
  assert.equal((await account("/preferences", undefined, cookie)).status, 200);
  assert.equal((await account("/usage", undefined, cookie)).status, 200);
  assert.equal((await account("/preferences", { theme: "dark" }, cookie)).status, 200);
});

test("preferences and usage are private to the signed-in account", async () => {
  const readerCookie = await login(reader), otherCookie = await login(other);
  await account("/preferences", { theme: "dark", language: "zh" }, readerCookie);
  assert.deepEqual(await preferences(otherCookie), { theme: null, language: null });
  await account("/preferences", { theme: "light" }, otherCookie);
  assert.equal((await preferences(readerCookie)).theme, "dark");
  assert.equal((await preferences(otherCookie)).theme, "light");
  // The stored row is keyed by the caller's own id, never a submitted one.
  assert.deepEqual(readPreferences(reader.id), { theme: "dark", language: "zh" });
  assert.deepEqual(writePreferences(other.id, { theme: null, language: null }), { theme: null, language: null });
});

test("anonymous visitors cannot read preferences or usage", async () => {
  assert.equal((await account("/preferences", undefined)).status, 401);
  assert.equal((await account("/usage", undefined)).status, 401);
  assert.deepEqual(await accountPresentation(new Headers()), { theme: null, language: null });
});

test("an unverified or deactivated account loses its presentation layer", async () => {
  const cookie = await login(reader);
  await account("/preferences", { theme: "dark" }, cookie);
  const db = database.getDatabase();
  db.prepare("UPDATE user SET status='inactive' WHERE id=?").run(reader.id);
  assert.deepEqual(await accountPresentation(new Headers({ cookie })), { theme: null, language: null });
  assert.equal((await account("/preferences", undefined, cookie)).status, 401);
  db.prepare("UPDATE user SET status='active' WHERE id=?").run(reader.id);
  assert.equal((await preferences(cookie)).theme, "dark");
});

test("AI switched off is reported as unavailable, never as a spent quota", async () => {
  const cookie = await login(reader);
  const usage = (await (await account("/usage", undefined, cookie)).json()).usage;
  assert.equal(usage.enabled, false);
  assert.equal(usage.service, "disabled");
  assert.equal(usage.limit, 0);
  assert.equal(usage.remaining, 0);
});

test("personal usage reuses the existing settlement rules and stays owner scoped", async () => {
  Object.assign(process.env, {
    AI_ENABLED: "1", AI_USER_DAILY_LIMIT: "3", AI_GLOBAL_DAILY_LIMIT: "20",
    AI_API_KEY: "unit-fixture-key", ANTHROPIC_BASE_URL: "http://127.0.0.1:9", ANTHROPIC_MODEL: "unit-model",
  });
  try {
    const readerCookie = await login(reader), otherCookie = await login(other);
    const db = database.getDatabase();
    const record = (user, status, ageMinutes = 0) => db.prepare(
      "INSERT INTO ai_usage (id,user_id,turn_id,created_at,status,usage_json) VALUES (?,?,?,?,?,NULL)",
    ).run(randomUUID(), user, randomUUID(), Date.now() - ageMinutes * 60_000, status);
    record(reader.id, "complete"); record(reader.id, "failed"); record(reader.id, "stopped");
    record(reader.id, "released");            // must not count
    record(reader.id, "complete", 2 * 24 * 60); // yesterday: must not count today
    record(other.id, "complete");
    const usage = (await (await account("/usage", undefined, readerCookie)).json()).usage;
    assert.equal(usage.enabled, true);
    assert.equal(usage.used, 3);
    assert.equal(usage.limit, 3);
    assert.equal(usage.remaining, 0);
    assert.equal(usage.service, "quota");
    assert.equal((await (await account("/usage", undefined, otherCookie)).json()).usage.used, 1);
    assert.ok(usage.resetAt > Date.now() && usage.resetAt - Date.now() <= 86_400_000);
    assert.deepEqual(Object.keys(usage).sort(), ["enabled", "limit", "remaining", "resetAt", "service", "used"]);
  } finally {
    process.env.AI_ENABLED = "0";
    delete process.env.AI_USER_DAILY_LIMIT; delete process.env.AI_GLOBAL_DAILY_LIMIT;
    delete process.env.AI_API_KEY; delete process.env.ANTHROPIC_BASE_URL; delete process.env.ANTHROPIC_MODEL;
  }
});

test("preference writes are rate limited per account and path without corrupting state", async () => {
  const cookie = await login(reader);
  for (let attempt = 0; attempt < 10; attempt++) assert.equal((await account("/preferences", { theme: "dark" }, cookie)).status, 200);
  const limited = await account("/preferences", { theme: "light" }, cookie);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "rate_limited" });
  assert.equal((await preferences(cookie)).theme, "dark");
  // A different path keeps its own budget.
  assert.equal((await account("/usage", undefined, cookie)).status, 200);
});

test("re-running migrations is repeatable and preserves every retained row", async () => {
  const cookie = await login(reader);
  await account("/preferences", { theme: "dark", language: "zh" }, cookie);
  const db = database.getDatabase();
  db.prepare("INSERT INTO conversations (id,owner_user_id,updated_at) VALUES (?,?,?)")
    .run(randomUUID(), reader.id, Date.now());
  const conversation = db.prepare("SELECT id FROM conversations WHERE owner_user_id=?").get(reader.id).id;
  db.prepare("INSERT INTO messages (id,conversation_id,position,turn_id,role,content,at,status) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), conversation, 0, randomUUID(), "user", "kept", Date.now(), "complete");
  db.prepare("INSERT INTO ai_usage (id,user_id,turn_id,created_at,status,usage_json) VALUES (?,?,?,?,?,NULL)")
    .run(randomUUID(), reader.id, randomUUID(), Date.now(), "complete");
  const before = snapshot();
  const rerun = await database.migrate();
  rerun.close();
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(await preferences(cookie), { theme: "dark", language: "zh" });
});

test.after(async () => {
  global.fetch = originalFetch;
  database.getDatabase().close();
  await fs.rm(directory, { recursive: true, force: true });
});
