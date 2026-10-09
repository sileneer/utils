import { randomUUID } from "node:crypto";
import { db } from "../db";
import { serviceBusy } from "./active-query";
import type { Availability } from "../chat/history";
export function reserveUsage(
  user: string,
  turn: string,
): { id: string } | { error: string } {
  const perUser = Number(process.env.AI_USER_DAILY_LIMIT ?? 0),
    total = Number(process.env.AI_GLOBAL_DAILY_LIMIT ?? 0);
  if (
    !Number.isSafeInteger(perUser) ||
    !Number.isSafeInteger(total) ||
    perUser < 1 ||
    total < 1 ||
    process.env.AI_ENABLED !== "1"
  )
    return { error: "ai_disabled" };
  const database = db(),
    now = Date.now(),
    day = new Date(now).setUTCHours(0, 0, 0, 0);
  return database
    .transaction(() => {
      const all = (
        database
          .prepare(
            "SELECT count(*) n FROM ai_usage WHERE created_at>=? AND status!='released'",
          )
          .get(day) as { n: number }
      ).n;
      const own = (
        database
          .prepare(
            "SELECT count(*) n FROM ai_usage WHERE created_at>=? AND user_id=? AND status!='released'",
          )
          .get(day, user) as { n: number }
      ).n;
      if (all >= total || own >= perUser) return { error: "quota_exceeded" };
      const id = randomUUID();
      database
        .prepare("INSERT INTO ai_usage VALUES (?,?,?,?,?,NULL)")
        .run(id, user, turn, now, "reserved");
      return { id };
    })
    .immediate();
}
export function finishUsage(id: string, status: string, usage?: unknown) {
  db()
    .prepare("UPDATE ai_usage SET status=?,usage_json=? WHERE id=?")
    .run(status, usage ? JSON.stringify(usage) : null, id);
}

export function availability(user: string, now = Date.now()): Availability {
  const limit = Number(process.env.AI_USER_DAILY_LIMIT ?? 0),
    total = Number(process.env.AI_GLOBAL_DAILY_LIMIT ?? 0);
  const enabled =
    process.env.AI_ENABLED === "1" &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    Number.isSafeInteger(total) &&
    total > 0;
  const day = new Date(now).setUTCHours(0, 0, 0, 0);
  const used = (
    db()
      .prepare(
        "SELECT count(*) n FROM ai_usage WHERE user_id=? AND created_at>=? AND status!='released'",
      )
      .get(user, day) as { n: number }
  ).n;
  const all = (
    db()
      .prepare(
        "SELECT count(*) n FROM ai_usage WHERE created_at>=? AND status!='released'",
      )
      .get(day) as { n: number }
  ).n;
  return {
    enabled,
    used,
    limit: enabled ? limit : 0,
    remaining: enabled ? Math.max(0, limit - used) : 0,
    resetAt: day + 86_400_000,
    service: !enabled
      ? "disabled"
      : used >= limit || all >= total
        ? "quota"
        : serviceBusy()
          ? "busy"
          : "ready",
  };
}
