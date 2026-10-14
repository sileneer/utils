import { cache } from "react";
import { cookies, headers } from "next/headers";
import { accountPresentation, type Preferences } from "@/lib/auth/preferences";

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** The layout and next-intl's message loader resolve this once per request. */
const presentationForRequest = cache(async (): Promise<Preferences> =>
  accountPresentation(await headers()),
);

/**
 * Locale resolution order (DESIGN.md §5.11, ARCHITECTURE.md §7):
 * explicit account preference → NEXT_LOCALE cookie → visitor's Accept-Language
 * → "en". The account lookup is presentation-only and fails open, so an
 * anonymous visit or an unreadable preference table behaves exactly as before.
 */
function negotiate(acceptLanguage: string): Locale {
  const ranges = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranges) {
    if (tag === "*") continue;
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return defaultLocale;
}

export async function getUserLocale(): Promise<Locale> {
  const saved = (await presentationForRequest()).language;
  if (saved) return saved;
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (locales.includes(fromCookie as Locale)) return fromCookie as Locale;
  const headerStore = await headers();
  return negotiate(headerStore.get("accept-language") ?? "");
}

export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}
