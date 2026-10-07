import { cookies, headers } from "next/headers";

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * Locale resolution order (DESIGN.md §10):
 * NEXT_LOCALE cookie → visitor's Accept-Language → "en".
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
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (locales.includes(fromCookie as Locale)) return fromCookie as Locale;
  const headerStore = await headers();
  return negotiate(headerStore.get("accept-language") ?? "");
}

export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}
