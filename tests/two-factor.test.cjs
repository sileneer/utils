/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes, createHmac } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "two-factor-test-" + randomUUID());
Object.assign(process.env, {
  DATABASE_PATH: path.join(directory, "utils.sqlite"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  APP_URL: "http://localhost:3000",
  BREVO_API_KEY: "unit-fixture", MAIL_FROM: "noreply@example.test",
  TURNSTILE_SITE_KEY: "unit-fixture", TURNSTILE_SECRET_KEY: "unit-fixture",
  AI_ENABLED: "0",
});
const Module = require("node:module");
// Only Next's per-request header accessor is supplied; `currentUser`, `accountSession`
// and the route handlers themselves all stay real, so the gate is genuinely tested.
let requestHeaders = new Headers();
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "next/headers")
    return {
      headers: async () => requestHeaders,
      cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
    };
  return load.call(this, name, ...args);
};
const database = require("../scripts/database.cjs");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { handleTwoFactor } = require("../src/lib/auth/two-factor-handler.ts");
const { getAuth } = require("../src/lib/auth/server.ts");

const mail = [];
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({
      email: body.to[0].email,
      code: body.textContent.match(/(\d{6})/)?.[0] ?? null,
    });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};

const db = () => database.getDatabase();
const password = () => "Q" + randomBytes(10).toString("hex") + "7";
const origin = () => process.env.APP_URL;
/** A cookie jar, so an expiring Set-Cookie removes the value instead of sitting
 * alongside the replacement the way a naive join would. */
function applyCookies(current, response) {
  const jar = new Map();
  for (const part of (current ?? "").split("; ")) {
    if (!part) continue;
    const at = part.indexOf("=");
    jar.set(part.slice(0, at), part.slice(at + 1));
  }
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at), value = pair.slice(at + 1);
    const cleared = attrs.some((a) => {
      const attribute = a.trim().toLowerCase();
      return attribute === "max-age=0" || attribute.startsWith("expires=thu, 01 jan 1970");
    });
    if (cleared) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
const cookies = (response) => applyCookies("", response);

const auth = (route, body, cookie) => handleAuth(new Request(origin() + "/api/auth/" + route, {
  method: "POST",
  headers: { origin: origin(), "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const account = (route, body, cookie) => handleAccount(new Request(origin() + "/api/account" + route, {
  method: "POST",
  headers: { origin: origin(), "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const accountGet = (route, cookie) => handleAccount(new Request(origin() + "/api/account" + route, {
  headers: { ...(cookie ? { cookie } : {}) },
}));
const factor = (route, body, cookie) => handleTwoFactor(new Request(origin() + "/api/2fa" + route, {
  method: "POST",
  headers: { origin: origin(), "content-type": "application/json", "user-agent": "QaTestAgent/1.0 (Test device)", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const factorGet = (route, cookie) => handleTwoFactor(new Request(origin() + "/api/2fa" + route, {
  headers: { ...(cookie ? { cookie } : {}) },
}));
const statusOf = async (cookie) => (await (await accountGet("/2fa", cookie)).json()).twoFactor;
const userRow = (id) => db().prepare("SELECT email,twoFactorEnabled FROM user WHERE id=?").get(id);
const factorRow = (id) => db().prepare("SELECT verified, failedVerificationCount, lockedUntil FROM twoFactor WHERE userId=?").get(id);
const eventsFor = (id) => db().prepare("SELECT kind FROM security_events WHERE user_id=? ORDER BY occurred_at").all(id).map((r) => r.kind);
const sessionCount = (id) => db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(id).n;

/** RFC 6238 for any time step, so the clock boundary can be tested deterministically. */
async function totpAt(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(buf).digest();
  const offset = h[h.length - 1] & 15;
  const value = ((h[offset] & 127) << 24 | (h[offset + 1] & 255) << 16 |
    (h[offset + 2] & 255) << 8 | (h[offset + 3] & 255)) % 10 ** digits;
  return String(value).padStart(digits, "0");
}
async function secretOf(userId) {
  const row = db().prepare("SELECT secret FROM twoFactor WHERE userId=?").get(userId);
  if (!row) return null;
  const { symmetricDecrypt } = await import("better-auth/crypto");
  return symmetricDecrypt({ key: process.env.BETTER_AUTH_SECRET, data: row.secret });
}
/** `steps` is in 30-second periods; the plugin accepts window 1. */
async function codeFor(userId, steps = 0) {
  return totpAt(await secretOf(userId), Math.floor(Date.now() / 30_000) + steps);
}

async function create(email) {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name: "Owner", turnstileToken: "local" })).status, 200);
  const code = mail.filter((m) => m.email === email).at(-1).code;
  assert.equal((await auth("email-otp/verify-email", { email, otp: code })).status, 200);
  const signedIn = await auth("sign-in/email", { email, password: person.password });
  assert.equal(signedIn.status, 200);
  person.cookie = cookies(signedIn);
  person.id = db().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
/** Enable and confirm, returning the recovery codes. Enrolment ends signed out. */
async function enroll(person) {
  clearBuckets();
  const issued = await account("/2fa/enable", { password: person.password }, person.cookie);
  assert.equal(issued.status, 200);
  const { backupCodes } = await issued.json();
  clearBuckets();
  const confirmed = await account("/2fa/confirm", { code: await codeFor(person.id) }, person.cookie);
  assert.equal(confirmed.status, 200);
  const result = await confirmed.json();
  assert.equal(result.enabled, true);
  assert.equal(result.signedOut, true);
  assert.ok(result.sessionsAffected >= 1, "existing logins were revoked");
  assert.equal(sessionCount(person.id), 0, "enrolment leaves no session behind");
  person.cookie = null;
  return backupCodes;
}
async function login(person) {
  const response = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(response.status, 200);
  return { body: await response.json(), cookie: cookies(response) };
}
/** Password + second factor, the way the product does it. */
async function loginWithFactor(person) {
  const first = await login(person);
  assert.deepEqual(first.body, { twoFactorRequired: true }, "sign-in must stop at the challenge");
  clearBuckets();
  const verified = await factor("/verify", { code: await codeFor(person.id) }, first.cookie);
  assert.equal(verified.status, 200);
  person.cookie = applyCookies(first.cookie, verified);
  return person.cookie;
}
function clearBuckets() {
  db().prepare("DELETE FROM limits").run();
  db().prepare("DELETE FROM rateLimit").run();
}

test.before(async () => {
  const handle = await database.migrate();
  handle.close();
});
test.beforeEach(clearBuckets);

test("the two-factor table matches what the plugin asks for", async () => {
  const columns = db().prepare("PRAGMA table_info(user)").all().map((c) => c.name);
  assert.ok(columns.includes("twoFactorEnabled"), "user.twoFactorEnabled exists");
  const factor = db().prepare("PRAGMA table_info(twoFactor)").all().map((c) => c.name);
  assert.deepEqual(factor, ["id", "secret", "backupCodes", "userId", "verified", "failedVerificationCount", "lockedUntil"]);
  const person = await create("plain@example.test");
  assert.equal(userRow(person.id).twoFactorEnabled, 0, "an account predating 2FA is unaffected");
  assert.deepEqual(await statusOf(person.cookie), { enabled: false, pending: false, codesRemaining: 0 });
});

test("enabling issues a secret and codes but enables nothing until a code is proven", async () => {
  const person = await create("enable@example.test");
  clearBuckets();
  const wrong = await account("/2fa/enable", { password: password() }, person.cookie);
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { error: "password_wrong" });
  assert.equal(factorRow(person.id), undefined, "a rejected password must not start an enrolment");

  clearBuckets();
  const issued = await account("/2fa/enable", { password: person.password }, person.cookie);
  assert.equal(issued.status, 200);
  const body = await issued.json();
  assert.ok(body.totpURI.startsWith("otpauth://totp/"), "provisioning URI is returned once");
  assert.equal(body.backupCodes.length, 10);
  assert.match(body.backupCodes[0], /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
  assert.deepEqual(await statusOf(person.cookie), { enabled: false, pending: true, codesRemaining: 10 });
  assert.equal(userRow(person.id).twoFactorEnabled, 0);
  assert.equal(factorRow(person.id).verified, 0);

  // An unconfirmed enrolment must not lock the owner out of their own account.
  const plain = await login(person);
  assert.notDeepEqual(plain.body, { twoFactorRequired: true }, "still no challenge while unconfirmed");
  assert.ok(plain.cookie.includes("better-auth.session_token"));

  // A wrong code cannot complete it either way.
  clearBuckets();
  const bad = await account("/2fa/confirm", { code: "000000" }, person.cookie);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "code_failed" });
  assert.equal(userRow(person.id).twoFactorEnabled, 0);

  // Re-running enable replaces the abandoned secret rather than wedging the account.
  clearBuckets();
  const again = await account("/2fa/enable", { password: person.password }, person.cookie);
  assert.equal(again.status, 200);
  const second = (await again.json()).totpURI;
  assert.notEqual(second, body.totpURI, "the pending secret was replaced");
  clearBuckets();
  assert.equal((await account("/2fa/confirm", { code: await codeFor(person.id) }, person.cookie)).status, 200);
  assert.equal(userRow(person.id).twoFactorEnabled, 1);
});

test("confirming revokes every session and records one confirmed event", async () => {
  const person = await create("confirm@example.test");
  await auth("sign-in/email", { email: person.email, password: person.password });
  assert.ok(sessionCount(person.id) >= 1);
  const codes = await enroll(person);
  assert.equal(codes.length, 10);
  assert.equal(userRow(person.id).twoFactorEnabled, 1);
  assert.equal(factorRow(person.id).verified, 1);
  assert.equal(sessionCount(person.id), 0, "no session that skipped the challenge survives");
  assert.deepEqual(eventsFor(person.id), ["two_factor_enable"]);
});

test("a pending challenge is not an identity anywhere in the product", async () => {
  const person = await create("gate@example.test");
  await enroll(person);
  const { cookie: challenge } = await login(person);

  assert.equal((await (await accountGet("", challenge)).json()).user, null);
  assert.equal((await accountGet("/sessions", challenge)).status, 401);
  assert.equal((await accountGet("/activity", challenge)).status, 401);
  assert.equal((await accountGet("/export/summary", challenge)).status, 401);
  assert.equal((await accountGet("/email", challenge)).status, 401);
  assert.equal((await accountGet("/2fa", challenge)).status, 401);
  // Private AI resources are the point of the gate.
  assert.equal((await handleAgent("conversations", challenge)).status, 401);
  assert.equal((await handleAgent("stop", challenge)).status, 401);
  // This route reports an unauthenticated state as 200 by contract, so the guarantee
  // is that it reveals no conversation and no identity.
  const sessionView = await (await handleAgent("session", challenge)).json();
  assert.equal(sessionView.authed, false);
  assert.equal(sessionView.messages, undefined);
  const chat = await handleAgent("chat", challenge, { message: "hi" });
  assert.equal(chat.status, 401, "an uncompleted challenge must not reach the model");

  // Completing it is what turns the identity on.
  clearBuckets();
  const done = await factor("/verify", { code: await codeFor(person.id) }, challenge);
  assert.equal(done.status, 200);
  assert.deepEqual(await done.json(), { signedIn: true });
  const established = applyCookies(challenge, done);
  assert.equal((await accountGet("/sessions", established)).status, 200);
  assert.equal((await handleAgent("conversations", established)).status, 200);
});

test("a challenge-completed login still names the device that made it", async () => {
  const person = await create("device@example.test");
  await enroll(person);
  const cookie = await loginWithFactor(person);
  // The plugin creates this session without request context, so the wrapper writes the
  // user agent back; without that the sessions list and the security record would both
  // read "Unknown" for every two-factor login.
  assert.equal(
    db().prepare("SELECT userAgent FROM session WHERE userId=?").get(person.id).userAgent,
    "QaTestAgent/1.0 (Test device)",
  );
  assert.ok(cookie, "the sign-in finished");
});

test("a challenge is single-use, expires, and refuses a wrong code without creating a session", async () => {
  const person = await create("replay@example.test");
  await enroll(person);
  const { cookie: challenge } = await login(person);

  clearBuckets();
  const replayed = await factor("/verify", { code: "000000" }, challenge);
  assert.equal(replayed.status, 400);
  assert.deepEqual(await replayed.json(), { error: "code_failed" });
  assert.equal((await accountGet("/sessions", challenge)).status, 401, "a wrong code cannot mint an identity");

  clearBuckets();
  const accepted = await factor("/verify", { code: await codeFor(person.id) }, challenge);
  assert.equal(accepted.status, 200);
  clearBuckets();
  const replay = await factor("/verify", { code: await codeFor(person.id) }, challenge);
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "challenge_gone" }, "the consumed challenge cannot be replayed");

  // A fresh challenge expires on its own.
  const second = (await login(person)).cookie;
  db().prepare("UPDATE verification SET expiresAt=? WHERE identifier LIKE '2fa-%'")
    .run(new Date(Date.now() - 1000).toISOString());
  clearBuckets();
  const expired = await factor("/verify", { code: await codeFor(person.id) }, second);
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), { error: "challenge_gone" });
});

test("failures accumulate across challenges and ten of them lock the account", async () => {
  const person = await create("budget@example.test");
  await enroll(person);
  for (let round = 0; round < 2; round += 1) {
    const { cookie: challenge } = await login(person);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      clearBuckets();
      const wrong = await factor("/verify", { code: "000000" }, challenge);
      assert.notEqual(wrong.status, 200, `round ${round} attempt ${attempt}`);
      if ([401, 409].includes(wrong.status)) break;
    }
  }
  const locked = factorRow(person.id);
  assert.ok(locked.failedVerificationCount >= 5, "failures accumulate across challenges");
  assert.ok(locked.lockedUntil, "the account-level lock engaged");
  const { cookie: challenge } = await login(person);
  clearBuckets();
  const refused = await factor("/verify", { code: await codeFor(person.id) }, challenge);
  assert.equal(refused.status, 429, "a correct code is still refused while locked");
  assert.deepEqual(await refused.json(), { error: "locked" });
});

test("the plugin's own request cap reads as throttling, never as a wrong code", async () => {
  const person = await create("throttle@example.test");
  await enroll(person);
  const { cookie: challenge } = await login(person);
  clearBuckets();
  const answers = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await factor("/verify", { code: "000000" }, challenge);
    answers.push({ status: response.status, error: await response.json() });
  }
  // The plugin allows three `/two-factor/` requests per ten seconds. The fourth must
  // come back as "wait", not as another wrong code: collapsing it into `code_failed`
  // made a working authenticator look broken and hid the real attempt budget.
  assert.deepEqual(answers.slice(0, 3).map((a) => a.error.error), ["code_failed", "code_failed", "code_failed"]);
  assert.equal(answers[3].status, 429);
  assert.equal(answers[3].error.error, "rate_limited");
  assert.ok(
    db().prepare("SELECT count(*) n FROM verification WHERE identifier LIKE '2fa-%'").get().n >= 1,
    "a throttled request consumes neither the challenge nor its attempt budget",
  );
});

test("the clock window accepts one period either side and rejects anything further", async () => {
  const person = await create("clock@example.test");
  await enroll(person);
  for (const [steps, expected] of [[-1, 200], [1, 200], [-2, 400], [2, 400]]) {
    const { cookie: challenge } = await login(person);
    clearBuckets();
    const response = await factor("/verify", { code: await codeFor(person.id, steps) }, challenge);
    if (expected === 200) {
      assert.equal(response.status, 200, `offset ${steps}`);
      assert.ok(cookies(response).includes("better-auth.session_token"));
    } else {
      assert.equal(response.status, 400, `offset ${steps}`);
      assert.deepEqual(await response.json(), { error: "code_failed" });
    }
  }
});

test("recovery codes sign in once each, and the two kinds are not interchangeable", async () => {
  const person = await create("recovery@example.test");
  const codes = await enroll(person);
  const [first, second] = codes;

  // A recovery code cannot be typed into the authenticator field.
  const wrongSlot = await login(person);
  clearBuckets();
  assert.equal((await factor("/verify", { code: first }, wrongSlot.cookie)).status, 400);

  const attempt = await login(person);
  clearBuckets();
  const used = await factor("/recovery", { code: first }, attempt.cookie);
  assert.equal(used.status, 200);
  assert.equal((await statusOf(cookies(used))).codesRemaining, 9);

  const replay = await login(person);
  clearBuckets();
  const refused = await factor("/recovery", { code: first }, replay.cookie);
  assert.equal(refused.status, 400);
  assert.deepEqual(await refused.json(), { error: "recovery_failed" }, "a spent code is spent");
  assert.equal((await accountGet("/sessions", replay.cookie)).status, 401);

  const next = await login(person);
  clearBuckets();
  assert.equal((await factor("/recovery", { code: second }, next.cookie)).status, 200);
});

test("regenerating recovery codes invalidates the previous set and needs the live factor", async () => {
  const person = await create("regen@example.test");
  const old = await enroll(person);
  await loginWithFactor(person);

  clearBuckets();
  const noFactor = await account("/2fa/recovery-codes", { password: person.password, code: "000000" }, person.cookie);
  assert.equal(noFactor.status, 400);
  assert.deepEqual(await noFactor.json(), { error: "code_failed" });
  assert.equal((await statusOf(person.cookie)).codesRemaining, 10, "a refused attempt changed nothing");

  clearBuckets();
  const issued = await account("/2fa/recovery-codes", { password: person.password, code: await codeFor(person.id) }, person.cookie);
  assert.equal(issued.status, 200);
  const fresh = (await issued.json()).backupCodes;
  assert.equal(fresh.length, 10);
  assert.notDeepEqual(fresh, old);
  assert.deepEqual(eventsFor(person.id), ["two_factor_enable", "two_factor_recovery_codes_regenerated"]);

  const attempt = await login(person);
  clearBuckets();
  assert.equal((await factor("/recovery", { code: old[0] }, attempt.cookie)).status, 400, "the superseded set is dead");
  const again = await login(person);
  clearBuckets();
  assert.equal((await factor("/recovery", { code: fresh[0] }, again.cookie)).status, 200);
});

test("disabling needs the second factor as well as the password, and then signs everything out", async () => {
  const person = await create("disable@example.test");
  await enroll(person);
  await loginWithFactor(person);

  clearBuckets();
  const refused = await account("/2fa/disable", { password: person.password, code: "000000" }, person.cookie);
  assert.equal(refused.status, 400);
  assert.equal(userRow(person.id).twoFactorEnabled, 1, "a refused disable leaves the factor on");
  assert.ok(sessionCount(person.id) >= 1);

  clearBuckets();
  const disabled = await account("/2fa/disable", { password: person.password, code: await codeFor(person.id) }, person.cookie);
  assert.equal(disabled.status, 200);
  assert.deepEqual(await disabled.json(), { disabled: true, signedOut: true, sessionsAffected: 1 });
  assert.equal(userRow(person.id).twoFactorEnabled, 0);
  assert.equal(factorRow(person.id), undefined, "the secret is removed, not left dormant");
  assert.equal(sessionCount(person.id), 0);
  assert.deepEqual(eventsFor(person.id), ["two_factor_enable", "two_factor_disable"]);

  const after = await login(person);
  assert.notDeepEqual(after.body, { twoFactorRequired: true }, "sign-in is single-factor again");
});

test("a recovery code can stand in for the factor when the device is unavailable", async () => {
  const person = await create("lost-device@example.test");
  const codes = await enroll(person);
  await login(person);
  // Log in with a recovery code instead of the authenticator, then use another one to
  // turn the factor off: losing the phone must not strand an owner who kept their codes.
  const attempt = await login(person);
  clearBuckets();
  assert.equal((await factor("/recovery", { code: codes[0] }, attempt.cookie)).status, 200);
  await loginWithFactor(person);
  clearBuckets();
  const off = await account("/2fa/disable", { password: person.password, code: codes[1] }, person.cookie);
  assert.equal(off.status, 200);
  assert.equal(userRow(person.id).twoFactorEnabled, 0);
});

test("neither a password reset nor a password change can bypass the second factor", async () => {
  const person = await create("reset@example.test");
  await enroll(person);
  await loginWithFactor(person);
  const before = sessionCount(person.id);
  assert.ok(before >= 1);

  clearBuckets();
  assert.equal((await auth("email-otp/request-password-reset", { email: person.email, turnstileToken: "local" })).status, 200);
  const otp = mail.filter((m) => m.email === person.email).at(-1).code;
  const next = password();
  clearBuckets();
  const reset = await auth("email-otp/reset-password", { email: person.email, otp, password: next });
  assert.equal(reset.status, 200);
  assert.equal(reset.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=") && !/=(;\s*)?(Max-Age=0|expires=Thu, 01 Jan 1970)/.test(c)), false,
    "a password reset must not hand out a live session");
  assert.equal(sessionCount(person.id), 0, "reset revoked every session");
  assert.equal(userRow(person.id).twoFactorEnabled, 1, "reset cannot switch the factor off");

  person.password = next;
  const afterReset = await login(person);
  assert.deepEqual(afterReset.body, { twoFactorRequired: true }, "the new password still faces the challenge");
  assert.equal((await accountGet("/sessions", afterReset.cookie)).status, 401);
  clearBuckets();
  assert.equal((await factor("/verify", { code: await codeFor(person.id) }, afterReset.cookie)).status, 200);

  // And the same for a password change made from inside a live session.
  await loginWithFactor(person);
  const changed = password();
  clearBuckets();
  assert.equal((await account("/password", { currentPassword: person.password, newPassword: changed }, person.cookie)).status, 200);
  person.password = changed;
  const afterChange = await login(person);
  assert.deepEqual(afterChange.body, { twoFactorRequired: true });
});

test("no library two-factor endpoint is reachable from the public door", async () => {
  const person = await create("surface@example.test");
  await enroll(person);
  const { cookie } = await login(person);
  for (const route of [
    "two-factor/enable", "two-factor/disable", "two-factor/verify-totp",
    "two-factor/verify-backup-code", "two-factor/generate-backup-codes",
    "two-factor/get-totp-uri", "two-factor/view-backup-codes",
  ]) {
    const response = await auth(route, { code: "000000", password: person.password, userId: person.id }, cookie);
    assert.equal(response.status, 404, route);
  }
  assert.equal((await handleAuth(new Request(origin() + "/api/auth/two-factor/verify-totp", { method: "GET" }))).status, 404);
});

test("the challenge surface refuses everything that is not a bare code", async () => {
  const person = await create("fields@example.test");
  await enroll(person);
  assert.equal((await factorGet("/verify")).status, 404, "GET is not a challenge route");
  assert.equal((await factor("/verify", { code: "000000" })).status, 401, "no challenge cookie");

  const { cookie: challenge } = await login(person);
  for (const [label, body] of [
    ["trust device", { code: await codeFor(person.id), trustDevice: true }],
    ["disable session", { code: await codeFor(person.id), disableSession: true }],
    ["extra field", { code: await codeFor(person.id), userId: "other" }],
    ["short code", { code: "12345" }],
    ["long code", { code: "1234567" }],
    ["non numeric", { code: "abcdef" }],
  ]) {
    clearBuckets();
    const response = await factor("/verify", body, challenge);
    assert.equal(response.status, 400, label);
    assert.deepEqual(await response.json(), { error: "bad_request" }, label);
  }
  clearBuckets();
  const recoveryShape = await factor("/recovery", { code: "000000" }, challenge);
  assert.equal(recoveryShape.status, 400, "a TOTP code is not a recovery code shape");

  // A device-trust cookie is never issued, so no later sign-in can skip the factor.
  clearBuckets();
  const accepted = await factor("/verify", { code: await codeFor(person.id) }, challenge);
  assert.equal(accepted.status, 200);
  assert.equal(cookies(accepted).includes("trust_device"), false);
  assert.equal(db().prepare("SELECT count(*) n FROM verification WHERE identifier LIKE 'trust-device-%'").get().n, 0);
});

test("an existing session cannot answer a challenge, which is where the library applies no limit", async () => {
  const person = await create("session-branch@example.test");
  await enroll(person);
  const established = await loginWithFactor(person);
  const { cookie: challenge } = await login(person);
  clearBuckets();
  const refused = await factor("/verify", { code: await codeFor(person.id) }, established + "; " + challenge);
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: "signed_in" });
});

test("factor material is never stored or recorded in the clear", async () => {
  const person = await create("secret-hygiene@example.test");
  const codes = await enroll(person);
  const secret = await secretOf(person.id);
  const stored = JSON.stringify(db().prepare("SELECT * FROM twoFactor WHERE userId=?").get(person.id));
  const everything = JSON.stringify({
    twoFactor: db().prepare("SELECT * FROM twoFactor").all(),
    user: userRow(person.id),
    events: db().prepare("SELECT * FROM security_events WHERE user_id=?").all(person.id),
    verification: db().prepare("SELECT * FROM verification").all(),
  });
  assert.equal(stored.includes(secret), false, "the TOTP secret is stored encrypted");
  for (const code of codes) assert.equal(stored.includes(code), false, "recovery codes are stored encrypted");
  assert.equal(everything.includes(secret), false, "no other table holds the secret");
  for (const code of codes) assert.equal(everything.includes(code), false, "no other table holds a recovery code");
  assert.equal(everything.includes(person.password), false);
});

test("management writes need a login inside 24 hours, while status does not", async () => {
  const person = await create("fresh@example.test");
  await enroll(person);
  await loginWithFactor(person);
  const session = await getAuth().api.getSession({ headers: new Headers({ cookie: person.cookie }) });
  db().prepare("UPDATE session SET createdAt=? WHERE id=?")
    .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), session.session.id);
  assert.equal((await accountGet("/2fa", person.cookie)).status, 200, "status stays readable");
  for (const [route, body] of [
    ["/2fa/enable", { password: person.password }],
    ["/2fa/confirm", { code: "000000" }],
    ["/2fa/disable", { password: person.password, code: "000000" }],
    ["/2fa/recovery-codes", { password: person.password, code: "000000" }],
  ]) {
    clearBuckets();
    const response = await account(route, body, person.cookie);
    assert.equal(response.status, 403, route);
    assert.deepEqual(await response.json(), { error: "reauth_required" }, route);
  }
});

test("two accounts keep their factors apart", async () => {
  const alice = await create("alice-2fa@example.test");
  const bob = await create("bob-2fa@example.test");
  const aliceCodes = await enroll(alice);
  await enroll(bob);
  await loginWithFactor(bob);

  const aliceChallenge = (await login(alice)).cookie;
  clearBuckets();
  assert.equal((await factor("/recovery", { code: aliceCodes[0] }, aliceChallenge)).status, 200);
  // Bob's enrolment must not have consumed or exposed any of Alice's material.
  await loginWithFactor(alice);
  assert.equal((await statusOf(alice.cookie)).enabled, true);
  await loginWithFactor(bob);
  assert.equal((await statusOf(bob.cookie)).enabled, true);
});

test("an email change still works with the factor on and keeps it on", async () => {
  const person = await create("both@example.test");
  await enroll(person);
  await loginWithFactor(person);
  const target = "moved-" + randomUUID().slice(0, 8) + "@example.test";
  clearBuckets();
  assert.equal((await account("/email/start", { password: person.password, newEmail: target, turnstileToken: "local" }, person.cookie)).status, 200);
  const pending = (await (await accountGet("/email", person.cookie)).json()).pending;
  clearBuckets();
  const committed = await account("/email/verify", {
    id: pending.id,
    oldCode: mail.filter((m) => m.email === person.email && m.code)?.at(-1).code,
    newCode: mail.filter((m) => m.email === target).at(-1).code,
  }, person.cookie);
  assert.equal(committed.status, 200);
  assert.equal(userRow(person.id).email, target);
  assert.equal(userRow(person.id).twoFactorEnabled, 1, "changing the address does not disturb the factor");
  assert.equal(sessionCount(person.id), 0);
  const after = await login({ email: target, password: person.password, id: person.id });
  assert.deepEqual(after.body, { twoFactorRequired: true });
});

/** Next resolves `headers()` from the request context, not from the handler argument,
 * so the stubbed accessor has to see the same cookie the Request carries. */
function handleAgent(route, cookie, body = {}) {
  const handlers = {
    conversations: require("../src/app/api/agent/conversations/route.ts").GET,
    session: require("../src/app/api/agent/session/route.ts").GET,
    stop: require("../src/app/api/agent/stop/route.ts").POST,
    chat: require("../src/app/api/agent/chat/route.ts").POST,
  }[route];
  const url = origin() + "/api/agent/" + route;
  requestHeaders = new Headers({ cookie, origin: origin() });
  return handlers(route === "chat" || route === "stop"
    ? new Request(url, {
        method: "POST",
        headers: { origin: origin(), "content-type": "application/json", cookie },
        body: JSON.stringify(body),
      })
    : new Request(url, { headers: { cookie } }));
}

/** Control either asynchronous boundary without replacing credential verification. */
async function pausedSessionCreation(beforeInsert = false) {
  const context = await getAuth().$context;
  const target = beforeInsert ? context.adapter : context.internalAdapter;
  const method = beforeInsert ? "create" : "createSession";
  const original = target[method];
  let entered, resume;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const released = new Promise((resolve) => { resume = resolve; });
  let once = true;
  target[method] = async function (...args) {
    if (once && (!beforeInsert || args[0].model === "session")) {
      once = false;
      entered();
      await released;
    }
    return original.apply(this, args);
  };
  return { waiting, resume, restore: () => { target[method] = original; } };
}

test("a password-only login in flight cannot survive TOTP activation", async () => {
  const person = await create("factor-login-race@example.test");
  assert.equal((await account("/2fa/enable", { password: person.password }, person.cookie)).status, 200);
  clearBuckets();
  const pause = await pausedSessionCreation();
  const login = auth("sign-in/email", { email: person.email, password: person.password });
  try {
    await pause.waiting;
    const confirmed = await account("/2fa/confirm", { code: await codeFor(person.id) }, person.cookie);
    assert.equal(confirmed.status, 200);
    pause.resume();
    const stale = await login;
    assert.equal(stale.ok, false);
    assert.equal(stale.headers.getSetCookie().length, 0);
    assert.equal(sessionCount(person.id), 0);
  } finally { pause.resume(); pause.restore(); }
  clearBuckets();
  assert.deepEqual((await loginWithFactor(person)).includes("session_token="), true);
});

for (const beforeInsert of [false, true]) test(`password change rejects a late old-password session ${beforeInsert ? "after the before hook" : "before the before hook"}`, async () => {
  const person = await create(`password-login-race-${beforeInsert}@example.test`);
  const pause = await pausedSessionCreation(beforeInsert);
  const login = auth("sign-in/email", { email: person.email, password: person.password });
  const next = password();
  try {
    await pause.waiting;
    assert.equal((await account("/password", { currentPassword: person.password, newPassword: next }, person.cookie)).status, 200);
    pause.resume();
    const stale = await login;
    assert.equal(stale.ok, false);
    assert.equal(stale.headers.getSetCookie().length, 0);
    assert.equal(sessionCount(person.id), 1, "only the acting password-change session remains");
  } finally { pause.resume(); pause.restore(); }
  clearBuckets();
  assert.equal((await auth("sign-in/email", { email: person.email, password: next })).status, 200);
});

test("a different account's security change does not reject or cancel a normal login", async () => {
  const person = await create("login-unrelated@example.test");
  const other = await create("login-other@example.test");
  clearBuckets();
  const pause = await pausedSessionCreation();
  const login = auth("sign-in/email", { email: person.email, password: person.password });
  const { reserveQuery, releaseQuery } = require("../src/lib/agent/active-query.ts");
  const query = { owner: person.id, turn: randomUUID(), abort: new AbortController() };
  assert.equal(reserveQuery(query), true);
  try {
    await pause.waiting;
    assert.equal((await account("/password", { currentPassword: other.password, newPassword: password() }, other.cookie)).status, 200);
    pause.resume();
    assert.equal((await login).status, 200);
    assert.equal(query.abort.signal.aborted, false, "ordinary authentication never stops paid work");
  } finally { pause.resume(); pause.restore(); releaseQuery(query); }
});

test("a recovery code cannot confirm pending TOTP or manufacture an activation event", async () => {
  const person = await create("factor-confirm-recovery@example.test");
  const issued = await account("/2fa/enable", { password: person.password }, person.cookie);
  const { backupCodes } = await issued.json();
  clearBuckets();
  const refused = await account("/2fa/confirm", { code: backupCodes[0] }, person.cookie);
  assert.equal(refused.status, 400);
  assert.deepEqual(await refused.json(), { error: "bad_request" });
  assert.equal(userRow(person.id).twoFactorEnabled, 0);
  assert.equal(factorRow(person.id).verified, 0);
  assert.deepEqual(eventsFor(person.id), []);
  assert.equal((await statusOf(person.cookie)).codesRemaining, 10, "rejected enrollment proof spends no recovery code");
  clearBuckets();
  assert.equal((await account("/2fa/confirm", { code: await codeFor(person.id) }, person.cookie)).status, 200);
});

test("a password change invalidates an unfinished second-factor password proof", async () => {
  const person = await create("factor-old-challenge@example.test");
  await enroll(person);
  await loginWithFactor(person);
  clearBuckets();
  const pending = await login(person);
  assert.deepEqual(pending.body, { twoFactorRequired: true });
  clearBuckets();
  assert.equal((await account("/password", { currentPassword: person.password, newPassword: password() }, person.cookie)).status, 200);
  clearBuckets();
  const refused = await factor("/verify", { code: await codeFor(person.id) }, pending.cookie);
  assert.equal(refused.ok, false);
  assert.equal(refused.headers.getSetCookie().length, 0);
  assert.equal(sessionCount(person.id), 1, "only the password-changing session remains");
});

test("in-flight second-factor completion cannot mint a late session after password change", async () => {
  const person = await create("factor-completion-race@example.test");
  await enroll(person);
  await loginWithFactor(person);
  clearBuckets();
  const pending = await login(person);
  clearBuckets();
  const pause = await pausedSessionCreation();
  const completing = factor("/verify", { code: await codeFor(person.id) }, pending.cookie);
  try {
    await pause.waiting;
    assert.equal((await account("/password", { currentPassword: person.password, newPassword: password() }, person.cookie)).status, 200);
    pause.resume();
    const refused = await completing;
    assert.equal(refused.ok, false);
    assert.equal(refused.headers.getSetCookie().length, 0);
    assert.equal(sessionCount(person.id), 1);
  } finally { pause.resume(); pause.restore(); }
});

test.after(async () => {
  global.fetch = originalFetch;
  db().close();
  await fs.rm(directory, { recursive: true, force: true });
});
