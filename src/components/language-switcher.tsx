"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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

function setLocale(locale: string) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax`;
  window.location.reload();
}

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const active = useLocale();

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
              <Languages />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLocale("en")}>
          {t("en")}
          {active === "en" && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("zh")}>
          {t("zh")}
          {active === "zh" && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
