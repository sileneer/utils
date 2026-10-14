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
  // Each purpose has its own ceiling. Change-email codes and their result notices
  // stay inside the general budget so password recovery keeps its reserve.
  const PURPOSES: Record<string, number> = {
    "email-verification": 250,
    "forget-password": 280,
    "change-email-old": 250,
    "change-email-new": 250,
    "change-email-notice": 250,
  };
  const changeEmailDaily = 40;
  if (!(type in PURPOSES)) throw new Error("invalid_mail_purpose");
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
      if (used >= PURPOSES[type]) return false;
      if (type.startsWith("change-email")) {
        const own = (
          database
            .prepare("SELECT count(*) n FROM mail_requests WHERE created_at>=? AND purpose LIKE 'change-email%'")
            .get(day) as { n: number }
        ).n;
        if (own >= changeEmailDaily) return false;
      }
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
    const notice = type === "change-email-notice";
    const copy = {
      "email-verification": {
        subject: "Utils · 验证邮箱 / Verify your email",
        scope: "注册邮箱验证",
        scopeEn: "email verification",
      },
      "forget-password": {
        subject: "Utils · 重置密码 / Reset password",
        scope: "重置密码",
        scopeEn: "password reset",
      },
      "change-email-old": {
        subject: "Utils · 确认更换登录邮箱 / Confirm your email change",
        scope: "确认更换登录邮箱（发往当前地址）",
        scopeEn: "confirming a sign-in email change from this address",
      },
      "change-email-new": {
        subject: "Utils · 确认新邮箱 / Confirm your new email",
        scope: "更换登录邮箱（发往新地址）",
        scopeEn: "confirming a new sign-in email address",
      },
    }[type] ?? {
      subject: "Utils · 账号验证 / Account verification",
      scope: "账号验证",
      scopeEn: "account verification",
    };
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
        subject: notice
          ? "Utils · 登录邮箱已更换 / Sign-in email changed"
          : copy.subject,
        textContent: notice
          ? `Utils\n\n你的登录邮箱已于此次请求更换为新的地址。如果这不是你本人的操作，请立即重置密码并检查登录会话。\n\nYour sign-in email address was just changed by this account. If this wasn't you, reset your password immediately and review your login sessions.\n`
          : `Utils\n\n验证码 / Verification code: ${otp}\n\n10 分钟内有效，仅用于${copy.scope}。\nValid for 10 minutes, for ${copy.scopeEn} only.\nIf you did not request this, ignore this email.`,
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
