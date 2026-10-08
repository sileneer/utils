/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const directory = path.join(process.cwd(), "data", "auth-test-" + randomUUID());
process.env.DATABASE_PATH = path.join(directory, "utils.sqlite");
process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
process.env.BREVO_API_KEY = "unit-test-placeholder";
process.env.MAIL_FROM = "noreply@example.test";
process.env.TURNSTILE_SITE_KEY = "unit-test-placeholder";
process.env.TURNSTILE_SECRET_KEY = "unit-test-placeholder";
process.env.APP_URL = "http://localhost:3000";
const database = require("../scripts/database.cjs");
const { handleAuth } = require("../src/lib/auth/handler.ts");
const { getAuth } = require("../src/lib/auth/server.ts");
const { consumeLimits } = require("../src/lib/auth/limits.ts");
const { reserveUsage, finishUsage } = require("../src/lib/agent/usage.ts");
let deliveries = [],
  failMail = false,
  challengeOK = true;
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).includes("siteverify"))
    return Response.json({ success: challengeOK, hostname: "localhost" });
  if (String(url).includes("api.brevo.com")) {
    if (failMail) return Response.json({}, { status: 503 });
    const data = JSON.parse(options.body);
    deliveries.push({
      email: data.to[0].email,
      code: data.textContent.match(/Verification code: (\d{6})/)[1],
    });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  throw new Error("Unexpected external call in auth tests");
};
test.before(async () => {
  const db = await database.migrate();
  db.close();
});
function post(route, body = {}, cookie, origin = process.env.APP_URL) {
  return handleAuth(
    new Request(process.env.APP_URL + "/api/auth/" + route, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
function resetLimits() {
  database.getDatabase().prepare("DELETE FROM limits").run();
  database.getDatabase().prepare("DELETE FROM rateLimit").run();
}
function code(email) {
  return deliveries.filter((d) => d.email === email).at(-1).code;
}
function cookie(response) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
const email = "reader@example.test",
  password = "correct-horse-battery-123";
let loginCookie;
test("register without session; OTP hashed; unverified password login cannot mail or authorize", async () => {
  const response = await post("sign-up/email", {
    email: "READER@EXAMPLE.TEST",
    name: "Reader",
    password,
    role: "admin",
    turnstileToken: "test",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(deliveries.length, 1);
  const user = database
    .getDatabase()
    .prepare("SELECT * FROM user WHERE email=?")
    .get(email);
  assert.equal(user.emailVerified, 0);
  assert.equal(user.role, "user");
  const credential = database
    .getDatabase()
    .prepare("SELECT password FROM account")
    .get();
  assert.notEqual(credential.password, password);
  const otp = database
    .getDatabase()
    .prepare("SELECT value FROM verification")
    .get();
  assert.ok(!otp.value.includes(code(email)));
  assert.equal((await post("sign-in/email", { email, password })).status, 400);
  assert.equal(deliveries.length, 1);
});
test("resend cooldown persists; rotation rejects old OTP; concurrency consumes once", async () => {
  const old = code(email);
  assert.equal(
    (
      await post("email-otp/send-verification-otp", {
        email,
        type: "email-verification",
        turnstileToken: "test",
      })
    ).status,
    429,
  );
  resetLimits();
  assert.equal(
    (
      await post("email-otp/send-verification-otp", {
        email,
        type: "email-verification",
        turnstileToken: "test",
      })
    ).status,
    200,
  );
  const next = code(email);
  assert.notEqual(next, old);
  assert.equal(
    (await post("email-otp/verify-email", { email, otp: old })).status,
    400,
  );
  const results = await Promise.all([
    post("email-otp/verify-email", { email, otp: next }),
    post("email-otp/verify-email", { email, otp: next }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.equal(
    database
      .getDatabase()
      .prepare("SELECT emailVerified FROM user WHERE email=?")
      .get(email).emailVerified,
    1,
  );
  assert.equal(
    results.find((r) => r.status === 200).headers.get("set-cookie"),
    null,
  );
});
test("password login creates revocable HttpOnly session; OTP login and mutation bypass blocked", async () => {
  const response = await post("sign-in/email", { email, password });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
  loginCookie = cookie(response);
  assert.ok(
    await getAuth().api.getSession({
      headers: new Headers({ cookie: loginCookie }),
    }),
  );
  for (const route of [
    "sign-in/email-otp",
    "email-otp/create-verification-otp",
    "change-password",
    "request-password-reset",
  ])
    assert.equal((await post(route, { email, otp: code(email) })).status, 404);
  assert.equal(
    (
      await post("email-otp/send-verification-otp", {
        email,
        type: "sign-in",
        turnstileToken: "test",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "sign-in/email",
        { email, password },
        null,
        "https://evil.test",
      )
    ).status,
    403,
  );
});
test("reset purpose rejects verification code and revokes previous login; logout revokes new session", async () => {
  resetLimits();
  assert.equal(
    (
      await post("email-otp/request-password-reset", {
        email,
        turnstileToken: "test",
      })
    ).status,
    200,
  );
  const resetOTP = code(email),
    newPassword = password + "-new";
  assert.equal(
    (await post("email-otp/verify-email", { email, otp: resetOTP })).status,
    400,
  );
  assert.equal(
    (
      await post("email-otp/reset-password", {
        email,
        otp: resetOTP,
        password: newPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    await getAuth().api.getSession({
      headers: new Headers({ cookie: loginCookie }),
    }),
    null,
  );
  assert.equal(
    (
      await post("email-otp/reset-password", {
        email,
        otp: resetOTP,
        password: newPassword,
      })
    ).status,
    400,
  );
  const response = await post("sign-in/email", {
    email,
    password: newPassword,
  });
  loginCookie = cookie(response);
  assert.equal((await post("sign-out", {}, loginCookie)).status, 200);
  assert.equal(
    await getAuth().api.getSession({
      headers: new Headers({ cookie: loginCookie }),
    }),
    null,
  );
});
test("expired / exhausted OTP, CAPTCHA and mail failure rejected; resend is recoverable", async () => {
  resetLimits();
  const second = "second@example.test";
  failMail = true;
  assert.equal(
    (
      await post("sign-up/email", {
        email: second,
        name: "Second",
        password,
        turnstileToken: "test",
      })
    ).status,
    503,
  );
  assert.equal(
    database
      .getDatabase()
      .prepare(
        "SELECT status FROM mail_requests ORDER BY created_at DESC LIMIT 1",
      )
      .get().status,
    "failed",
  );
  failMail = false;
  resetLimits();
  assert.equal(
    (
      await post("email-otp/send-verification-otp", {
        email: second,
        type: "email-verification",
        turnstileToken: "test",
      })
    ).status,
    200,
  );
  const correct = code(second),
    incorrect = correct === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await post("email-otp/verify-email", { email: second, otp: incorrect }))
        .status,
      400,
    );
  assert.equal(
    (await post("email-otp/verify-email", { email: second, otp: correct }))
      .status,
    400,
  );
  resetLimits();
  await post("email-otp/send-verification-otp", {
    email: second,
    type: "email-verification",
    turnstileToken: "test",
  });
  database
    .getDatabase()
    .prepare("UPDATE verification SET expiresAt=?")
    .run(Date.now() - 1);
  assert.equal(
    (await post("email-otp/verify-email", { email: second, otp: code(second) }))
      .status,
    400,
  );
  challengeOK = false;
  resetLimits();
  assert.equal(
    (
      await post("email-otp/request-password-reset", {
        email,
        turnstileToken: "test",
      })
    ).status,
    403,
  );
  challengeOK = true;
});
test("persisted atomic limits and per-user/global quotas; reservations released only before upstream", () => {
  resetLimits();
  assert.equal(consumeLimits([{ key: "test", max: 1, window: 60_000 }]), true);
  assert.equal(consumeLimits([{ key: "test", max: 1, window: 60_000 }]), false);
  const userId = database
    .getDatabase()
    .prepare("SELECT id FROM user WHERE email=?")
    .get(email).id;
  assert.deepEqual(reserveUsage(userId, randomUUID()), {
    error: "ai_disabled",
  });
  process.env.AI_ENABLED = "1";
  process.env.AI_USER_DAILY_LIMIT = "1";
  process.env.AI_GLOBAL_DAILY_LIMIT = "2";
  const reservation = reserveUsage(userId, randomUUID());
  assert.ok(reservation.id);
  assert.deepEqual(reserveUsage(userId, randomUUID()), {
    error: "quota_exceeded",
  });
  finishUsage(reservation.id, "released");
  const counted = reserveUsage(userId, randomUUID());
  finishUsage(counted.id, "failed");
  assert.deepEqual(reserveUsage(userId, randomUUID()), {
    error: "quota_exceeded",
  });
});
test("versioned migration is repeatable; backup API restores integrity and user data", async () => {
  const db = database.getDatabase();
  await database.migrate(db);
  assert.equal(
    db.prepare("SELECT count(*) n FROM schema_migrations").get().n,
    2,
  );
  const backup = path.join(directory, "restore.sqlite");
  await db.backup(backup);
  const restored = database.open(backup);
  assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
  assert.equal(restored.prepare("SELECT count(*) n FROM user").get().n, 2);
  assert.equal(restored.pragma("foreign_key_check").length, 0);
  restored.close();
});
test.after(async () => {
  global.fetch = originalFetch;
  database.getDatabase().close();
  await fs.rm(directory, { recursive: true, force: true });
});
