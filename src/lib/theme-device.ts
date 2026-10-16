/**
 * Device layer of the theme preference.
 *
 * next-themes keeps its own storage key, which we repurpose as a cache of the
 * *applied* theme, because applying an account preference must not destroy the
 * device choice that logout has to restore. This module owns that device value.
 */
export const DEVICE_THEME_KEY = "utils_theme_device";
/** next-themes' default key before the applied/device split existed. */
const LEGACY_THEME_KEY = "theme";
export const DEVICE_THEMES = ["system", "light", "dark"] as const;
export type DeviceTheme = (typeof DEVICE_THEMES)[number];

export function isDeviceTheme(value: unknown): value is DeviceTheme {
  return typeof value === "string" && (DEVICE_THEMES as readonly string[]).includes(value);
}

/** Absent means "follow the system", matching the provider default. A device
 * configured before this key existed keeps its earlier choice. */
export function readDeviceTheme(): DeviceTheme {
  try {
    const stored = localStorage.getItem(DEVICE_THEME_KEY);
    if (isDeviceTheme(stored)) return stored;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (isDeviceTheme(legacy)) {
      localStorage.setItem(DEVICE_THEME_KEY, legacy);
      return legacy;
    }
  } catch {
    /* Storage can be unavailable; the default still renders. */
  }
  return "system";
}

export function writeDeviceTheme(theme: DeviceTheme) {
  try {
    localStorage.setItem(DEVICE_THEME_KEY, theme);
  } catch {
    /* Storage can be unavailable; the choice still applies for this visit. */
  }
}
