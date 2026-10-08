"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChat } from "@/components/chat/use-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isEntryAnchor, isRevision } from "@/lib/chat/citations";
import type { BookContext } from "@/lib/chat/protocol";
function subscribeWidth(callback: () => void) {
  const media = matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function ReadingShell() {
  const t = useTranslations("htlb");
  const c = useTranslations("chat");
  const chat = useChat();
  const { resolvedTheme } = useTheme();
  const wide = useSyncExternalStore(
    subscribeWidth,
    () => matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
  const [desktopChat, setDesktopChat] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const [book, setBook] = useState<{
    revision: string;
    anchors: Set<string>;
  }>();
  const [selection, setSelection] = useState<BookContext>();
  const [truncated, setTruncated] = useState(false);
  const [bookFailed, setBookFailed] = useState(false);
  const [bookReload, setBookReload] = useState(0);
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  const iframe = useRef<HTMLIFrameElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () =>
      setViewport({ height: visual.height, top: visual.offsetTop });
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);
  useEffect(() => {
    function receive(event: MessageEvent) {
      const data = event.data;
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        !data ||
        data.channel !== "utils-book" ||
        !isRevision(data.revision)
      )
        return;
      if (
        data.type === "ready" &&
        Array.isArray(data.anchors) &&
        data.anchors.length <= 5000 &&
        data.anchors.every(isEntryAnchor)
      ) {
        setBook((previous) =>
          previous?.revision === data.revision
            ? previous
            : { revision: data.revision, anchors: new Set(data.anchors) },
        );
        iframe.current?.contentWindow?.postMessage(
          {
            channel: "utils-book",
            type: "theme",
            revision: data.revision,
            theme: document.documentElement.classList.contains("dark")
              ? "dark"
              : "light",
          },
          location.origin,
        );
      }
      if (
        data.type === "selection" &&
        book &&
        data.revision === book.revision &&
        typeof data.text === "string" &&
        data.text.trim() &&
        data.text.length <= 2000 &&
        isEntryAnchor(data.anchor) &&
        book.anchors.has(data.anchor)
      ) {
        const [, section, item] = data.anchor.split("-");
        setSelection({
          text: data.text,
          revision: data.revision,
          section: Number(section),
          item: Number(item),
        });
        setTruncated(data.truncated === true);
      }
    }
    window.addEventListener("message", receive);
    if (!book)
      iframe.current?.contentWindow?.postMessage(
        { channel: "utils-book", type: "init" },
        location.origin,
      );
    return () => window.removeEventListener("message", receive);
  }, [book]);
  useEffect(() => {
    if (book)
      iframe.current?.contentWindow?.postMessage(
        {
          channel: "utils-book",
          type: "theme",
          revision: book.revision,
          theme: resolvedTheme,
        },
        location.origin,
      );
  }, [book, resolvedTheme]);
  function navigate(anchor: string) {
    if (!book?.anchors.has(anchor) || chat.revision !== book.revision) return;
    setMobileChat(false);
    iframe.current?.contentWindow?.postMessage(
      {
        channel: "utils-book",
        type: "navigate",
        revision: book.revision,
        anchor,
      },
      location.origin,
    );
  }
  const panel = (
    <ChatPanel
      chat={chat}
      bookRevision={book?.revision}
      anchors={book?.anchors ?? new Set()}
      onCitation={navigate}
      onClose={() => (wide ? setDesktopChat(false) : setMobileChat(false))}
      className="h-full w-full"
    />
  );
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-background"
      style={
        viewport
          ? { height: viewport.height, top: viewport.top, bottom: "auto" }
          : undefined
      }
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2 sm:gap-2 sm:px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              asChild
            >
              <Link href="/" aria-label={t("back")}>
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("back")}</TooltipContent>
        </Tooltip>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("title")}
        </h1>
        <div className="hidden items-center sm:flex">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 sm:hidden"
                  aria-label={t("settings")}
                  title={t("settings")}
                >
                  <Settings />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("settings")}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-auto">
            <p className="text-xs font-medium">{t("settings")}</p>
            <div className="flex">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </PopoverContent>
        </Popover>
        <Button
          ref={toggle}
          variant="outline"
          className="h-10 shrink-0 text-xs"
          aria-label={t("chatToggle")}
          aria-expanded={wide ? desktopChat : mobileChat}
          onClick={() =>
            wide
              ? setDesktopChat((value) => !value)
              : setMobileChat((value) => !value)
          }
        >
          <MessageSquare />
          <span>{t("chat")}</span>
        </Button>
      </header>
      {bookFailed && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-2 border-b p-3 text-xs text-destructive"
        >
          <p>{c("bookUnavailable")}</p>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => {
              setBook(undefined);
              setSelection(undefined);
              setBookFailed(false);
              setBookReload((value) => value + 1);
            }}
          >
            {c("retry")}
          </Button>
        </div>
      )}
      {selection && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted px-3 py-1 text-xs">
          <span className="min-w-0 flex-1 truncate">
            {c("citation", {
              section: selection.section!,
              item: selection.item!,
            })}
            {truncated && ` · ${c("excerptLimit")}`}
          </span>
          <Button
            className="h-10 shrink-0 text-xs"
            onClick={() => {
              chat.setContext(selection);
              if (!chat.draft.trim()) chat.setDraft(c("excerptQuestion"));
              if (wide) setDesktopChat(true);
              else setMobileChat(true);
              setSelection(undefined);
            }}
          >
            {c("askSelection")}
          </Button>
          <Button
            variant="ghost"
            className="h-10 text-xs"
            onClick={() => setSelection(undefined)}
          >
            {c("dismiss")}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <iframe
          key={bookReload}
          ref={iframe}
          src="/htlb/book"
          title={t("title")}
          className="min-w-0 flex-1 border-0"
          onLoad={() => {
            setBookFailed(
              iframe.current?.contentDocument?.contentType ===
                "application/json",
            );
            iframe.current?.contentWindow?.postMessage(
              { channel: "utils-book", type: "init" },
              location.origin,
            );
          }}
        />
        {wide && desktopChat && (
          <div className="w-96 shrink-0 border-l xl:w-[420px]">{panel}</div>
        )}
      </div>
      {!wide && (
        <Sheet open={mobileChat} onOpenChange={setMobileChat}>
          <SheetContent
            side="right"
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (event.target as HTMLElement).focus();
            }}
            className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
            style={
              viewport
                ? { height: viewport.height, top: viewport.top, bottom: "auto" }
                : undefined
            }
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              toggle.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">{c("title")}</SheetTitle>
            <SheetDescription className="sr-only">
              {c("greeting")}
            </SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
