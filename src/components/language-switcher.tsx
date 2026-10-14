"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/components/auth/account-provider";
import { hasUnsaved } from "@/lib/unsaved";

function writeDeviceLocale(locale: string) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax`;
  // Messages are server-rendered, so the document has to reload to show them.
  window.location.reload();
}

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const c = useTranslations("common");
  const { preferences } = useAccount();
  const active = useLocale();
  const [pending, setPending] = useState<string>();

  function choose(locale: string) {
    // Reloading discards in-memory form edits, so ask first (DESIGN §5.11).
    if (hasUnsaved()) { setPending(locale); return; }
    writeDeviceLocale(locale);
  }
  return (
    <>
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
          <DropdownMenuItem onClick={() => choose("en")}>
            {t("en")}
            {active === "en" && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => choose("zh")}>
            {t("zh")}
            {active === "zh" && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
          {preferences?.language && (
            <DropdownMenuItem asChild>
              <Link href="/account#preferences">{t("accountOverride", { language: t(preferences.language) })}</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) setPending(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c("unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{c("unsavedBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">{c("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" onClick={() => { const next = pending; setPending(undefined); if (next) writeDeviceLocale(next); }}>{c("unsavedContinue")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
