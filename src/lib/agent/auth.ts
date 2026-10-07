import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "agent_auth";
export const AGENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function passcode(): string {
  const value = process.env.CHAT_PASSCODE;
  if (!value) throw new Error("CHAT_PASSCODE is not configured");
  return value;
}

function sign(expiry: number): string {
  return createHmac("sha256", passcode()).update(String(expiry)).digest("base64url");
}

export function verifyPasscode(input: unknown): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  const expected = Buffer.from(passcode());
  const got = Buffer.from(input);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function makeCookieValue(): string {
  const expiry = Date.now() + AGENT_COOKIE_MAX_AGE * 1000;
  return `${expiry}.${sign(expiry)}`;
}

export function verifyCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiry = Number(value.slice(0, dot));
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = Buffer.from(sign(expiry));
  const got = Buffer.from(value.slice(dot + 1));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return verifyCookieValue(store.get(COOKIE_NAME)?.value);
}

export const AGENT_COOKIE_NAME = COOKIE_NAME;
