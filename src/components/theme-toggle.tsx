"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon as MoonIcon, Sun as SunIcon } from "lucide-react";
import { Moon as MoonNode, Sun as SunNode } from "lucide";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MorphIcon } from "morphicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { setTheme, resolvedTheme } = useTheme();
  // next-themes resolvedTheme is only known after mount (html class set client-side).
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")}>
          <MorphIcon icon={isDark ? MoonNode : SunNode} size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <SunIcon />
          {t("light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <MoonIcon />
          {t("dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor />
          {t("system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
