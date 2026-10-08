import { randomUUID } from "node:crypto";
import { db } from "../db";
import { privateKey } from "./limits";
import { AsyncLocalStorage } from "node:async_hooks";
const outcome = new AsyncLocalStorage<{ failed: boolean }>();
export async function withMailOutcome<T>(action: () => Promise<T>) {
  const state = { failed: false };
  const result = await outcome.run(state, action);
  return { result, failed: state.failed };
}
export async function sendOTP({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: string;
}) {
  try {
    await deliverOTP({ email, otp, type });
  } catch {
    const state = outcome.getStore();
    if (state) state.failed = true;
    throw new Error("mail_send_failed");
  }
}
async function deliverOTP({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: string;
}) {
  if (type !== "email-verification" && type !== "forget-password")
    throw new Error("invalid_mail_purpose");
  const database = db(),
    now = Date.now(),
    id = randomUUID();
  const day = new Date(now).setUTCHours(0, 0, 0, 0);
  const reserved = database
    .transaction(() => {
      const used = (
        database
          .prepare("SELECT count(*) n FROM mail_requests WHERE created_at>=?")
          .get(day) as { n: number }
      ).n;
      const budget = type === "forget-password" ? 280 : 250;
      if (used >= budget) return false;
      database
        .prepare("INSERT INTO mail_requests VALUES (?,?,?,?,?,NULL)")
        .run(id, privateKey(email), type, now, "reserved");
      return true;
    })
    .immediate();
  if (!reserved) throw new Error("mail_budget_exhausted");
  try {
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM)
      throw new Error("mail_unconfigured");
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: process.env.MAIL_FROM_NAME?.trim() || "Utils",
          email: process.env.MAIL_FROM,
        },
        to: [{ email }],
        ...(process.env.MAIL_REPLY_TO
          ? { replyTo: { email: process.env.MAIL_REPLY_TO } }
          : {}),
        subject:
          type === "email-verification"
            ? "Utils · 验证邮箱 / Verify your email"
            : "Utils · 重置密码 / Reset password",
        textContent: `Utils\n\n验证码 / Verification code: ${otp}\n\n10 分钟内有效，仅用于${type === "email-verification" ? "注册邮箱验证" : "重置密码"}。\nValid for 10 minutes, for ${type === "email-verification" ? "email verification" : "password reset"} only.\nIf you did not request this, ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error("mail_send_failed");
    const data = await response.json();
    database
      .prepare("UPDATE mail_requests SET status=?, provider_id=? WHERE id=?")
      .run(
        "accepted",
        typeof data.messageId === "string" ? data.messageId : null,
        id,
      );
  } catch {
    database
      .prepare("UPDATE mail_requests SET status=? WHERE id=?")
      .run("failed", id);
    throw new Error("mail_send_failed");
  }
}
