"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChatPanel } from "@/components/chat/chat-panel";
import { Button } from "@/components/ui/button";

/**
 * Full-screen shell for the HowToLiveBetter reading experience:
 * top bar + book iframe + AI chat sidebar (desktop: static panel,
 * mobile: overlay). Rendered as a fixed overlay so the root layout's
 * max-width <main> does not constrain the reading surface.
 */
export function ReadingShell() {
  const t = useTranslations("htlb");
  const [desktopChat, setDesktopChat] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft />
            {t("back")}
          </Link>
        </Button>
        <p className="min-w-0 truncate text-sm font-medium">{t("title")}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDesktopChat((v) => !v);
            setMobileChat((v) => !v);
          }}
          aria-label={t("chatToggle")}
        >
          {desktopChat ? <PanelRightClose /> : <PanelRightOpen />}
          <span className="hidden md:inline">{t("chat")}</span>
          <span className="md:hidden">{t("chat")}</span>
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <iframe
          src="/htlb/book"
          title={t("title")}
          className="min-w-0 flex-1 border-0"
        />
        <ChatPanel
          className={cnSidebar(desktopChat)}
        />
        {mobileChat && (
          <>
            <button
              aria-label={t("close")}
              className="absolute inset-0 z-40 bg-foreground/20 md:hidden"
              onClick={() => setMobileChat(false)}
            />
            <ChatPanel
              className="absolute inset-y-0 right-0 z-50 w-[88%] max-w-sm border-l shadow-lg md:hidden"
              onClose={() => setMobileChat(false)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function cnSidebar(open: boolean): string {
  return [
    "hidden shrink-0 border-l w-[380px]",
    open ? "md:flex" : "",
  ].join(" ");
}
