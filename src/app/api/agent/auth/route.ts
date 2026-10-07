import { NextResponse } from "next/server";

import { AGENT_COOKIE_MAX_AGE, AGENT_COOKIE_NAME, makeCookieValue, verifyPasscode } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

// naive in-memory rate limit: 10 attempts per 5 minutes per IP
const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 5 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let passcode: unknown;
  try {
    ({ passcode } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ ok: false, error: "wrong_passcode" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AGENT_COOKIE_NAME, makeCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: AGENT_COOKIE_MAX_AGE,
  });
  return response;
}
