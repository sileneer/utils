import { getAuth } from "./server";
import { consumeLimits, privateKey } from "./limits";
import { withMailOutcome } from "./mail";
import { accountSession } from "./identity";
import { withAccountChange, beforePasswordWrite } from "./lifecycle";
import { db } from "../db";

// Deliberately expose only password login and purpose-scoped verification/reset.
const postPaths = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/email-otp/send-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
]);
const sendPaths = new Set([
  "/sign-up/email",
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
]);
const emailLocks = new Map<string, Promise<void>>();
async function serial<T>(key: string, action: () => Promise<T>) {
  const prior = emailLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  emailLocks.set(key, next);
  await prior;
  try {
    return await action();
  } finally {
    release();
    if (emailLocks.get(key) === next) emailLocks.delete(key);
  }
}
function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}
export async function handleAuth(request: Request) {
  try {
    const auth = getAuth(),
      url = new URL(request.url),
      route = url.pathname.slice("/api/auth".length);
    if (request.method === "GET") {
      return json("not_found", 404);
    }
    if (!postPaths.has(route)) return json("not_found", 404);
    const origin = process.env.APP_URL || "http://localhost:3000";
    if (
      request.headers.get("origin") !== origin ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return json("invalid_origin", 403);
    const raw = await request.text();
    if (raw.length > 4096) return json("bad_request", 400);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json("bad_request", 400);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (
      route !== "/sign-out" &&
      (!email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
      return json("bad_request", 400);
    if (
      (route === "/sign-up/email" || route === "/email-otp/reset-password") &&
      (typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 128 ||
        !/[A-Za-z]/.test(body.password) ||
        !/[0-9]/.test(body.password))
    )
      return json("bad_request", 400);
    if (
      route === "/sign-up/email" &&
      (typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 80)
    )
      return json("bad_request", 400);
    if (
      route === "/email-otp/send-verification-otp" &&
      body.type !== "email-verification"
    )
      return json("bad_request", 400);
    // Only production's loopback Tunnel path may assert Cloudflare client IP.
    // Local development ignores forwarded headers. Never trust arbitrary XFF.
    const ip =
      process.env.TRUST_CLOUDFLARE_IP === "1"
        ? request.headers.get("cf-connecting-ip") || "unknown"
        : "local";
    const key = privateKey(email);
    if (
      !consumeLimits([
        { key: `ip:${privateKey(ip)}:${route}`, max: 20, window: 60_000 },
      ])
    )
      return json("rate_limited", 429);
    const sends = sendPaths.has(route);
    if (sends) {
      if (
        !process.env.BREVO_API_KEY ||
        !process.env.MAIL_FROM ||
        !process.env.TURNSTILE_SITE_KEY ||
        !process.env.TURNSTILE_SECRET_KEY
      )
        return json("service_unavailable", 503);
      if (
        typeof body.turnstileToken !== "string" ||
        body.turnstileToken.length > 2048
      )
        return json("challenge_failed", 403);
      const result = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: body.turnstileToken,
            ...(ip !== "local" && ip !== "unknown" ? { remoteip: ip } : {}),
          }),
        },
      );
      const verification = await result.json();
      const testKey =
        process.env.TURNSTILE_SITE_KEY === "1x00000000000000000000AA" &&
        !origin.startsWith("https://");
      if (
        !verification.success ||
        (!testKey && verification.hostname !== new URL(origin).hostname)
      )
        return json("challenge_failed", 403);
    }
    const forwarded = new Headers(request.headers);
    forwarded.set("x-utils-client-ip", ip);
    delete body.turnstileToken;
    body.email = email;
    const logoutIdentity = route === "/sign-out" ? await accountSession(forwarded) : null;
    const operationKey = logoutIdentity ? privateKey(logoutIdentity.user.id) : key;
    return await serial(operationKey, async () => {
      const { result, failed } = await withMailOutcome(async () => {
        const buckets = sends
          ? [
              { key: `send:${key}:minute`, max: 1, window: 60_000 },
              { key: `send:${key}:hour`, max: 5, window: 3_600_000 },
            ]
          : [{ key: `attempt:${operationKey}:${route}`, max: 10, window: 60_000 }];
        if (!consumeLimits(buckets)) return json("rate_limited", 429);
        const call = () => auth.handler(
          new Request(request.url, {
            method: "POST",
            headers: forwarded,
            body: JSON.stringify(body),
          }),
        );
        let response: Response;
        if (route === "/sign-out") {
          const identity = logoutIdentity;
          response = identity ? await withAccountChange(identity.user.id, async () => {
            const latest = await accountSession(forwarded);
            if (latest?.session.id === identity.session.id) await beforePasswordWrite();
            return await call();
          }, false) : await call();
        } else if (route === "/email-otp/reset-password") {
          const user = db().prepare("SELECT id FROM user WHERE email=?").get(email) as { id: string } | undefined;
          // Lock before invoking the OTP flow, but cancel only in its authorized
          // password-write hook. Invalid OTPs must never cancel a live request.
          response = user ? await withAccountChange(user.id, call, false) : await call();
        } else response = await call();
        if (route === "/sign-up/email") {
          // Sign-up sends no mail automatically, so sending failure is visible and
          // recoverable using the same resend path (without retaining passwords).
          if (response.ok) {
            try {
              await auth.api.sendVerificationOTP({
                body: { email, type: "email-verification" },
              });
            } catch {
              return json("mail_send_failed", 503);
            }
          } else if (response.status >= 500)
            return json("service_unavailable", 503);
          return Response.json(
            { success: true },
            { headers: { "cache-control": "no-store" } },
          );
        }
        // Don't return library internals, email enumeration, password/session token.
        if (!response.ok)
          return json(
            response.status >= 500 ? "mail_send_failed" : "auth_failed",
            response.status === 429 ? 429 : response.status >= 500 ? 503 : 400,
          );
        const resultHeaders = new Headers({
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        for (const cookie of response.headers.getSetCookie())
          resultHeaders.append("set-cookie", cookie);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: resultHeaders,
        });
      });
      // Better Auth deliberately logs/swallow background email failures. Our
      // awaited adapter reports the outcome without exposing mail content.
      return failed ? json("mail_send_failed", 503) : result;
    });
  } catch (error) {
    if (error instanceof Error && ["stop_unconfirmed", "account_busy"].includes(error.message))
      return json(error.message, 409);
    return json("service_unavailable", 503);
  }
}
