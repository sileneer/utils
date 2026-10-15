/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "security-events-test-" + randomUUID());
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
const { recordSecurityEvent, RETENTION_DAYS, MAX_EVENTS_PER_USER, SECURITY_EVENT_KINDS } =
  require("../src/lib/auth/security-events.ts");
const { reserveQuery, releaseQuery } = require("../src/lib/agent/active-query.ts");

const mail = [];
const originalFetch = global.fetch;
const PURPOSES = [
  ["Confirm your email change", "change-email-old"],
  ["Confirm your new email", "change-email-new"],
  ["Sign-in email changed", "change-email-notice"],
  ["Verify your email", "email-verification"],
];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({
      email: body.to[0].email,
      purpose: PURPOSES.find(([label]) => body.subject.includes(label))?.[1] ?? "unknown",
      code: body.textContent.match(/(\d{6})/)?.[0] ?? null,
    });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};

const password = () => "Q" + randomBytes(10).toString("hex") + "7";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const db = () => database.getDatabase();
const auth = (route, body, cookie) => handleAuth(new Request(process.env.APP_URL + "/api/auth/" + route, {
  method: "POST",
  headers: { origin: process.env.APP_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const account = (path, body, cookie) => handleAccount(new Request(process.env.APP_URL + "/api/account" + path, {
  method: "POST",
  headers: { origin: process.env.APP_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const activity = (cookie, query = "") => handleAccount(new Request(process.env.APP_URL + "/api/account/activity" + query, {
  headers: { ...(cookie ? { cookie } : {}) },
}));
const eventsOf = async (cookie) => (await (await activity(cookie)).json()).events ?? [];
const rowsFor = (userId) => db().prepare("SELECT * FROM security_events WHERE user_id=? ORDER BY occurred_at").all(userId);
const codeFor = (email, purpose) => mail.filter((m) => m.email === email && m.purpose === purpose).at(-1).code;
async function login(person) {
  const response = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(response.status, 200);
  person.cookie = response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  return person.cookie;
}
async function create(email, name = "Owner") {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name, turnstileToken: "local" })).status, 200);
  assert.equal((await auth("email-otp/verify-email", { email, otp: codeFor(email, "email-verification") })).status, 200);
  await login(person);
  person.id = db().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
/** A second live session for the same account, as another browser would have. */
function addSession(userId, userAgent = UA) {
  const id = randomUUID(), token = randomUUID();
  const now = new Date().toISOString();
  db().prepare("INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userAgent,userId) VALUES (?,?,?,?,?,?,?)")
    .run(id, new Date(Date.now() + 7 * 86_400_000).toISOString(), token, now, now, userAgent, userId);
  return { id, token };
}
/** Direct inserts, so retention and cap tests do not perform 100 security operations. */
function seedEvent(userId, at, kind = "password_change") {
  const id = randomUUID();
  db().prepare("INSERT INTO security_events (id,user_id,kind,occurred_at) VALUES (?,?,?,?)").run(id, userId, kind, at);
  return id;
}

test.before(async () => {
  const db0 = await database.migrate();
  db0.close();
});

test("a fresh account with live sessions has no events, because sessions are not a log", async () => {
  const person = await create("fresh@example.test");
  addSession(person.id);
  addSession(person.id);
  assert.deepEqual(await eventsOf(person.cookie), []);
  assert.equal(db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 3);
});

test("an unverified password change records nothing and a confirmed one records exactly one event", async () => {
  const person = await create("pw@example.test");
  addSession(person.id);
  clearBuckets();
  assert.equal((await account("/password", { currentPassword: "wrong" + password(), newPassword: password() }, person.cookie)).status, 400);
  assert.deepEqual(rowsFor(person.id), [], "a refused password change is not an event");

  const before = (await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) })).session.id;
  await changePassword(person);
  const rows = rowsFor(person.id);
  assert.equal(rows.length, 1, "one operation, one event");
  assert.equal(rows[0].kind, "password_change");
  assert.equal(rows[0].sessions_affected, null, "the sessions the library revoked with it are not a second event");
  assert.deepEqual(await eventsOf(person.cookie).then((e) => e.map((x) => x.kind)), ["password_change"]);
  const after = await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) });
  assert.ok(after, "the caller stays logged in through its own password change");
  assert.notEqual(after.session.id, before, "on a rotated session row, which is why the change is one event and not a revocation");
});

test("single and batch revocation are distinct events and repeat clicks cannot double-count", async () => {
  const person = await create("revoke@example.test");
  const other = addSession(person.id);
  clearBuckets();
  assert.equal((await account("/sessions/revoke", { password: person.password, id: other.id }, person.cookie)).status, 200);
  let rows = rowsFor(person.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "session_revoke_one");
  assert.equal(rows[0].sessions_affected, 1);

  // The same target is gone, so the retry fails upstream and writes nothing.
  clearBuckets();
  assert.equal((await account("/sessions/revoke", { password: person.password, id: other.id }, person.cookie)).status, 404);
  assert.equal(rowsFor(person.id).length, 1);

  addSession(person.id);
  addSession(person.id);
  clearBuckets();
  assert.equal((await account("/sessions/revoke", { password: person.password, others: true }, person.cookie)).status, 200);
  rows = rowsFor(person.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].kind, "session_revoke_others");
  assert.equal(rows[1].sessions_affected, 2, "the batch event reports how many actually went away");

  // Nothing is left to revoke: the call still succeeds, but a zero-affected batch is
  // not a change and must not be recorded.
  clearBuckets();
  assert.equal((await account("/sessions/revoke", { password: person.password, others: true }, person.cookie)).status, 200);
  assert.equal(rowsFor(person.id).length, 2);
});

test("the current session can never be revoked away and produces no event", async () => {
  const person = await create("self@example.test");
  const current = await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) });
  clearBuckets();
  assert.equal((await account("/sessions/revoke", { password: person.password, id: current.session.id }, person.cookie)).status, 404);
  assert.deepEqual(rowsFor(person.id), []);
});

test("an email change records once, masked, and an aborted commit records nothing", async () => {
  const person = await create("mail-move@example.test");
  const target = "moved-" + randomUUID().slice(0, 8) + "@example.test";
  clearBuckets();
  assert.equal((await account("/email/start", { password: person.password, newEmail: target, turnstileToken: "local" }, person.cookie)).status, 200);
  const pending = (await (await handleAccount(new Request(process.env.APP_URL + "/api/account/email", { headers: { cookie: person.cookie } }))).json()).pending;
  assert.deepEqual(rowsFor(person.id), [], "starting a request is not a change");

  clearBuckets();
  assert.equal((await account("/email/verify", { id: pending.id, oldCode: "000000", newCode: codeFor(target, "change-email-new") }, person.cookie)).status, 400);
  assert.deepEqual(rowsFor(person.id), []);

  const query = { owner: person.id, turn: randomUUID(), abort: new AbortController() };
  assert.equal(reserveQuery(query), true);
  const original = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) => original(fn, delay === 30_000 ? 5 : delay, ...args);
  try {
    clearBuckets();
    const blocked = await account("/email/verify", {
      id: pending.id, oldCode: codeFor(person.email, "change-email-old"), newCode: codeFor(target, "change-email-new"),
    }, person.cookie);
    assert.equal(blocked.status, 409);
    assert.equal(rowsFor(person.id).length, 0, "an unconfirmed stop is not a completed change");
    assert.equal(db().prepare("SELECT email FROM user WHERE id=?").get(person.id).email, person.email);
  } finally {
    global.setTimeout = original;
    releaseQuery(query);
  }

  clearBuckets();
  assert.equal((await account("/email/verify", {
    id: pending.id, oldCode: codeFor(person.email, "change-email-old"), newCode: codeFor(target, "change-email-new"),
  }, person.cookie)).status, 200);
  const rows = rowsFor(person.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "email_change");
  assert.ok(rows[0].masked_email.includes("*"), "the recorded target is masked");
  assert.equal(rows[0].masked_email.includes(target.split("@")[0]), false);
  await login({ ...person, email: target, cookie: null });
});

test("the event and the address move together, so a rolled-back commit leaves neither", async () => {
  const person = await create("atomic@example.test");
  const competitor = await create("competitor@example.test");
  clearBuckets();
  await account("/email/start", { password: person.password, newEmail: competitor.email, turnstileToken: "local" }, person.cookie);
  const pending = (await (await handleAccount(new Request(process.env.APP_URL + "/api/account/email", { headers: { cookie: person.cookie } }))).json()).pending;
  clearBuckets();
  const refused = await account("/email/verify", {
    id: pending.id, oldCode: codeFor(person.email, "change-email-old"), newCode: codeFor(competitor.email, "change-email-new"),
  }, person.cookie);
  assert.equal(refused.status, 409);
  assert.equal(db().prepare("SELECT email FROM user WHERE id=?").get(person.id).email, person.email);
  assert.equal(db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 1, "sessions survived");
  assert.deepEqual(rowsFor(person.id), [], "no event for a change that did not happen");
});

test("no secret, raw device string, address, token or code ever reaches the table", async () => {
  const person = await create("leak@example.test");
  const secret = person.password;
  const target = "leak-target-" + randomUUID().slice(0, 8) + "@example.test";
  addSession(person.id, "curl/8.0 (SecretDeviceAgent)");
  await changePassword(person);
  clearBuckets();
  await account("/email/start", { password: person.password, newEmail: target, turnstileToken: "local" }, person.cookie);
  const pending = (await (await handleAccount(new Request(process.env.APP_URL + "/api/account/email", { headers: { cookie: person.cookie } }))).json()).pending;
  clearBuckets();
  await account("/email/verify", {
    id: pending.id, oldCode: codeFor(person.email, "change-email-old"), newCode: codeFor(target, "change-email-new"),
  }, person.cookie);
  clearBuckets();
  await account("/sessions/revoke", { password: person.password, others: true }, person.cookie);

  const stored = JSON.stringify(db().prepare("SELECT * FROM security_events").all());
  const sessionTokens = db().prepare("SELECT token FROM session").all().map((r) => r.token);
  const codes = mail.map((m) => m.code).filter(Boolean);
  assert.equal(stored.includes(secret), false, "password");
  assert.equal(stored.includes(person.password), false, "current password");
  assert.equal(stored.includes("Mozilla"), false, "raw User-Agent");
  assert.equal(stored.includes("SecretDeviceAgent"), false, "raw User-Agent of the second session");
  assert.equal(stored.includes("Bearer"), false, "cookie or authorization value");
  assert.equal(stored.includes(target.split("@")[0]), false, "unmasked target address");
  for (const token of sessionTokens) assert.equal(stored.includes(token), false, "session token");
  for (const code of codes) assert.equal(stored.includes(code), false, "verification code");
  // The inferred labels are the only device information kept.
  assert.equal(JSON.parse(stored).some((row) => row.browser === "Chrome" || row.browser === "unknown"), true);
  assert.ok(rowsFor(person.id).length >= 2);
});

test("retention hides expired rows and prunes them on the next write", async () => {
  const person = await create("retention@example.test");
  const stale = seedEvent(person.id, Date.now() - (RETENTION_DAYS + 1) * 86_400_000);
  const recent = seedEvent(person.id, Date.now() - (RETENTION_DAYS - 1) * 86_400_000);
  const listed = await eventsOf(person.cookie);
  assert.deepEqual(listed.map((e) => e.id), [recent], "only rows inside the window are returned");
  await changePassword(person);
  const ids = rowsFor(person.id).map((row) => row.id);
  assert.equal(ids.includes(stale), false, "the expired row is removed by the write");
  assert.equal(ids.includes(recent), true);
});

test("the per-account cap keeps the newest entries and leaves other accounts alone", async () => {
  const person = await create("cap@example.test");
  const neighbour = await create("cap-neighbour@example.test");
  const neighbourRow = seedEvent(neighbour.id, Date.now() - 400 * 86_400_000);
  const start = Date.now() - 30 * 86_400_000;
  for (let index = 0; index < MAX_EVENTS_PER_USER + 5; index += 1) seedEvent(person.id, start + index * 1000);
  await changePassword(person);
  const rows = rowsFor(person.id);
  assert.equal(rows.length, MAX_EVENTS_PER_USER);
  const listed = await eventsOf(person.cookie);
  assert.equal(listed.length, MAX_EVENTS_PER_USER);
  assert.equal(listed[0].kind, "password_change", "the newest event is first");
  assert.deepEqual(listed.map((e) => e.occurredAt), [...listed.map((e) => e.occurredAt)].sort((a, b) => b - a));
  assert.equal(db().prepare("SELECT count(*) n FROM security_events WHERE user_id=?").get(neighbour.id).n, 1);
  assert.equal(rowsFor(neighbour.id)[0].id, neighbourRow, "cleanup is scoped to the writing account only");
});

test("only the account itself can read its events, and no parameter widens or fakes scope", async () => {
  const person = await create("reader@example.test");
  const neighbour = await create("peeker@example.test");
  seedEvent(neighbour.id, Date.now(), "email_change");
  await changePassword(person);
  assert.deepEqual((await eventsOf(person.cookie)).map((e) => e.kind), ["password_change"]);
  assert.deepEqual((await eventsOf(neighbour.cookie)).map((e) => e.kind), ["email_change"]);
  assert.equal((await activity("", "?user=" + neighbour.id)).status, 401);
  for (const query of [
    "?user=" + neighbour.id, "?all=true", "?kind=email_change",
    "?from=2000-01-01", "?limit=1000", "?admin=true", "?role=admin",
  ]) {
    const response = await activity(person.cookie, query);
    assert.equal(response.status, 200, query);
    assert.deepEqual((await response.json()).events.map((e) => e.kind), ["password_change"], query);
  }
  // Impersonation cannot be claimed from the client either way.
  assert.equal(db().prepare("SELECT role FROM user WHERE id=?").get(person.id).role, "user");
});

test("the activity read is a gated security read", async () => {
  const person = await create("gated@example.test");
  seedEvent(person.id, Date.now());
  assert.equal((await activity("")).status, 401);
  await login(person);
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) });
  db().prepare("UPDATE session SET createdAt=? WHERE id=?")
    .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), session.session.id);
  const stale = await activity(person.cookie);
  assert.equal(stale.status, 403);
  assert.deepEqual(await stale.json(), { error: "reauth_required" });
});

test("the recorded vocabulary is closed and the projection carries only agreed fields", async () => {
  const person = await create("vocabulary@example.test");
  assert.deepEqual(SECURITY_EVENT_KINDS, [
    "password_change", "email_change", "session_revoke_one", "session_revoke_others",
    "two_factor_enable", "two_factor_disable", "two_factor_recovery_codes_regenerated",
    "passkey_register", "passkey_remove",
  ], "the vocabulary is the one ARCHITECTURE §5 registers");
  for (const kind of ["login", "sign_in", "note", "logout", "password"])
    assert.throws(() => recordSecurityEvent({ userId: person.id, kind }), /invalid_event_kind/, kind);
  // The database agrees: the CHECK constraint is the last line, not a courtesy.
  for (const kind of ["login", "password"])
    assert.throws(
      () => db().prepare("INSERT INTO security_events (id,user_id,kind,occurred_at) VALUES (?,?,?,?)")
        .run(randomUUID(), person.id, kind, Date.now()),
      /CHECK/i, kind,
    );
  assert.deepEqual(await eventsOf(person.cookie), []);
  recordSecurityEvent({ userId: person.id, kind: "session_revoke_others", sessionsAffected: 3, browser: "Firefox", system: "Linux" });
  const [event] = await eventsOf(person.cookie);
  assert.deepEqual(Object.keys(event).sort(), ["browser", "id", "kind", "occurredAt", "sessionsAffected", "system"]);
  assert.equal(event.maskedEmail, undefined);
  assert.equal(JSON.stringify(event).includes(person.cookie), false);
});

/** A confirmed password change keeps this session but rotates its cookie. */
async function changePassword(person) {
  const next = password();
  clearBuckets();
  const response = await account("/password", { currentPassword: person.password, newPassword: next }, person.cookie);
  assert.equal(response.status, 200);
  const rotated = response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  if (rotated) person.cookie = rotated;
  person.password = next;
  return response;
}

function clearBuckets() {
  db().prepare("DELETE FROM limits").run();
  db().prepare("DELETE FROM rateLimit").run();
}
test.beforeEach(clearBuckets);

test.after(async () => {
  global.fetch = originalFetch;
  db().close();
  await fs.rm(directory, { recursive: true, force: true });
});
