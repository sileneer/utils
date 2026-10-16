"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // This key caches whatever theme is currently applied. The device's own
      // choice lives under utils_theme_device so applying an account preference
      // cannot overwrite it, and signing out can restore it (DESIGN §5.11).
      storageKey="utils_theme_applied"
    >
      {children}
    </NextThemesProvider>
  );
}
