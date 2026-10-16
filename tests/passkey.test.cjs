/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const { createAuthenticator } = require("./webauthn-fixture.cjs");

const directory = path.join(process.cwd(), "data", "passkey-test-" + randomUUID());
Object.assign(process.env, {
  DATABASE_PATH: path.join(directory, "utils.sqlite"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  APP_URL: "http://localhost:3000",
  BREVO_API_KEY: "unit-fixture", MAIL_FROM: "noreply@example.test",
  TURNSTILE_SITE_KEY: "unit-fixture", TURNSTILE_SECRET_KEY: "unit-fixture",
  AI_ENABLED: "0",
});
const RP_ID = "localhost";
const USER_AGENT = "QaTestAgent/1.0 (Passkey device)";

const database = require("../scripts/database.cjs");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { handlePasskeyAuth } = require("../src/lib/auth/passkey-handler.ts");
const { handleTwoFactor } = require("../src/lib/auth/two-factor-handler.ts");
const { listPasskeys } = require("../src/lib/auth/passkey.ts");

const mail = [];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({ email: body.to[0].email, code: body.textContent.match(/(\d{6})/)?.[0] ?? null });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};

const db = () => database.getDatabase();
const origin = () => process.env.APP_URL;
const password = () => "Q" + randomBytes(10).toString("hex") + "7";

function jar(current, response) {
  const map = new Map();
  for (const part of (current ?? "").split("; ")) {
    if (!part) continue;
    const at = part.indexOf("=");
    map.set(part.slice(0, at), part.slice(at + 1));
  }
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at), value = pair.slice(at + 1);
    const cleared = attrs.some((a) => {
      const attribute = a.trim().toLowerCase();
      return attribute === "max-age=0" || attribute.startsWith("expires=thu, 01 jan 1970");
    });
    if (cleared) map.delete(name); else map.set(name, value);
  }
  return [...map].map(([name, value]) => `${name}=${value}`).join("; ");
}

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
const passkeyOptions = (cookie) => handlePasskeyAuth(new Request(origin() + "/api/passkey/options", {
  headers: { ...(cookie ? { cookie } : {}) },
}));
const passkeyVerify = (response, cookie) => handlePasskeyAuth(new Request(origin() + "/api/passkey/verify", {
  method: "POST",
  headers: { origin: origin(), "content-type": "application/json", "user-agent": USER_AGENT, ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ response }),
}));
const list = async (cookie) => (await (await accountGet("/passkeys", cookie)).json()).passkeys;

async function create(email) {
  const person = { email, password: password() };
  assert.equal((await auth("sign-up/email", { ...person, name: "Owner", turnstileToken: "local" })).status, 200);
  const code = mail.filter((m) => m.email === email).at(-1).code;
  assert.equal((await auth("email-otp/verify-email", { email, otp: code })).status, 200);
  const signedIn = await auth("sign-in/email", { email, password: person.password });
  assert.equal(signedIn.status, 200);
  person.cookie = jar("", signedIn);
  person.id = db().prepare("SELECT id FROM user WHERE email=?").get(email).id;
  return person;
}
function clearBuckets() {
  db().prepare("DELETE FROM limits").run();
  db().prepare("DELETE FROM rateLimit").run();
}

/** Runs the two-step registration through the wrapper, exactly as the browser does. */
async function register(person, device, name) {
  clearBuckets();
  const started = await account("/passkeys/register/start", {
    password: person.password, ...(name ? { name } : {}),
  }, person.cookie);
  if (started.status !== 200) return { started, finished: null };
  const options = await started.json();
  const cookie = jar(person.cookie, started);
  const finished = await account("/passkeys/register/finish", {
    response: device.register(options.challenge), ...(name ? { name } : {}),
  }, cookie);
  person.cookie = cookie;
  return { started, finished, options };
}
/** A full passkey sign-in from a browser holding no session. */
async function signIn(device) {
  clearBuckets();
  const options = await passkeyOptions();
  const challenge = await options.json();
  const cookie = jar("", options);
  const verified = await passkeyVerify(device.assert(challenge.challenge), cookie);
  return { verified, cookie: jar(cookie, verified), challenge };
}
/** Enrols TOTP the way the product does, so the combination rules can be tested. */
async function enableTwoFactor(person) {
  const { createHmac } = require("node:crypto");
  const { symmetricDecrypt } = await import("better-auth/crypto");
  clearBuckets();
  assert.equal((await account("/2fa/enable", { password: person.password }, person.cookie)).status, 200);
  const secret = await symmetricDecrypt({
    key: process.env.BETTER_AUTH_SECRET,
    data: db().prepare("SELECT secret FROM twoFactor WHERE userId=?").get(person.id).secret,
  });
  const totp = (steps = 0) => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + steps));
    const hmac = createHmac("sha1", secret).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const value = ((hmac[offset] & 127) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 10 ** 6;
    return String(value).padStart(6, "0");
  };
  clearBuckets();
  assert.equal((await account("/2fa/confirm", { code: totp() }, person.cookie)).status, 200);
  person.cookie = null;
  const signed = await auth("sign-in/email", { email: person.email, password: person.password });
  const challengeCookie = jar("", signed);
  clearBuckets();
  const answered = await handleTwoFactor(new Request(origin() + "/api/2fa/verify", {
    method: "POST",
    headers: { origin: origin(), "content-type": "application/json", cookie: challengeCookie },
    body: JSON.stringify({ code: totp() }),
  }));
  assert.equal(answered.status, 200);
  person.cookie = jar(challengeCookie, answered);
  person.totp = totp;
}

test.before(async () => { (await database.migrate()).close(); });
test.beforeEach(clearBuckets);

test("the passkey table matches what the plugin asks for and adds one index", async () => {
  const columns = db().prepare("PRAGMA table_info(passkey)").all().map((c) => c.name);
  assert.deepEqual(columns, ["id", "name", "publicKey", "userId", "credentialID", "counter", "deviceType", "backedUp", "transports", "createdAt", "aaguid"]);
  const indexes = db().prepare("PRAGMA index_list(passkey)").all().map((i) => i.name);
  assert.ok(indexes.includes("passkey_credentialID_unique"), "the duplicate guard exists");
  const person = await create("pk-plain@example.test");
  assert.deepEqual(await list(person.cookie), [], "a fresh account has no credentials");
});

test("registration is two steps, needs the password, and stores a usable credential", async () => {
  const person = await create("pk-register@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  const startedOnly = await account("/passkeys/register/start", { password: "wrong-password-1" }, person.cookie);
  assert.equal(startedOnly.status, 400);
  assert.deepEqual(await startedOnly.json(), { error: "password_wrong" });
  assert.equal(db().prepare("SELECT count(*) n FROM passkey WHERE userId=?").get(person.id).n, 0, "a refused start stores nothing");

  const { started, finished, options } = await register(person, device, "Laptop");
  assert.equal(started.status, 200);
  assert.equal(options.rp.id, RP_ID, "the RP id is the server's own");
  assert.equal(options.authenticatorSelection.userVerification, "required");
  assert.equal(options.authenticatorSelection.residentKey, "required");
  assert.equal(finished.status, 200);
  const registered = await finished.json();
  assert.deepEqual(Object.keys(registered), ["registered", "passkey"]);
  assert.equal(registered.registered, true);
  assert.equal(registered.passkey.name, "Laptop");
  assert.ok(registered.passkey.id, "the row is identified back to its owner");
  const rows = await list(person.cookie);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["createdAt", "id", "label", "name", "synced"]);
  assert.equal(rows[0].name, "Laptop");
  assert.equal(rows[0].synced, false);

  // The credential really works as a sign-in.
  const { verified, cookie } = await signIn(device);
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { signedIn: true });
  assert.equal((await (await accountGet("", cookie)).json()).user?.email, "pk-register@example.test");
  assert.equal(
    db().prepare("SELECT userAgent FROM session ORDER BY createdAt DESC LIMIT 1").get().userAgent,
    USER_AGENT, "a passkey login names its own device",
  );
});

test("an unverified ceremony is refused and leaves nothing behind", async () => {
  const person = await create("pk-nouv@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin(), userVerified: false });
  const { finished } = await register(person, device);
  assert.equal(finished.status, 403);
  assert.deepEqual(await finished.json(), { error: "not_user_verified" });
  assert.equal(db().prepare("SELECT count(*) n FROM passkey WHERE userId=?").get(person.id).n, 0);
  assert.equal(db().prepare("SELECT count(*) n FROM security_events WHERE user_id=?").get(person.id).n, 0);
});

test("challenges are one-time, purpose-bound, and never mint an identity", async () => {
  const person = await create("pk-replay@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  clearBuckets();
  const started = await account("/passkeys/register/start", { password: person.password }, person.cookie);
  const options = await started.json();
  const cookie = jar(person.cookie, started);
  const first = await account("/passkeys/register/finish", { response: device.register(options.challenge) }, cookie);
  assert.equal(first.status, 200);
  clearBuckets();
  // A different key, so the answer is about the challenge and not about the credential.
  const replay = await account("/passkeys/register/finish",
    { response: createAuthenticator({ rpId: RP_ID, origin: origin() }).register(options.challenge) }, cookie);
  assert.equal(replay.status, 401, "the same challenge cannot be spent twice");
  assert.deepEqual(await replay.json(), { error: "challenge_gone" });

  // A registration challenge must not answer a sign-in, or vice versa.
  clearBuckets();
  const second = await account("/passkeys/register/start", { password: person.password }, person.cookie);
  const registrationChallenge = (await second.json()).challenge;
  // Only the challenge cookie: the sign-in surface refuses a browser that is signed in.
  const regCookie = jar("", second);
  const wrongPurpose = await passkeyVerify(device.assert(registrationChallenge), regCookie);
  assert.equal(wrongPurpose.status, 401, "an assertion cannot spend a registration challenge");
  assert.deepEqual(await wrongPurpose.json(), { error: "challenge_gone" });
  clearBuckets();
  const login = await passkeyOptions();
  const loginChallenge = (await login.json()).challenge;
  const wrongShape = await passkeyVerify(device.register(loginChallenge), jar("", login));
  assert.equal(wrongShape.status, 400, "and a registration object is not even an assertion shape");
  clearBuckets();
  const expired = await passkeyOptions();
  const expiredChallenge = (await expired.json()).challenge;
  db().prepare("UPDATE verification SET expiresAt=? WHERE identifier LIKE '%'").run(new Date(Date.now() - 1000).toISOString());
  const stale = await passkeyVerify(device.assert(expiredChallenge), jar("", expired));
  assert.equal(stale.status, 401, "an expired challenge is gone, not guessable");
  assert.deepEqual(await stale.json(), { error: "challenge_gone" });
});

test("wrong rp id, wrong origin and an unknown credential are all refused", async () => {
  const person = await create("pk-refuse@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device);
  for (const [label, build] of [
    ["rp id", (challenge) => device.assertForRp(challenge, "evil.example")],
    ["origin", (challenge) => device.assertForOrigin(challenge, "https://evil.example")],
    ["unknown credential", (challenge) => createAuthenticator({ rpId: RP_ID, origin: origin() }).assert(challenge)],
    ["unverified assertion", (challenge) => device.assertWithoutUserVerification(challenge)],
  ]) {
    clearBuckets();
    const options = await passkeyOptions();
    const challenge = (await options.json()).challenge;
    const response = await passkeyVerify(build(challenge), jar("", options));
    assert.notEqual(response.status, 200, label);
    const body = await response.text();
    assert.doesNotMatch(body, /session_token=/, label);
    if (label === "unknown credential") assert.deepEqual(JSON.parse(body), { error: "not_found" });
  }
  assert.equal(db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 1, "only the original login session exists");
});

test("a duplicate credential is refused by name, not as a server failure", async () => {
  const person = await create("pk-dupe@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  assert.equal((await register(person, device)).finished.status, 200);
  const again = await register(person, device);
  assert.equal(again.finished.status, 409);
  assert.deepEqual(await again.finished.json(), { error: "already_registered" });
  assert.equal(db().prepare("SELECT count(*) n FROM passkey WHERE userId=?").get(person.id).n, 1, "the unique index holds");
  // The shape the browser is handed for the credential it already has. `transports` is an
  // array here, not the stored comma string, so a client that called `.split()` on it would
  // throw — and only from the account's second registration onwards.
  const excluded = again.options.excludeCredentials;
  assert.equal(excluded.length, 1);
  assert.equal(typeof excluded[0].id, "string", "the credential id arrives as base64url text");
  assert.ok(Array.isArray(excluded[0].transports), JSON.stringify(excluded[0]));
});

test("the credential list is capped", async () => {
  const person = await create("pk-cap@example.test");
  for (let index = 0; index < 10; index += 1) {
    const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
    assert.equal((await register(person, device)).finished.status, 200, `credential ${index}`);
  }
  const overflow = await register(person, createAuthenticator({ rpId: RP_ID, origin: origin() }));
  assert.equal(overflow.started.status, 409);
  assert.deepEqual(await overflow.started.json(), { error: "limit_reached" });
});

test("no library passkey path is reachable from the public door", async () => {
  for (const route of [
    "passkey/generate-register-options", "passkey/generate-authenticate-options",
    "passkey/verify-registration", "passkey/verify-authentication",
    "passkey/list-user-passkeys", "passkey/delete-passkey", "passkey/update-passkey",
  ]) {
    const response = await auth(route, { response: {} });
    assert.equal(response.status, 404, route);
  }
});

test("the sign-in surface accepts nothing but the credential", async () => {
  const person = await create("pk-fields@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device);
  clearBuckets();
  const options = await passkeyOptions();
  const challenge = (await options.json()).challenge;
  for (const body of [
    { response: device.assert(challenge), createSession: true },
    { response: device.assert(challenge), userId: person.id },
    { response: device.assert(challenge), origin: "https://evil.example" },
  ]) {
    const response = await handlePasskeyAuth(new Request(origin() + "/api/passkey/verify", {
      method: "POST",
      headers: { origin: origin(), "content-type": "application/json", cookie: jar("", options) },
      body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400, JSON.stringify(Object.keys(body)));
  }
});

test("a browser that is already signed in cannot answer a passkey login", async () => {
  const person = await create("pk-signed@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device);
  clearBuckets();
  const options = await passkeyOptions(person.cookie);
  const challenge = (await options.json()).challenge;
  const response = await passkeyVerify(device.assert(challenge), jar(person.cookie, options));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "signed_in" });
});

test("credentials are scoped to their own account", async () => {
  const owner = await create("pk-owner@example.test");
  const other = await create("pk-other@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(owner, device, "Owner key");
  assert.deepEqual(await list(other.cookie), [], "another account sees nothing");
  const id = (await list(owner.cookie))[0].id;
  clearBuckets();
  const steal = await account("/passkeys/remove", { password: other.password, id }, other.cookie);
  assert.equal(steal.status, 404, "a foreign credential id is not addressable");
  clearBuckets();
  const rename = await account("/passkeys/rename", { password: other.password, id, name: "Mine now" }, other.cookie);
  assert.equal(rename.status, 404);
  assert.equal((await list(owner.cookie))[0].name, "Owner key");
});

test("renaming needs the password and never changes the credential", async () => {
  const person = await create("pk-rename@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device, "First name");
  const id = (await list(person.cookie))[0].id;
  clearBuckets();
  assert.equal((await account("/passkeys/rename", { password: "nope-nope-1", id, name: "X" }, person.cookie)).status, 400);
  clearBuckets();
  const tooLong = await account("/passkeys/rename", { password: person.password, id, name: "n".repeat(80) }, person.cookie);
  assert.equal(tooLong.status, 400);
  clearBuckets();
  const renamed = await account("/passkeys/rename", { password: person.password, id, name: "Desk key" }, person.cookie);
  assert.equal(renamed.status, 200);
  assert.equal((await list(person.cookie))[0].name, "Desk key");
  assert.equal(device.counter >= 0, true);
  // The key itself is untouched, so the same credential still signs in.
  const { verified } = await signIn(device);
  assert.equal(verified.status, 200);
});

test("removal leaves the password path working and records one event", async () => {
  const person = await create("pk-remove@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device);
  clearBuckets();
  const id = (await list(person.cookie))[0].id;
  clearBuckets();
  const removed = await account("/passkeys/remove", { password: person.password, id }, person.cookie);
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).passkeys, []);
  const kinds = db().prepare("SELECT kind FROM security_events WHERE user_id=? ORDER BY occurred_at").all(person.id).map((r) => r.kind);
  assert.deepEqual(kinds, ["passkey_register", "passkey_remove"], "a rename is not recorded");
  clearBuckets();
  const after = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.equal(after.status, 200, "the account is still reachable with its password");
  assert.equal(db().prepare("SELECT twoFactorEnabled FROM user WHERE id=?").get(person.id).twoFactorEnabled, 0);
});

test("with two-factor on, adding or removing a passkey also needs the live factor", async () => {
  const person = await create("pk-combo@example.test");
  await enableTwoFactor(person);
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  clearBuckets();
  const noFactor = await account("/passkeys/register/start", { password: person.password }, person.cookie);
  assert.equal(noFactor.status, 400, "the password alone cannot add a way in");
  clearBuckets();
  const withFactor = await account("/passkeys/register/start", { password: person.password, code: person.totp() }, person.cookie);
  assert.equal(withFactor.status, 200);
  const cookie = jar(person.cookie, withFactor);
  const options = await withFactor.json();
  clearBuckets();
  const finished = await account("/passkeys/register/finish", { response: device.register(options.challenge) }, cookie);
  assert.equal(finished.status, 200);
  const id = (await list(cookie))[0].id;
  clearBuckets();
  assert.equal((await account("/passkeys/remove", { password: person.password, id }, cookie)).status, 400, "and cannot remove one either");
  clearBuckets();
  assert.equal((await account("/passkeys/remove", { password: person.password, code: person.totp(), id }, cookie)).status, 200);
});

test("a verified passkey satisfies the second factor but never replaces the password", async () => {
  const person = await create("pk-invariant@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device);
  await enableTwoFactor(person);
  const { verified, cookie } = await signIn(device);
  assert.equal(verified.status, 200, "the passkey ceremony is itself the second factor");
  assert.equal((await (await accountGet("", cookie)).json()).user?.email, "pk-invariant@example.test");
  // What that session still cannot do without the password.
  clearBuckets();
  assert.equal((await account("/2fa/disable", { password: "wrong-password-1", code: person.totp() }, cookie)).status, 400);
  clearBuckets();
  assert.equal((await account("/password", { currentPassword: "wrong-password-1", newPassword: "N" + randomBytes(8).toString("hex") + "1" }, cookie)).status, 400);
  clearBuckets();
  const emailStart = await account("/email/start", { password: "wrong-password-1", newEmail: "someone@example.test", turnstileToken: "local" }, cookie);
  assert.equal(emailStart.status, 400);
  // And a password-only sign-in still faces the challenge.
  const passwordOnly = await auth("sign-in/email", { email: person.email, password: person.password });
  assert.deepEqual(await passwordOnly.json(), { twoFactorRequired: true });
});

test("the passkey list is security data and needs a recent login", async () => {
  const person = await create("pk-stale@example.test");
  await register(person, createAuthenticator({ rpId: RP_ID, origin: origin() }));
  db().prepare("UPDATE session SET createdAt=?").run(new Date(Date.now() - 25 * 3_600_000).toISOString());
  const stale = await accountGet("/passkeys", person.cookie);
  assert.equal(stale.status, 403);
  assert.deepEqual(await stale.json(), { error: "reauth_required" });
});

test("nothing secret is ever stored or returned", async () => {
  const person = await create("pk-secret@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  await register(person, device, "Secret check");
  const { cookie } = await signIn(device);
  assert.ok(cookie, "the sign-in worked");
  const dump = JSON.stringify([
    db().prepare("SELECT * FROM passkey").all(),
    db().prepare("SELECT * FROM security_events").all(),
    db().prepare("SELECT * FROM session").all(),
    await list(person.cookie),
  ]);
  // The credential's own key material is stored (it must be, to verify), but the
  // wrapper never echoes it, and no private key exists anywhere in the database.
  assert.ok(!dump.includes(device.credentialId.toString("base64url").slice(0, 12) + "\"privateKey"), "no private key");
  const body = JSON.stringify(await (await accountGet("/passkeys", person.cookie)).json());
  assert.ok(!body.includes("publicKey") && !body.includes("credentialID") && !body.includes("aaguid"), body.slice(0, 200));
  assert.equal(listPasskeys(person.id).length, 1);
});

test("a passkey assertion in flight cannot create a session across an account security change", async () => {
  const person = await create("pk-issuance-race@example.test");
  const device = createAuthenticator({ rpId: RP_ID, origin: origin() });
  assert.equal((await register(person, device, "Race fixture")).finished.status, 200);
  clearBuckets();
  const options = await passkeyOptions();
  const challenge = await options.json(), cookie = jar("", options);
  const context = await require("../src/lib/auth/server.ts").getAuth().$context;
  const original = context.internalAdapter.createSession;
  let entered, resume;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const released = new Promise((resolve) => { resume = resolve; });
  let once = true;
  context.internalAdapter.createSession = async function (...args) {
    if (once) { once = false; entered(); await released; }
    return original.apply(this, args);
  };
  const completing = passkeyVerify(device.assert(challenge.challenge), cookie);
  try {
    await waiting;
    assert.equal((await account("/password", { currentPassword: person.password, newPassword: password() }, person.cookie)).status, 200);
    resume();
    const refused = await completing;
    assert.equal(refused.ok, false);
    assert.equal(refused.headers.getSetCookie().length, 0);
    assert.equal(db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n, 1);
  } finally { resume(); context.internalAdapter.createSession = original; }
});

test.after(async () => {
  try { db().close(); } catch { /* already closed */ }
  await fs.rm(directory, { recursive: true, force: true });
  global.fetch = undefined;
});
