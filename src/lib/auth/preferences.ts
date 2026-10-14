import { db } from "../db";
import { getAuth } from "./server";

export type ThemeChoice = "system" | "light" | "dark";
export type LanguageChoice = "en" | "zh";
export type Preferences = { theme: ThemeChoice | null; language: LanguageChoice | null };

/** Unset means "no account choice", so the device layer stays in effect. */
export const NO_PREFERENCES: Preferences = { theme: null, language: null };

const THEMES = ["system", "light", "dark"];
const LANGUAGES = ["en", "zh"];

export function isTheme(value: unknown): value is ThemeChoice {
  return typeof value === "string" && THEMES.includes(value);
}
export function isLanguage(value: unknown): value is LanguageChoice {
  return typeof value === "string" && LANGUAGES.includes(value);
}

/** Stored choices only; a missing table or row is simply "nothing saved". */
export function readPreferences(userId: string): Preferences {
  let row: { theme: string | null; language: string | null } | undefined;
  try {
    row = db().prepare("SELECT theme,language FROM user_preferences WHERE user_id=?").get(userId) as
      { theme: string | null; language: string | null } | undefined;
  } catch { return { ...NO_PREFERENCES }; }
  return {
    theme: isTheme(row?.theme) ? row.theme : null,
    language: isLanguage(row?.language) ? row.language : null,
  };
}

/** One optional row per account; clearing both choices removes it entirely. */
export function writePreferences(userId: string, patch: Partial<Preferences>): Preferences {
  const current = readPreferences(userId);
  const theme = "theme" in patch ? patch.theme ?? null : current.theme;
  const language = "language" in patch ? patch.language ?? null : current.language;
  db().transaction(() => {
    const database = db();
    if (!theme && !language) database.prepare("DELETE FROM user_preferences WHERE user_id=?").run(userId);
    else database.prepare(
      "INSERT INTO user_preferences (user_id,theme,language,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme, language=excluded.language, updated_at=excluded.updated_at",
    ).run(userId, theme, language, Date.now());
  }).immediate();
  return readPreferences(userId);
}

/**
 * Presentation-only lookup used while rendering. It fails open to "no account
 * choice" for anonymous visitors, unconfigured auth, an unreadable database or a
 * missing table, because a preference must never break the page. Authorization
 * stays entirely in identity.ts.
 */
export async function accountPresentation(headers: Headers): Promise<Preferences> {
  try {
    const session = await getAuth().api.getSession({ headers });
    if (!session) return { ...NO_PREFERENCES };
    const eligible = db().prepare(
      "SELECT id FROM user WHERE id=? AND emailVerified=1 AND status='active'",
    ).get(session.user.id) as { id: string } | undefined;
    return eligible ? readPreferences(eligible.id) : { ...NO_PREFERENCES };
  } catch { return { ...NO_PREFERENCES }; }
}
