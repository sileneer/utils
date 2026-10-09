/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "account-test-" + randomUUID());
Object.assign(process.env, { DATABASE_PATH: path.join(directory, "utils.sqlite"), BETTER_AUTH_SECRET: randomUUID() + randomUUID(), APP_URL: "http://localhost:3000", BREVO_API_KEY: "unit-fixture", MAIL_FROM: "noreply@example.test", TURNSTILE_SITE_KEY: "unit-fixture", TURNSTILE_SECRET_KEY: "unit-fixture", AI_ENABLED: "0" });
const database = require("../scripts/database.cjs");
const { getAuth } = require("../src/lib/auth/server.ts");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { safeReturnTo, accountLink } = require("../src/lib/auth/navigation.ts");
const { reserveQuery, releaseQuery, accountChangeVersion, stopOwnerQuery } = require("../src/lib/agent/active-query.ts");
const { withAccountChange } = require("../src/lib/auth/lifecycle.ts");
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
let reader, other;
function cookies(r) { return r.headers.getSetCookie().map((v) => v.split(";")[0]).join("; "); }
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
function active(owner, releaseOnAbort = true) {
  const query = { owner, turn: randomUUID(), abort: new AbortController() };
  if (releaseOnAbort) query.abort.signal.addEventListener("abort", () => setTimeout(() => releaseQuery(query), 10), { once: true });
  assert.equal(reserveQuery(query), true);
  return query;
}
test.before(async () => {
  const db = await database.migrate(); db.close();
  reader = await create("first@example.test"); other = await create("second@example.test");
});
test.beforeEach(() => {
  database.getDatabase().prepare("DELETE FROM limits").run();
  database.getDatabase().prepare("DELETE FROM rateLimit").run();
});
test("return destinations preserve site query/hash and reject redirect attacks and auth loops", () => {
  assert.equal(safeReturnTo("/htlb?release=demo#entry-1-2"), "/htlb?release=demo#entry-1-2");
  assert.equal(safeReturnTo("/account"), "/account");
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/%252f%252fevil.test", "/login", "/register", "/api/auth", "/htlb\n", {}, null]) assert.equal(safeReturnTo(value), "/");
  assert.equal(new URL(accountLink("register", "/htlb?release=demo"), process.env.APP_URL).searchParams.get("returnTo"), "/htlb?release=demo");
});
test("site identity works with AI disabled, is safe/no-store, and service failure is not anonymous", async () => {
  assert.deepEqual(await (await account("", undefined)).json(), { user: null });
  const response = await account("", undefined, reader.cookie), body = await response.json();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(body.user).sort(), ["id", "name", "email", "emailVerified", "createdAt", "isAdmin"].sort());
  assert.equal(body.user.id, reader.id); assert.equal(body.user.isAdmin, false);
  database.getDatabase().prepare("UPDATE user SET role='admin' WHERE id=?").run(reader.id);
  assert.equal((await (await account("", undefined, reader.cookie)).json()).user.isAdmin, true);
  database.getDatabase().prepare("UPDATE user SET role='user' WHERE id=?").run(reader.id);
  const secret = process.env.BETTER_AUTH_SECRET; delete process.env.BETTER_AUTH_SECRET;
  assert.equal((await account("", undefined, reader.cookie)).status, 503);
  process.env.BETTER_AUTH_SECRET = secret;
  assert.equal((await account("/sessions", undefined)).status, 401);
});
test("profile updates only current name and rejects origin/role/email/status escalation", async () => {
  assert.equal((await account("/profile", { name: "New Name" }, reader.cookie, "https://evil.test")).status, 403);
  for (const extra of [{ role: "admin" }, { status: "disabled" }, { emailVerified: true }, { email: other.email }, { image: "https://evil.test" }]) assert.equal((await account("/profile", { name: "New Name", ...extra }, reader.cookie)).status, 400);
  for (const name of ["", " ", "a".repeat(81)]) assert.equal((await account("/profile", { name }, reader.cookie)).status, 400);
  const response = await account("/profile", { name: "  New Name  " }, reader.cookie);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal((await (await account("", undefined, reader.cookie)).json()).user.name, "New Name");
  assert.equal((await (await account("", undefined, other.cookie)).json()).user.name, "Test");
});
test("session listing contains safe row IDs, timestamps and inferred device fields only", async () => {
  const secondCookie = await login(reader);
  const response = await account("/sessions", undefined, reader.cookie), { sessions } = await response.json();
  assert.equal(response.status, 200); assert.equal(sessions.length, 2);
  assert.equal(sessions.filter((s) => s.current).length, 1);
  for (const session of sessions) assert.deepEqual(Object.keys(session).sort(), ["id", "current", "createdAt", "expiresAt", "browser", "system"].sort());
  for (const row of database.getDatabase().prepare("SELECT token FROM session").all()) assert.equal(JSON.stringify(sessions).includes(row.token), false);
  assert.notEqual(secondCookie, reader.cookie);
});
test("wrong passwords/foreign session IDs and invalid reset codes cannot cancel AI or mutate sessions", async () => {
  const query = active(reader.id, false);
  const foreign = (await (await account("/sessions", undefined, other.cookie)).json()).sessions[0].id;
  assert.equal((await account("/sessions/revoke", { id: foreign, password: reader.password }, reader.cookie)).status, 404);
  assert.equal((await account("/password", { currentPassword: password(), newPassword: password() }, reader.cookie)).status, 400);
  assert.equal((await auth("email-otp/reset-password", { email: reader.email, otp: "000000", password: password() })).status, 400);
  assert.equal(query.abort.signal.aborted, false);
  assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }));
  releaseQuery(query);
});
test("a revoked target and logout stop account-owned AI before mutation and preserve other user", async () => {
  const { sessions } = await (await account("/sessions", undefined, reader.cookie)).json();
  const target = sessions.find((s) => !s.current);
  const query = active(reader.id);
  assert.equal((await account("/sessions/revoke", { id: target.id, password: reader.password }, reader.cookie)).status, 200);
  assert.equal(query.abort.signal.aborted, true);
  assert.equal(database.getDatabase().prepare("SELECT 1 FROM session WHERE id=?").get(target.id), undefined);
  assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: other.cookie }) }));
  const query2 = active(reader.id);
  assert.equal((await auth("sign-out", {}, reader.cookie)).status, 200);
  assert.equal(query2.abort.signal.aborted, true);
  assert.equal(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }), null);
  reader.cookie = await login(reader);
});
test("one user's pending cancellation cannot queue or revoke another user's logout", async () => {
  const query = active(reader.id, false);
  const first = auth("sign-out", {}, reader.cookie);
  await new Promise((resolve) => query.abort.signal.addEventListener("abort", resolve, { once: true }));
  let timer;
  try {
    const second = await Promise.race([
      auth("sign-out", {}, other.cookie),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cross_account_queue")), 2000); }),
    ]);
    assert.equal(second.status, 200);
    assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }));
  } finally { clearTimeout(timer); releaseQuery(query); await first; }
  reader.cookie = await login(reader); other.cookie = await login(other);
});
test("account fence rejects both concurrent and delayed pre-revocation query registration", async () => {
  const version = accountChangeVersion();
  await withAccountChange(reader.id, async () => {
    assert.equal(reserveQuery({ owner: reader.id, turn: randomUUID(), abort: new AbortController() }), false);
    await assert.rejects(withAccountChange(reader.id, async () => undefined), /account_busy/);
    const unrelated = { owner: other.id, turn: randomUUID(), authorizationVersion: version, abort: new AbortController() };
    assert.equal(reserveQuery(unrelated), true); releaseQuery(unrelated);
  });
  assert.equal(reserveQuery({ owner: reader.id, turn: randomUUID(), authorizationVersion: version, abort: new AbortController() }), false);
  const query = active(other.id); releaseQuery(query);
});
test("change password validates policy, waits for stop, rotates cookie and revokes other sessions", async () => {
  const oldCookie = reader.cookie, otherCookie = await login(reader);
  const nextPassword = password();
  for (const candidate of ["abc1234", "abcdefgh", "12345678"]) assert.equal((await account("/password", { currentPassword: reader.password, newPassword: candidate }, reader.cookie)).status, 400);
  const query = active(reader.id);
  const response = await account("/password", { currentPassword: reader.password, newPassword: nextPassword }, reader.cookie);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
  assert.equal(query.abort.signal.aborted, true);
  assert.equal(await getAuth().api.getSession({ headers: new Headers({ cookie: otherCookie }) }), null);
  assert.equal(await getAuth().api.getSession({ headers: new Headers({ cookie: oldCookie }) }), null);
  reader.cookie = cookies(response); reader.password = nextPassword;
  assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }));
});
test("valid OTP reset stops the request before password write and revokes all sessions", async () => {
  assert.equal((await auth("email-otp/request-password-reset", { email: reader.email, turnstileToken: "local" })).status, 200);
  const code = otp(reader.email), wrong = code === "000000" ? "111111" : "000000";
  const query = active(reader.id);
  assert.equal((await auth("email-otp/reset-password", { email: reader.email, otp: wrong, password: password() })).status, 400);
  assert.equal(query.abort.signal.aborted, false);
  const nextPassword = password();
  assert.equal((await auth("email-otp/reset-password", { email: reader.email, otp: code, password: nextPassword })).status, 200);
  assert.equal(query.abort.signal.aborted, true);
  assert.equal(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }), null);
  reader.password = nextPassword; reader.cookie = await login(reader);
});
test("unconfirmed cancellation fails before logout or password write; account can recover", async () => {
  const query = active(reader.id, false);
  assert.equal(await stopOwnerQuery(reader.id, 5), false);
  const original = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) => original(fn, delay === 30_000 ? 5 : delay, ...args);
  try {
    const response = await auth("sign-out", {}, reader.cookie);
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: "stop_unconfirmed" });
    assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }));
    const nextPassword = password();
    assert.equal((await account("/password", { currentPassword: reader.password, newPassword: nextPassword }, reader.cookie)).status, 409);
    assert.equal((await auth("email-otp/request-password-reset", { email: reader.email, turnstileToken: "local" })).status, 200);
    assert.equal((await auth("email-otp/reset-password", { email: reader.email, otp: otp(reader.email), password: nextPassword })).status, 409);
    assert.ok(await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) }));
  } finally { global.setTimeout = original; releaseQuery(query); }
  reader.cookie = await login(reader); // Original password still works.
});
test("expired freshness and inactive users cannot manage account security", async () => {
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie: reader.cookie }) });
  database.getDatabase().prepare("UPDATE session SET createdAt=? WHERE id=?").run(Date.now() - 2 * 86400_000, session.session.id);
  assert.equal((await account("/sessions", undefined, reader.cookie)).status, 403);
  assert.equal((await account("/password", { currentPassword: reader.password, newPassword: password() }, reader.cookie)).status, 403);
  database.getDatabase().prepare("UPDATE user SET status='disabled' WHERE id=?").run(reader.id);
  assert.deepEqual(await (await account("", undefined, reader.cookie)).json(), { user: null });
  assert.equal((await account("/profile", { name: "Bad" }, reader.cookie)).status, 401);
  database.getDatabase().prepare("UPDATE user SET status='active' WHERE id=?").run(reader.id);
});
test.after(async () => { global.fetch = originalFetch; database.getDatabase().close(); await fs.rm(directory, { recursive: true, force: true }); });
