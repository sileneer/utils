/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "email-change-test-" + randomUUID());
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
const { reserveQuery, releaseQuery } = require("../src/lib/agent/active-query.ts");
const { accountErrorKey } = require("../src/lib/auth/errors.ts");

const mail = [];
let mailFault = false, challengeFault = false;
const originalFetch = global.fetch;
const PURPOSES = [
  ["Confirm your email change", "change-email-old"],
  ["Confirm your new email", "change-email-new"],
  ["Sign-in email changed", "change-email-notice"],
  ["Verify your email", "email-verification"],
  ["Reset password", "forget-password"],
];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify"))
    return Response.json(challengeFault ? { success: false } : { success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    if (mailFault) return new Response("{}", { status: 500 });
    const body = JSON.parse(options.body);
    const purpose = PURPOSES.find(([label]) => body.subject.includes(label))?.[1] ?? "unknown";
    mail.push({ email: body.to[0].email, purpose, otp: body.textContent.match(/\d{6}/)?.[0] ?? null });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};

const password = () => "Q" + randomBytes(10).toString("hex") + "7";
const address = () => "change-" + randomUUID().slice(0, 8) + "@example.test";
function cookies(response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}
const auth = (route, body, cookie) => handleAuth(new Request(process.env.APP_URL + "/api/auth/" + route, {
  method: "POST",
  headers: { origin: process.env.APP_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const post = (route, body, cookie) => handleAccount(new Request(process.env.APP_URL + "/api/account/email/" + route, {
  method: "POST",
  headers: { origin: process.env.APP_URL, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const read = (cookie) => handleAccount(new Request(process.env.APP_URL + "/api/account/email", {
  headers: { ...(cookie ? { cookie } : {}) },
}));
const userRow = (id) => database.getDatabase().prepare("SELECT * FROM user WHERE id=?").get(id);
const pendingFor = async (cookie) => (await (await read(cookie)).json()).pending;
async function login(person) {
  const response = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(response.status, 200);
  person.cookie = cookies(response);
  return person.cookie;
}
async function create(email = address(), name = "Mover") {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name, turnstileToken: "local" })).status, 200);
  assert.equal((await auth("email-otp/verify-email", { email, otp: latest(email, "email-verification").otp })).status, 200);
  await login(person);
  person.id = database.getDatabase().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
const sent = (email, purpose) => mail.filter((item) => item.email === email && item.purpose === purpose);
const latest = (email, purpose) => sent(email, purpose).at(-1);
/** Open a transaction and hand back its live row plus both codes, as the two mailbox owners would see them. */
async function openTransaction(person, target = address()) {
  clearBuckets();
  const before = mail.length;
  assert.equal((await post("start", { password: person.password, newEmail: target, turnstileToken: "local" }, person.cookie)).status, 200);
  const pending = await pendingFor(person.cookie);
  assert.ok(pending, "a started transaction must be readable");
  return { pending, target, oldCode: latest(person.email, "change-email-old").otp, newCode: latest(target, "change-email-new").otp, mails: mail.slice(before) };
}
function clearBuckets() {
  database.getDatabase().prepare("DELETE FROM limits").run();
  database.getDatabase().prepare("DELETE FROM rateLimit").run();
}
function seedHistory(person) {
  const db = database.getDatabase(), id = randomUUID(), turn = randomUUID(), at = Date.now() - 60_000;
  db.transaction(() => {
    db.prepare("INSERT INTO conversations (id,owner_user_id,revision,needs_rebuild,updated_at) VALUES (?,?,?,0,?)").run(id, person.id, "release-abc", at);
    db.prepare("INSERT INTO conversation_meta (conversation_id,title,archived_at) VALUES (?,?,?)").run(id, "Kept", null);
    db.prepare("INSERT INTO messages (id,conversation_id,position,turn_id,role,content,at,status,error,revision,context_json) VALUES (?,?,0,?,?,?,?,?,?,?,?)")
      .run(randomUUID(), id, turn, "user", "kept question", at, "complete", null, "release-abc", null);
    db.prepare("INSERT INTO ai_usage (id,user_id,turn_id,created_at,status,usage_json) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), person.id, turn, at, "counted", JSON.stringify({ input_tokens: 10, output_tokens: 5 }));
  }).immediate();
  return { id, turn };
}

test.before(async () => {
  const db = await database.migrate();
  db.close();
});
test.beforeEach(() => clearBuckets());

test("only the two purpose-scoped codes are issued, and neither mailbox sees the other's", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode, mails } = await openTransaction(person);
  assert.equal(pending.maskedNewEmail.includes(target.split("@")[0]), false, "the target address is masked");
  assert.equal(mails.length, 2);
  assert.deepEqual(mails.map((item) => item.purpose).sort(), ["change-email-new", "change-email-old"]);
  assert.equal(sent(target, "change-email-old").length, 0);
  assert.equal(sent(person.email, "change-email-new").length, 0);
  assert.notEqual(oldCode, newCode);
  assert.equal(sent(person.email, "change-email-notice").length, 0, "nothing is announced before the commit");
  // The plaintext code never reaches the database, only a keyed digest.
  const raw = JSON.stringify(database.getDatabase().prepare("SELECT * FROM email_changes").all());
  assert.equal(raw.includes(oldCode), false);
  assert.equal(raw.includes(newCode), false);
});

test("a started transaction leaves the sign-in address, sessions and history untouched", async () => {
  const person = await create();
  const history = seedHistory(person);
  const sessionCount = database.getDatabase().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n;
  const { pending } = await openTransaction(person);
  assert.equal(userRow(person.id).email, person.email);
  assert.equal(userRow(person.id).emailVerified, 1);
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, sessionCount);
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM messages WHERE conversation_id=?").get(history.id).n, 1);
  assert.ok(pending.expiresAt > Date.now());
  assert.deepEqual(pending.attemptsLeft, { old: 5, new: 5 });
});

test("confirming both codes rewrites only the address, keeps identity and history, and signs out everywhere", async () => {
  const person = await create();
  const history = seedHistory(person);
  const profile = { name: userRow(person.id).name, role: userRow(person.id).role, status: userRow(person.id).status, createdAt: userRow(person.id).createdAt };
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  const response = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { changed: true, signedOut: true, changedTo: target, notified: true });
  const after = userRow(person.id);
  assert.equal(after.email, target);
  assert.equal(after.emailVerified, 1);
  assert.deepEqual({ name: after.name, role: after.role, status: after.status, createdAt: after.createdAt }, profile);
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 0, "every session is revoked");
  assert.equal(database.getDatabase().prepare("SELECT owner_user_id FROM conversations WHERE id=?").get(history.id).owner_user_id, person.id);
  assert.equal(database.getDatabase().prepare("SELECT usage_json FROM ai_usage WHERE turn_id=?").get(history.turn).usage_json.includes("10"), true);
  assert.equal(sent(person.email, "change-email-notice").length, 1, "the retired address is notified");
  // The wrapper exposes only its own result: no token, no user object, no library body.
  assert.equal(JSON.stringify(await (await read(person.cookie)).json()).includes("token"), false);
  // Login moves to the new address; the old one no longer resolves.
  assert.equal((await auth("sign-in/email", { email: target, password: person.password })).status, 200);
  assert.notEqual((await auth("sign-in/email", { email: person.email, password: person.password })).status, 200);
});

test("a committed transaction is single-use: replaying the same pair changes nothing further", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  assert.equal((await post("verify", { id: pending.id, oldCode, newCode }, person.cookie)).status, 200);
  clearBuckets();
  const replay = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(replay.status, 401, "the commit signed out the session that held the codes");
  assert.deepEqual(await replay.json(), { error: "unauthorized" });
  assert.equal(userRow(person.id).email, target, "the address did not move twice");
  assert.equal(sent(person.email, "change-email-notice").length, 1);
});

test("each mailbox code is confined to its own slot, and a repeated target address is one code only", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  clearBuckets();
  // Swapping the two codes is a mismatch on the first slot, so nothing commits.
  const swapped = await post("verify", { id: pending.id, oldCode: newCode, newCode: oldCode }, person.cookie);
  assert.equal(swapped.status, 400);
  assert.deepEqual(await swapped.json(), { error: "code_failed" });
  assert.equal(userRow(person.id).email, person.email);
  assert.equal((await pendingFor(person.cookie)).attemptsLeft.old, 4);
  // The new code alone cannot bypass the old-address confirmation.
  clearBuckets();
  const half = await post("verify", { id: pending.id, oldCode: "000000", newCode }, person.cookie);
  assert.equal(half.status, 400);
  assert.equal(userRow(person.id).email, person.email);
  assert.equal(target === userRow(person.id).email, false);
});

test("five wrong codes close the transaction and later correct codes cannot revive it", async () => {
  const person = await create();
  const { pending, oldCode, newCode } = await openTransaction(person);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    clearBuckets();
    assert.equal((await post("verify", { id: pending.id, oldCode: "000000", newCode }, person.cookie)).status, 400, `attempt ${attempt}`);
    assert.equal(userRow(person.id).email, person.email);
  }
  // The fifth wrong code names its own cause instead of pretending another try exists.
  clearBuckets();
  const exhausted = await post("verify", { id: pending.id, oldCode: "000000", newCode }, person.cookie);
  assert.equal(exhausted.status, 409);
  assert.deepEqual(await exhausted.json(), { error: "attempts_exhausted" });
  clearBuckets();
  const revived = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(revived.status, 404, "the closed budget cannot be reopened with correct codes");
  assert.equal(userRow(person.id).email, person.email);
  assert.equal(await pendingFor(person.cookie), null);
});

test("an expired transaction is closed on the next read and cannot be confirmed", async () => {
  const person = await create();
  const { pending, oldCode, newCode } = await openTransaction(person);
  database.getDatabase().prepare("UPDATE email_changes SET expires_at=? WHERE id=?").run(Date.now() - 1, pending.id);
  assert.equal(await pendingFor(person.cookie), null);
  clearBuckets();
  const late = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(late.status, 404, "the row was expired away before the compare");
  assert.equal(userRow(person.id).email, person.email);
});

test("only the owning account can touch its transaction, and a moved sign-in address voids it", async () => {
  const person = await create();
  const stranger = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  clearBuckets();
  for (const [route, body] of [
    ["resend", { id: pending.id, side: "old", turnstileToken: "local" }],
    ["cancel", { id: pending.id }],
    ["verify", { id: pending.id, oldCode, newCode }],
  ]) assert.equal((await post(route, body, stranger.cookie)).status, 404, route);
  assert.equal(userRow(person.id).email, person.email);
  // Another tab or device changes the address behind this request.
  database.getDatabase().prepare("UPDATE user SET email=? WHERE id=?").run("moved-" + randomUUID().slice(0, 8) + "@example.test", person.id);
  assert.equal(await pendingFor(person.cookie), null, "the stale transaction is not offered as pending");
  clearBuckets();
  const stale = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "stale_target" });
  assert.notEqual(userRow(person.id).email, target);
});

test("exactly one transaction stays live per account, and a taken target address is never confirmed or denied", async () => {
  const person = await create();
  const first = await openTransaction(person);
  clearBuckets();
  const second = await openTransaction(person);
  assert.notEqual(first.pending.id, second.pending.id);
  assert.equal((await pendingFor(person.cookie)).id, second.pending.id);
  clearBuckets();
  assert.equal((await post("verify", { id: first.pending.id, oldCode: first.oldCode, newCode: first.newCode }, person.cookie)).status, 404);
  // A second account aiming at the same address gets the same generic answer and no row.
  const other = await create();
  clearBuckets();
  const collision = await post("start", { password: other.password, newEmail: second.target, turnstileToken: "local" }, other.cookie);
  assert.equal(collision.status, 200);
  assert.deepEqual(await collision.json(), { sent: true });
  assert.equal(await pendingFor(other.cookie), null);
  assert.equal(sent(second.target, "change-email-old").length + sent(second.target, "change-email-new").length, 1, "the refused request sent no extra mail");
  // Only the legitimate owner can still complete its own request.
  clearBuckets();
  assert.equal((await post("verify", { id: second.pending.id, oldCode: second.oldCode, newCode: second.newCode }, person.cookie)).status, 200);
});

test("a target that becomes registered before the commit aborts safely and leaves the account unchanged", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  const competitor = await create(target);
  clearBuckets();
  const response = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "email_taken" });
  assert.equal(userRow(person.id).email, person.email);
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 1, "sessions survive an aborted commit");
  assert.equal(userRow(competitor.id).email, target);
  assert.equal(database.getDatabase().prepare("SELECT status FROM email_changes WHERE id=?").get(pending.id).status, "cancelled");
  assert.equal(sent(person.email, "change-email-notice").length, 0);
});

test("resending rotates one mailbox's code only, and the superseded code stops working", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  clearBuckets();
  assert.equal((await post("resend", { id: pending.id, side: "new", turnstileToken: "local" }, person.cookie)).status, 200);
  const fresh = latest(target, "change-email-new").otp;
  assert.notEqual(fresh, newCode);
  assert.equal(latest(person.email, "change-email-old").otp, oldCode, "the other slot kept its code");
  clearBuckets();
  assert.equal((await post("verify", { id: pending.id, oldCode, newCode }, person.cookie)).status, 400);
  clearBuckets();
  assert.equal((await post("verify", { id: pending.id, oldCode, newCode: fresh }, person.cookie)).status, 200);
  assert.equal(userRow(person.id).email, target);
});

test("cancelling closes the request without touching the address, and is idempotent", async () => {
  const person = await create();
  const { pending, oldCode, newCode } = await openTransaction(person);
  clearBuckets();
  assert.deepEqual(await (await post("cancel", { id: pending.id }, person.cookie)).json(), { cancelled: true });
  assert.equal(await pendingFor(person.cookie), null);
  clearBuckets();
  assert.equal((await post("cancel", { id: pending.id }, person.cookie)).status, 200);
  clearBuckets();
  assert.equal((await post("verify", { id: pending.id, oldCode, newCode }, person.cookie)).status, 404);
  assert.equal(userRow(person.id).email, person.email);
  assert.equal(sent(person.email, "change-email-notice").length, 0);
});

test("a failed send leaves no half-issued transaction and never moves the address", async () => {
  const person = await create();
  mailFault = true;
  clearBuckets();
  const response = await post("start", { password: person.password, newEmail: address(), turnstileToken: "local" }, person.cookie);
  mailFault = false;
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_send_failed" });
  assert.equal(await pendingFor(person.cookie), null);
  assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM email_changes WHERE user_id=? AND status='pending'").get(person.id).n, 0);
  assert.equal(userRow(person.id).email, person.email);
  clearBuckets();
  assert.equal((await openTransaction(person)).pending.id.length > 0, true, "the account can start again after a send failure");
});

test("an unconfirmed AI stop refuses the commit, keeps the address, and stays retryable", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  const query = active(person.id, false);
  const original = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) => original(fn, delay === 30_000 ? 5 : delay, ...args);
  try {
    clearBuckets();
    const response = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "stop_unconfirmed" });
    assert.equal(userRow(person.id).email, person.email);
    assert.equal(database.getDatabase().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 1);
    assert.equal(query.abort.signal.aborted, true, "the running request was asked to stop");
    assert.equal(sent(person.email, "change-email-notice").length, 0, "no success notice for an uncommitted change");
    // Confirmed stop, then the same codes complete the request.
    releaseQuery(query);
    assert.equal((await pendingFor(person.cookie)).id, pending.id);
    clearBuckets();
    assert.equal((await post("verify", { id: pending.id, oldCode, newCode }, person.cookie)).status, 200);
    assert.equal(userRow(person.id).email, target);
  } finally {
    global.setTimeout = original;
    releaseQuery(query);
  }
});

test("a notification failure is reported apart from the committed change and never retried", async () => {
  const person = await create();
  const { pending, target, oldCode, newCode } = await openTransaction(person);
  mailFault = true;
  clearBuckets();
  const response = await post("verify", { id: pending.id, oldCode, newCode }, person.cookie);
  mailFault = false;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { changed: true, signedOut: true, changedTo: target, notified: false });
  assert.equal(userRow(person.id).email, target, "the change itself is committed");
  assert.equal(sent(person.email, "change-email-notice").length, 0);
  clearBuckets();
  assert.equal((await post("verify", { id: pending.id, oldCode, newCode }, person.cookie)).status, 401, "no resubmission of a completed change");
});

test("the flow needs a current password, a fresh login and the challenge, and never accepts the target address itself", async () => {
  const person = await create();
  const target = address();
  for (const [label, body] of [
    ["no password", { newEmail: target, turnstileToken: "local" }],
    ["extra field", { password: person.password, newEmail: target, turnstileToken: "local", id: "x" }],
    ["same address", { password: person.password, newEmail: person.email.toUpperCase(), turnstileToken: "local" }],
    ["no challenge", { password: person.password, newEmail: target }],
    ["invalid address", { password: person.password, newEmail: "not-an-email", turnstileToken: "local" }],
    ["raw code submitted", { password: person.password, newEmail: target, turnstileToken: "local", oldCode: "123456" }],
  ]) {
    clearBuckets();
    const response = await post("start", body, person.cookie);
    assert.notEqual(response.status, 200, label);
  }
  assert.equal(userRow(person.id).email, person.email);
  clearBuckets();
  assert.equal((await post("start", { password: "wrong" + password(), newEmail: target, turnstileToken: "local" }, person.cookie)).status, 400);
  assert.equal(sent(target, "change-email-new").length, 0, "a wrong password sends no mail");
  clearBuckets();
  challengeFault = true;
  const refused = await post("start", { password: person.password, newEmail: target, turnstileToken: "expired-widget" }, person.cookie);
  challengeFault = false;
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: "challenge_failed" });
  assert.equal(sent(target, "change-email-new").length, 0, "a refused challenge sends no mail");
  // A login older than 24h is a stale session, not an expired one.
  await login(person);
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) });
  database.getDatabase().prepare("UPDATE session SET createdAt=? WHERE id=?")
    .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), session.session.id);
  clearBuckets();
  const stale = await post("start", { password: person.password, newEmail: target, turnstileToken: "local" }, person.cookie);
  assert.equal(stale.status, 403);
  assert.deepEqual(await stale.json(), { error: "reauth_required" });
  assert.equal((await read(person.cookie)).status, 403);
  assert.equal((await read("")).status, 401);
});

test("email-change mail stays inside its own budget and keeps the password-recovery reserve", async () => {
  const person = await create();
  const db = database.getDatabase();
  const day = new Date().setUTCHours(0, 0, 0, 0);
  clearBuckets();
  for (let index = 0; index < 40; index += 1)
    db.prepare("INSERT INTO mail_requests VALUES (?,?,?,?,?,NULL)")
      .run(randomUUID(), "hash", index % 2 ? "change-email-old" : "change-email-new", day + index, "accepted");
  const blocked = await post("start", { password: person.password, newEmail: address(), turnstileToken: "local" }, person.cookie);
  assert.equal(blocked.status, 503);
  assert.deepEqual(await blocked.json(), { error: "mail_send_failed" });
  assert.equal(userRow(person.id).email, person.email);
  // Recovery still has its own reserve.
  clearBuckets();
  assert.equal((await auth("email-otp/request-password-reset", { email: person.email, turnstileToken: "local" })).status, 200);
});

test("email failures keep distinct copy and never claim a change that did not happen", () => {
  const scoped = (code) => accountErrorKey(code, "email");
  assert.equal(scoped("password_wrong"), "emailPasswordWrong");
  assert.equal(scoped("code_failed"), "emailCodeWrong");
  assert.equal(scoped("attempts_exhausted"), "emailAttemptsExhausted");
  assert.equal(scoped("expired"), "emailExpired");
  assert.equal(scoped("not_found"), "emailGone");
  assert.equal(scoped("stale_target"), "emailStaleTarget");
  assert.equal(scoped("email_taken"), "emailTaken");
  assert.equal(scoped("rate_limited"), "emailLimited");
  assert.equal(scoped("mail_send_failed"), "emailMailFailed");
  assert.equal(scoped("stop_unconfirmed"), "securityFailed");
  assert.equal(scoped("network_unknown"), "resultUnknown");
  // Other sections keep the wording they were shipped with.
  assert.equal(accountErrorKey("rate_limited", "password"), "limited");
  assert.equal(accountErrorKey("auth_failed", "password"), "passwordWrong");
  assert.equal(accountErrorKey("not_found", "sessions"), "sessionGone");
});

function active(owner, releaseOnAbort) {
  const query = { owner, turn: randomUUID(), abort: new AbortController() };
  if (releaseOnAbort) query.abort.signal.addEventListener("abort", () => setTimeout(() => releaseQuery(query), 10), { once: true });
  assert.equal(reserveQuery(query), true);
  return query;
}

test.after(async () => {
  global.fetch = originalFetch;
  database.getDatabase().close();
  await fs.rm(directory, { recursive: true, force: true });
});
