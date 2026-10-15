/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), fsp = require("node:fs/promises"), path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");

const directory = path.join(process.cwd(), "data", "deletion-test-" + randomUUID());
Object.assign(process.env, {
  DATABASE_PATH: path.join(directory, "utils.sqlite"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  APP_URL: "http://localhost:3000",
  BREVO_API_KEY: "unit-fixture", MAIL_FROM: "noreply@example.test",
  TURNSTILE_SITE_KEY: "unit-fixture", TURNSTILE_SECRET_KEY: "unit-fixture",
  AI_ENABLED: "0",
});
const DAY = 86_400_000;

const database = require("../scripts/database.cjs");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { handleAccount } = require("../src/lib/auth/account-handler.ts");
const { handleTwoFactor } = require("../src/lib/auth/two-factor-handler.ts");
const { accountErrorKey } = require("../src/lib/auth/errors.ts");
const { reserveQuery, releaseQuery, stopOwnerQuery } = require("../src/lib/agent/active-query.ts");
const { blockOwnerQueries } = require("../src/lib/agent/active-query.ts");
const deletion = require("../src/lib/auth/deletion.cjs");

const mail = [];
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify")) return Response.json({ success: true, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    const body = JSON.parse(options.body);
    mail.push({
      email: body.to[0].email,
      purpose: /Reset password/.test(body.subject) ? "forget-password" : "email-verification",
      code: body.textContent.match(/(\d{6})/)?.[0] ?? null,
    });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external request");
};

const db = () => database.getDatabase();
const origin = () => process.env.APP_URL;
const secret = () => "Q" + randomBytes(10).toString("hex") + "7";

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
const exportFull = (cookie) => accountGet("/export?format=json", cookie);
const exportOne = (cookie, conversation) => accountGet("/export?format=json&conversation=" + conversation, cookie);

async function create(email) {
  const person = { email, password: secret() };
  assert.equal((await auth("sign-up/email", { ...person, name: "Owner", turnstileToken: "local" })).status, 200);
  assert.equal((await auth("email-otp/verify-email", { email, otp: mail.filter((m) => m.email === email).at(-1).code })).status, 200);
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
/** Chat history in the shape the app writes, so a deletion has something real to remove. */
function seed(person, { title = "A conversation", messages = 2, usage = 1, sdkSessionId = null } = {}) {
  const id = randomUUID(), at = Date.now(), turn = randomUUID();
  db().transaction(() => {
    db().prepare("INSERT INTO conversations (id,owner_user_id,revision,needs_rebuild,updated_at,sdk_session_id) VALUES (?,?,?,0,?,?)")
      .run(id, person.id, "release-abc", at, sdkSessionId);
    db().prepare("INSERT INTO conversation_meta (conversation_id,title,archived_at) VALUES (?,?,NULL)").run(id, title);
    for (let position = 0; position < messages; position += 1) db().prepare(
      "INSERT INTO messages (id,conversation_id,position,turn_id,role,content,at,status,error,revision,context_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(randomUUID(), id, position, turn, position ? "assistant" : "user", "Content " + position, at, "complete", null, "release-abc", null);
    for (let index = 0; index < usage; index += 1) db().prepare(
      "INSERT INTO ai_usage (id,user_id,turn_id,created_at,status,usage_json) VALUES (?,?,?,?,?,NULL)",
    ).run(randomUUID(), person.id, turn, at, "complete");
  }).immediate();
  return id;
}
/** Moves an open request past a boundary without waiting for one. */
function age(person, { eligibleAt, expiresAt }) {
  db().prepare("UPDATE account_deletions SET eligible_at=COALESCE(?,eligible_at), expires_at=COALESCE(?,expires_at) WHERE user_id=?")
    .run(eligibleAt ?? null, expiresAt ?? null, person.id);
}
const rowsFor = (person) => ({
  user: db().prepare("SELECT count(*) n FROM user WHERE id=?").get(person.id).n,
  account: db().prepare("SELECT count(*) n FROM account WHERE userId=?").get(person.id).n,
  session: db().prepare("SELECT count(*) n FROM session WHERE userId=?").get(person.id).n,
  conversations: db().prepare("SELECT count(*) n FROM conversations WHERE owner_user_id=?").get(person.id).n,
  messages: db().prepare("SELECT count(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.owner_user_id=?").get(person.id).n,
  usage: db().prepare("SELECT count(*) n FROM ai_usage WHERE user_id=?").get(person.id).n,
  preferences: db().prepare("SELECT count(*) n FROM user_preferences WHERE user_id=?").get(person.id).n,
  events: db().prepare("SELECT count(*) n FROM security_events WHERE user_id=?").get(person.id).n,
});
const signedIn = async (person) => (await (await accountGet("", person.cookie)).json()).user?.email ?? null;
/** The full authorized path, with the boundaries moved rather than waited out. */
async function deletable(person) {
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password }, person.cookie)).status, 200);
  age(person, { eligibleAt: Date.now() - DAY });
  assert.equal((await exportFull(person.cookie)).status, 200);
}
const complete = (person, confirm = person.email) =>
  account("/deletion/complete", { password: person.password, confirm }, person.cookie);

test.before(async () => {
  await fsp.mkdir(directory, { recursive: true });
  (await database.migrate()).close();
});
test.beforeEach(clearBuckets);
test.after(async () => {
  try { db().close(); } catch { /* already closed */ }
  await fsp.rm(directory, { recursive: true, force: true });
  global.fetch = undefined;
});

test("the migration is additive and describes the state the contract names", async () => {
  const columns = db().prepare("PRAGMA table_info(account_deletions)").all().map((c) => c.name);
  assert.deepEqual(columns, ["user_id", "requested_at", "eligible_at", "expires_at", "exported_at"]);
  const person = await create("dl-schema@example.test");
  seed(person);
  assert.equal((await accountGet("/deletion", person.cookie)).status, 200);
  assert.deepEqual(await (await accountGet("/deletion", person.cookie)).json(), { deletion: { status: "none" } });
  assert.equal(await signedIn(person), person.email, "an account predating the table is untouched");
});

test("a request is a state, not a change: nothing is removed during the cooling-off", async () => {
  const person = await create("dl-pending@example.test");
  seed(person);
  await account("/preferences", { theme: "dark" }, person.cookie);
  clearBuckets();
  const response = await account("/deletion/request", { password: person.password }, person.cookie);
  assert.equal(response.status, 200);
  const state = (await response.json()).deletion;
  assert.equal(state.status, "pending");
  assert.equal(state.eligible, false, "the final step is not open yet");
  assert.equal(state.exportedAt, null);
  assert.equal(state.eligibleAt - state.requestedAt, 7 * DAY);
  assert.equal(state.expiresAt - state.eligibleAt, 30 * DAY);
  const after = rowsFor(person);
  assert.deepEqual(after, {
    user: 1, account: 1, session: 1, conversations: 1, messages: 2, usage: 1, preferences: 1, events: 0,
  });
  assert.equal(await signedIn(person), person.email, "the account is still fully itself");
  assert.deepEqual(db().prepare("SELECT kind FROM security_events WHERE user_id=?").all(person.id), [],
    "a reversible request is not a confirmed change of access and records nothing");
  clearBuckets();
  const twice = await account("/deletion/request", { password: person.password }, person.cookie);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "already_requested" });
});

test("requesting needs the current password, and the live factor when the account has one", async () => {
  const person = await create("dl-gates@example.test");
  clearBuckets();
  const wrong = await account("/deletion/request", { password: "not-the-password-1" }, person.cookie);
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { error: "password_wrong" });
  assert.deepEqual(await (await accountGet("/deletion", person.cookie)).json(), { deletion: { status: "none" } });

  const { createHmac } = require("node:crypto");
  const { symmetricDecrypt } = await import("better-auth/crypto");
  clearBuckets();
  const issued = await account("/2fa/enable", { password: person.password }, person.cookie);
  assert.equal(issued.status, 200);
  const recoveryCodes = (await issued.json()).backupCodes;
  const stored = db().prepare("SELECT secret FROM twoFactor WHERE userId=?").get(person.id).secret;
  const key = await symmetricDecrypt({ key: process.env.BETTER_AUTH_SECRET, data: stored });
  const totp = () => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
    const hmac = createHmac("sha1", key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const value = ((hmac[offset] & 127) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 10 ** 6;
    return String(value).padStart(6, "0");
  };
  clearBuckets();
  assert.equal((await account("/2fa/confirm", { code: totp() }, person.cookie)).status, 200);
  person.cookie = null;
  const challenged = await auth("sign-in/email", { email: person.email, password: person.password });
  const challengeCookie = jar("", challenged);
  clearBuckets();
  const answered = await handleTwoFactor(new Request(origin() + "/api/2fa/verify", {
    method: "POST",
    headers: { origin: origin(), "content-type": "application/json", cookie: challengeCookie },
    body: JSON.stringify({ code: totp() }),
  }));
  person.cookie = jar(challengeCookie, answered);

  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password }, person.cookie)).status, 400,
    "the factor is not optional once the account has one");
  clearBuckets();
  const bad = await account("/deletion/request", { password: person.password, code: "000000" }, person.cookie);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "code_failed" });
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password, code: totp() }, person.cookie)).status, 200);
  assert.equal(deletion.readDeletion(db(), person.id).status, "pending");
  age(person, { eligibleAt: Date.now() - DAY });
  clearBuckets();
  const missingFactor = await account("/deletion/complete", {
    password: person.password, confirm: person.email, skipExport: true,
  }, person.cookie);
  assert.equal(missingFactor.status, 400, "skipping export does not skip the factor");
  clearBuckets();
  assert.equal((await account("/deletion/complete", {
    password: person.password, code: recoveryCodes[0], confirm: person.email, skipExport: true,
  }, person.cookie)).status, 200, "an unused recovery code is a valid final-step factor");
});

test("the final step waits for the cooling-off and for a whole-account export", async () => {
  const person = await create("dl-preconditions@example.test");
  const conversation = seed(person);
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password }, person.cookie)).status, 200);
  clearBuckets();
  const tooEarly = await complete(person);
  assert.equal(tooEarly.status, 409);
  assert.deepEqual(await tooEarly.json(), { error: "cooling_off" });

  age(person, { eligibleAt: Date.now() - DAY });
  clearBuckets();
  const noExport = await complete(person);
  assert.equal(noExport.status, 409);
  assert.deepEqual(await noExport.json(), { error: "export_required" });
  assert.equal(rowsFor(person).conversations, 1, "a refusal deletes nothing");

  clearBuckets();
  assert.equal((await exportOne(person.cookie, conversation)).status, 200);
  clearBuckets();
  assert.equal((await complete(person)).status, 409, "a narrowed export is not the copy of the account");
  assert.equal(deletion.readDeletion(db(), person.id).exportedAt, null);

  clearBuckets();
  assert.equal((await exportFull(person.cookie)).status, 200);
  assert.ok(deletion.readDeletion(db(), person.id).exportedAt, "the whole-account export stamped the request");
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  assert.equal(rowsFor(person).user, 0);
});

test("a large account may explicitly waive export without bypassing other deletion gates", async () => {
  const person = await create("dl-large@example.test");
  for (let index = 0; index < 201; index++) seed(person, { messages: 1, usage: 0 });
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password }, person.cookie)).status, 200);
  const payload = { password: person.password, confirm: person.email, skipExport: true };
  clearBuckets();
  assert.equal((await account("/deletion/complete", payload, person.cookie)).status, 409,
    "the cooling-off period is still required");
  age(person, { eligibleAt: Date.now() - DAY });
  assert.equal((await exportFull(person.cookie)).status, 413);
  const first = db().prepare("SELECT id FROM conversations WHERE owner_user_id=? LIMIT 1").get(person.id).id;
  assert.equal((await exportOne(person.cookie, first)).status, 200);
  assert.equal(deletion.readDeletion(db(), person.id).exportedAt, null,
    "a segment is never marked as a complete copy");
  clearBuckets();
  assert.deepEqual(await (await complete(person)).json(), { error: "export_required" });
  for (const skipExport of [false, "true", 1]) {
    clearBuckets();
    assert.equal((await account("/deletion/complete", { ...payload, skipExport }, person.cookie)).status,
      skipExport === false ? 409 : 400, "only the explicit boolean acknowledges the choice");
  }
  clearBuckets();
  assert.equal((await account("/deletion/complete", { ...payload, confirm: "other@example.test" }, person.cookie)).status, 400);
  clearBuckets();
  assert.equal((await account("/deletion/complete", { ...payload, password: secret() }, person.cookie)).status, 400);
  assert.equal(rowsFor(person).conversations, 201, "every refusal keeps the data");
  clearBuckets();
  assert.equal((await account("/deletion/complete", payload, person.cookie)).status, 200);
  assert.equal(rowsFor(person).user, 0);
  assert.deepEqual(db().prepare("PRAGMA foreign_key_check").all(), []);
});

test("the typed confirmation is checked against the server's own address, case aside", async () => {
  const person = await create("dl-confirm@example.test");
  await deletable(person);
  clearBuckets();
  const mismatch = await complete(person, "someone-else@example.test");
  assert.equal(mismatch.status, 400);
  assert.deepEqual(await mismatch.json(), { error: "confirm_mismatch" });
  assert.equal(rowsFor(person).user, 1);
  clearBuckets();
  assert.equal((await complete(person, person.email.toUpperCase())).status, 200,
    "the address is the person's own, so a case difference is not a different account");
  assert.equal(rowsFor(person).user, 0);
});

test("a completed deletion leaves no row behind and no dangling reference", async () => {
  const person = await create("dl-complete@example.test");
  seed(person);
  await account("/preferences", { theme: "light" }, person.cookie);
  await deletable(person);
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  assert.deepEqual(rowsFor(person), {
    user: 0, account: 0, session: 0, conversations: 0, messages: 0, usage: 0, preferences: 0, events: 0,
  });
  assert.equal(db().prepare("SELECT count(*) n FROM account_deletions WHERE user_id=?").get(person.id).n, 0);
  assert.deepEqual(db().prepare("PRAGMA foreign_key_check").all(), [], "no orphan anywhere in the database");
  assert.deepEqual(await (await accountGet("", person.cookie)).json(), { user: null }, "the cookie authorizes nothing");
  assert.equal(await signedIn(person), null);
});

test("the address is not left behind where it was stored in the clear or by digest", async () => {
  const person = await create("dl-address@example.test");
  assert.ok(mail.some((m) => m.email === person.email && m.purpose === "forget-password") === false);
  // A reset request puts `<purpose>-otp-<email>` into `verification` for this address.
  clearBuckets();
  assert.equal((await auth("email-otp/request-password-reset", { email: person.email, turnstileToken: "local" })).status, 200);
  const hash = require("../src/lib/auth/keying.cjs").privateKey(person.email);
  assert.ok(db().prepare("SELECT count(*) n FROM verification WHERE identifier LIKE ?").get("%-otp-" + person.email).n > 0);
  db().prepare("INSERT INTO mail_requests (id,email_hash,purpose,created_at,status,provider_id) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), hash, "forget-password", Date.now(), "accepted", "provider-1");
  const mailRows = db().prepare("SELECT count(*) n FROM mail_requests").get().n;

  await deletable(person);
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  assert.equal(db().prepare("SELECT count(*) n FROM verification WHERE identifier LIKE ?").get("%-otp-" + person.email).n, 0,
    "the plaintext address must not outlive the account");
  assert.equal(db().prepare("SELECT count(*) n FROM verification WHERE value=? OR json_extract(value,'$.userData.id')=?").get(person.id, person.id).n, 0);
  assert.equal(db().prepare("SELECT count(*) n FROM mail_requests WHERE email_hash=?").get(hash).n, 0,
    "the digest no longer points at anybody");
  assert.equal(db().prepare("SELECT count(*) n FROM mail_requests").get().n, mailRows,
    "but the rows stay, so the site's own daily mail budget keeps counting what it sent");
  assert.equal(db().prepare("SELECT email_hash FROM mail_requests WHERE purpose='forget-password' ORDER BY created_at DESC LIMIT 1").get().email_hash,
    deletion.DELETED_MAIL_HASH);
});

test("two accounts keep their data apart when one of them goes", async () => {
  const leaving = await create("dl-leaving@example.test");
  const staying = await create("dl-staying@example.test");
  const mine = seed(leaving, { title: "Mine" });
  const theirs = seed(staying, { title: "Theirs" });
  await account("/preferences", { theme: "dark" }, staying.cookie);
  await deletable(leaving);
  clearBuckets();
  assert.equal((await complete(leaving)).status, 200);
  assert.deepEqual(rowsFor(staying), {
    user: 1, account: 1, session: 1, conversations: 1, messages: 2, usage: 1, preferences: 1, events: 0,
  });
  assert.equal(db().prepare("SELECT id FROM conversations WHERE owner_user_id=?").get(staying.id).id, theirs,
    "only the leaving account's rows went");
  assert.notEqual(mine, theirs);
  assert.equal(await signedIn(staying), staying.email, "the other account's login is unaffected");
  assert.equal((await accountGet("/deletion", staying.cookie)).status, 200);
  assert.deepEqual(await (await accountGet("/deletion", staying.cookie)).json(), { deletion: { status: "none" } });
});

test("deletion and startup preserve other accounts' non-JSON verification rows", async () => {
  const leaving = await create("dl_otp@example.test");
  const staying = await create("dlxotp@example.test");
  for (const person of [leaving, staying]) {
    clearBuckets();
    assert.equal((await auth("email-otp/request-password-reset", {
      email: person.email, turnstileToken: "local",
    })).status, 200);
  }
  const verification = db().prepare("SELECT * FROM verification WHERE identifier=?")
    .get("forget-password-otp-" + staying.email);
  assert.equal(db().prepare("SELECT json_valid(?) valid").get(verification.value).valid, 0,
    "the real library stores OTP digests as plain text");
  const add = db().prepare("INSERT INTO verification VALUES (?,?,?,?,?,?)");
  const now = new Date().toISOString(), expires = new Date(Date.now() + DAY).toISOString();
  add.run(randomUUID(), "review-factor", staying.id, expires, now, now);
  add.run(randomUUID(), "review-own-passkey", JSON.stringify({ userData: { id: leaving.id } }), expires, now, now);
  add.run(randomUUID(), "review-other-passkey", JSON.stringify({ userData: { id: staying.id } }), expires, now, now);
  const otherRows = db().prepare("SELECT * FROM verification WHERE identifier NOT IN (?,?) ORDER BY identifier")
    .all("forget-password-otp-" + leaving.email, "review-own-passkey");
  await deletable(leaving);
  clearBuckets();
  assert.equal((await complete(leaving)).status, 200);
  assert.deepEqual(db().prepare("SELECT * FROM verification ORDER BY identifier").all(), otherRows,
    "neither non-JSON values nor an underscore in the deleted email may widen the removal");
  const restarted = await database.migrate();
  restarted.close();
  assert.equal(rowsFor(staying).user, 1, "startup reconciliation still serves the other identity");
  db().prepare("DELETE FROM verification WHERE identifier IN (?,?,?)")
    .run(verification.identifier, "review-factor", "review-other-passkey");
});

test("a withdrawal restores nothing, because the cooling-off took nothing away", async () => {
  const person = await create("dl-withdraw@example.test");
  seed(person);
  await deletable(person);
  const before = rowsFor(person);
  clearBuckets();
  const response = await account("/deletion/withdraw", { password: person.password }, person.cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { withdrawn: true, deletion: { status: "none" } });
  assert.deepEqual(rowsFor(person), before);
  assert.equal(await signedIn(person), person.email);
  clearBuckets();
  assert.equal((await account("/deletion/withdraw", { password: person.password }, person.cookie)).status, 409);
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: person.password }, person.cookie)).status, 200,
    "and the person can ask again from scratch");
});

test("an unclaimed request lapses back to no request and never fires", async () => {
  const person = await create("dl-lapse@example.test");
  seed(person);
  await deletable(person);
  age(person, { expiresAt: Date.now() - 1 });
  assert.deepEqual(await (await accountGet("/deletion", person.cookie)).json(), { deletion: { status: "none" } });
  assert.equal(db().prepare("SELECT count(*) n FROM account_deletions WHERE user_id=?").get(person.id).n, 0,
    "the lapsed row is healed on read");
  assert.equal(rowsFor(person).conversations, 1, "lapsing is not deleting");
  assert.equal(await signedIn(person), person.email);
  clearBuckets();
  assert.equal((await complete(person)).status, 409, "there is nothing left to complete");
});

test("overlapping administrator deletions retain one administrator and no refused intent", async () => {
  const first = await create("dl-race-admin1@example.test");
  const second = await create("dl-race-admin2@example.test");
  db().prepare("UPDATE user SET role='admin' WHERE id IN (?,?)").run(first.id, second.id);
  try {
    await deletable(first);
    await deletable(second);
    clearBuckets();
    const query = { owner: first.id, turn: randomUUID(), abort: new AbortController() };
    assert.equal(reserveQuery(query), true);
    const stopping = new Promise((resolve) => query.abort.signal.addEventListener("abort", resolve, { once: true }));
    const waiting = complete(first);
    await stopping;
    let finished;
    try { finished = await complete(second); }
    finally { releaseQuery(query); }
    assert.equal(finished.status, 200);
    const refused = await waiting;
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), { error: "last_admin" });
    assert.equal(deletion.administratorCount(db()), 1);
    assert.equal(rowsFor(first).user, 1);
    assert.ok(!deletion.readIntents().some((intent) => intent.userId === first.id),
      "a refused removal cannot silently execute at the next startup");
    const restarted = await database.migrate();
    restarted.close();
    assert.equal(rowsFor(first).user, 1);
  } finally {
    db().prepare("UPDATE user SET role='user' WHERE id IN (?,?)").run(first.id, second.id);
  }
});

test("the last administrator cannot delete the account that keeps /admin reachable", async () => {
  const solo = await create("dl-solo-admin@example.test");
  db().prepare("UPDATE user SET role='admin' WHERE id=?").run(solo.id);
  clearBuckets();
  const refused = await account("/deletion/request", { password: solo.password }, solo.cookie);
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "last_admin" });
  assert.equal(accountErrorKey("last_admin", "deletion"), "deletionLastAdmin");
  assert.equal(db().prepare("SELECT count(*) n FROM account_deletions WHERE user_id=?").get(solo.id).n, 0);

  const second = await create("dl-second-admin@example.test");
  db().prepare("UPDATE user SET role='admin' WHERE id=?").run(second.id);
  clearBuckets();
  assert.equal((await account("/deletion/request", { password: solo.password }, solo.cookie)).status, 200,
    "once another verified active administrator exists, self-service is allowed again");
  age(solo, { eligibleAt: Date.now() - DAY });
  assert.equal((await exportFull(solo.cookie)).status, 200);
  clearBuckets();
  assert.equal((await complete(solo)).status, 200);
  assert.equal(db().prepare("SELECT count(*) n FROM user WHERE role='admin'").get().n, 1);
});

test("a stale login cannot complete a deletion, and neither can another account's cookie", async () => {
  const person = await create("dl-stale@example.test");
  const other = await create("dl-other@example.test");
  seed(person);
  await deletable(person);
  clearBuckets();
  const borrowed = await complete(other);
  assert.equal(borrowed.status, 409);
  assert.deepEqual(await borrowed.json(), { error: "not_requested" },
    "the caller's own account has no open request, and no body field can name somebody else's");
  assert.equal(rowsFor(person).user, 1);

  db().prepare("UPDATE session SET createdAt=?").run(new Date(Date.now() - 25 * 3_600_000).toISOString());
  clearBuckets();
  const stale = await complete(person);
  assert.equal(stale.status, 403);
  assert.deepEqual(await stale.json(), { error: "reauth_required" });
  assert.equal(rowsFor(person).user, 1, "a login that has gone stale is not consent");

  person.cookie = jar("", await auth("sign-in/email", { email: person.email, password: person.password }));
  clearBuckets();
  assert.equal((await complete(person)).status, 200, "a fresh login from the same person completes it");
  assert.equal(rowsFor(person).user, 0);
});

test("an answer whose cancellation cannot be confirmed stops the deletion instead of racing it", async () => {
  const person = await create("dl-busy@example.test");
  seed(person);
  await deletable(person);
  const query = { owner: person.id, turn: randomUUID(), abort: new AbortController() };
  assert.equal(reserveQuery(query), true);
  assert.equal(await stopOwnerQuery(person.id, 5), false, "an answer that will not release is exactly the case");
  const original = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) => original(fn, delay === 30_000 ? 5 : delay, ...args);
  try {
    clearBuckets();
    const blocked = await complete(person);
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: "stop_unconfirmed" });
    assert.equal(rowsFor(person).user, 1, "the account is not reported as deleted and is not deleted");
  } finally {
    global.setTimeout = original;
    releaseQuery(query);
  }
  clearBuckets();
  assert.equal((await complete(person)).status, 200, "once the answer is really finished, the deletion proceeds");
  assert.equal(rowsFor(person).user, 0);
});

test("a concurrent security change on the same account answers busy, and the request is not duplicated", async () => {
  const person = await create("dl-concurrent@example.test");
  seed(person);
  await deletable(person);
  const release = blockOwnerQueries(person.id);
  try {
    clearBuckets();
    const busy = await complete(person);
    assert.equal(busy.status, 409);
    assert.deepEqual(await busy.json(), { error: "account_busy" });
    assert.equal(rowsFor(person).user, 1);
  } finally { release(); }
  clearBuckets();
  const twice = await account("/deletion/request", { password: person.password }, person.cookie);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "already_requested" });
  assert.equal(db().prepare("SELECT count(*) n FROM account_deletions WHERE user_id=?").get(person.id).n, 1);
});

test("the deletion is re-entrant: completing it twice cannot delete a second identity", async () => {
  const person = await create("dl-again@example.test");
  const neighbour = await create("dl-neighbour@example.test");
  seed(person);
  seed(neighbour);
  await deletable(person);
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  assert.equal(deletion.executeDeletion(db(), person.id).deleted, false, "a repeat finds nothing to remove");
  assert.equal(rowsFor(neighbour).user, 1, "a repeat of somebody else's deletion cannot reach a second identity");
  assert.equal(deletion.executeDeletion(db(), neighbour.id).deleted, true,
    "the routine acts only on the identity it is explicitly handed");
  assert.equal(rowsFor(neighbour).user, 0);
  assert.deepEqual(db().prepare("PRAGMA foreign_key_check").all(), []);
});

test("the durable intent keeps a restored database from resurrecting a deleted identity", async () => {
  const person = await create("dl-restore@example.test");
  const keeper = await create("dl-keeper@example.test");
  seed(person);
  seed(keeper);
  const snapshot = path.join(directory, "before-deletion.sqlite");
  await db().backup(snapshot);

  await deletable(person);
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  assert.ok(fs.existsSync(deletion.intentPath()), "the intent outlives the database it guards");
  const intent = deletion.readIntents().filter((item) => item.userId === person.id).at(-1);
  assert.ok(intent, "exactly this identity is on record");
  assert.ok(!JSON.stringify(deletion.readIntents()).includes(person.email), "the record holds a digest, never the address");

  // Roll the database back to the copy taken before the deletion, then run the same
  // startup step the real server runs before it serves a request.
  const restored = database.open(snapshot);
  assert.equal(restored.prepare("SELECT count(*) n FROM user WHERE id=?").get(person.id).n, 1,
    "the restore did resurrect the identity");
  const repaired = deletion.reconcileDeletions(restored);
  assert.deepEqual(repaired.map((item) => item.userId), [person.id]);
  assert.equal(restored.prepare("SELECT count(*) n FROM user WHERE id=?").get(person.id).n, 0);
  assert.equal(restored.prepare("SELECT count(*) n FROM user WHERE id=?").get(keeper.id).n, 1,
    "and the account that was never deleted is left exactly as it was");
  assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
  restored.close();

  // A new registration on the same address is a different identity and stays untouched.
  const again = await create("dl-restore@example.test");
  seed(again);
  deletion.reconcileDeletions(db());
  assert.equal(rowsFor(again).user, 1, "the guard matches the id, which is never reused");
});

test("nothing secret or personal survives in the tables a deletion is supposed to clear", async () => {
  const person = await create("dl-clean@example.test");
  seed(person, { messages: 3 });
  await deletable(person);
  clearBuckets();
  assert.equal((await complete(person)).status, 200);
  const dump = JSON.stringify([
    db().prepare("SELECT * FROM user").all(),
    db().prepare("SELECT * FROM conversations").all(),
    db().prepare("SELECT * FROM messages").all(),
    db().prepare("SELECT * FROM ai_usage").all(),
    db().prepare("SELECT * FROM verification").all(),
    db().prepare("SELECT * FROM account_deletions").all(),
    fs.readFileSync(deletion.intentPath(), "utf8"),
  ]);
  assert.ok(!dump.includes("dl-clean@example.test"), "the address appears nowhere after the deletion");
  assert.ok(!dump.includes(person.id.slice(0, 8) + "\"password"), "no credential material is retained");
});

test("each refusal reads as its own fact and never as a wrong password", () => {
  for (const [code, key] of [
    ["already_requested", "deletionAlreadyOpen"],
    ["not_requested", "deletionNoneOpen"],
    ["cooling_off", "deletionTooEarly"],
    ["export_required", "deletionExportNeeded"],
    ["last_admin", "deletionLastAdmin"],
    ["confirm_mismatch", "deletionConfirmMismatch"],
    ["password_wrong", "deletionPasswordWrong"],
    ["code_failed", "factorCodeWrong"],
    ["locked", "factorLocked"],
    ["stop_unconfirmed", "securityFailed"],
    ["account_busy", "securityFailed"],
    ["unauthorized", "sessionExpired"],
  ]) assert.equal(accountErrorKey(code, "deletion"), key, code);
});
