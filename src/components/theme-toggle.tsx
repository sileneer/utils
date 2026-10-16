"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Monitor, Moon as MoonIcon, Sun as SunIcon } from "lucide-react";
import { Moon as MoonNode, Sun as SunNode } from "lucide";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MorphIcon } from "morphicons/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/components/auth/account-provider";
import { writeDeviceTheme, type DeviceTheme } from "@/lib/theme-device";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { setTheme, resolvedTheme } = useTheme();
  const { preferences } = useAccount();
  // next-themes resolvedTheme is only known after mount (html class set client-side).
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";
  const override = preferences?.theme ?? null;

  // The menu always edits this device; a saved account choice keeps winning and
  // says so, rather than the control silently doing nothing (DESIGN §5.11).
  const choose = (value: DeviceTheme) => {
    writeDeviceTheme(value);
    setTheme(override ?? value);
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={t("label")}
              title={t("label")}
            >
              <MorphIcon icon={isDark ? MoonNode : SunNode} size={16} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => choose("light")}>
          <SunIcon />
          {t("light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose("dark")}>
          <MoonIcon />
          {t("dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose("system")}>
          <Monitor />
          {t("system")}
        </DropdownMenuItem>
        {override && (
          <DropdownMenuItem asChild>
            <Link href="/account#preferences">{t("accountOverride", { theme: t(override) })}</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
