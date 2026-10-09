"use client";
import { keyboardViewport } from "@/lib/chat/viewport";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { SourceDisclosure } from "@/components/chat/citation-preview";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useChat } from "@/components/chat/use-chat";
import { AccountMenu } from "@/components/auth/account-menu";
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
  const [sourceDisclosures, setSourceDisclosures] = useState<Record<string, SourceDisclosure>>({});
  const [expandedChat, setExpandedChat] = useState(false);
  const [readerRevision, setReaderRevision] = useState<string>();
  const [returnTarget, setReturnTarget] = useState<{ messageId: string; top: number; expanded: boolean }>();
  const [returnPosition, setReturnPosition] = useState<{ messageId: string; top: number }>();
  const pendingNavigation = useRef<{ anchor: string; revision: string } | null>(null);
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
    let frame=0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>setViewport(keyboardViewport({
        height:visual.height,top:visual.offsetTop,scale:visual.scale,layoutHeight:window.innerHeight,
        mobile:!matchMedia("(min-width: 1024px)").matches,
        textFocused:document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement,
      })));
    };
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    document.addEventListener("focusin",update);document.addEventListener("focusout",update);
    return () => {
      cancelAnimationFrame(frame);visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
      document.removeEventListener("focusin",update);document.removeEventListener("focusout",update);
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
        if (readerRevision && data.revision !== readerRevision) return;
        setBook((previous) =>
          previous?.revision === data.revision
            ? previous
            : { revision: data.revision, anchors: new Set(data.anchors) },
        );
        const pending = pendingNavigation.current;
        if (pending && pending.revision === data.revision) {
          pendingNavigation.current = null;
          if (data.anchors.includes(pending.anchor))
            iframe.current?.contentWindow?.postMessage(
              { channel: "utils-book", type: "navigate", ...pending },
              location.origin,
            );
          else toast.error(c("sourceLocationMissing"));
        }
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
  }, [book, readerRevision, c]);
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
  function navigate(anchor: string, revision: string, messageId: string, top: number) {
    if (!isEntryAnchor(anchor) || !isRevision(revision)) return;
    setReturnTarget({ messageId, top, expanded: expandedChat });
    setReturnPosition(undefined);
    setMobileChat(false);
    setExpandedChat(false);
    setSelection(undefined);
    if (book?.revision === revision && book.anchors.has(anchor)) {
      iframe.current?.contentWindow?.postMessage({ channel: "utils-book", type: "navigate", revision, anchor }, location.origin);
    } else {
      pendingNavigation.current = { anchor, revision };
      setReaderRevision(revision);
      setBook(undefined);
      setBookFailed(false);
      setBookReload(value => value + 1);
    }
  }
  function returnToAnswer() {
    if (!returnTarget) return;
    setReturnPosition({ messageId: returnTarget.messageId, top: returnTarget.top });
    if (wide) {
      setDesktopChat(true);
      setExpandedChat(returnTarget.expanded);
    }
    else setMobileChat(true);
  }
  const panel = (
    <ChatPanel
      chat={chat}
      bookRevision={book?.revision}
      anchors={book?.anchors ?? new Set()}
      onCitation={navigate}
      expanded={expandedChat}
      onExpand={wide ? () => setExpandedChat(value => !value) : undefined}
      returnPosition={returnPosition}
      sourceDisclosures={sourceDisclosures}
      onSourceDisclosure={(key, value) =>
        setSourceDisclosures((previous) => ({ ...previous, [key]: value }))
      }
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
        <AccountMenu />
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
          <PopoverContent
            align="end"
            className="w-auto"
            aria-label={t("settings")}
          >
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
      {returnTarget && chat.messages.some(message => message.id === returnTarget.messageId) && !mobileChat && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-xs">
          <p className="min-w-0 truncate">{c("readingSource")}</p>
          <Button variant="outline" className="h-10 shrink-0 text-xs" onClick={returnToAnswer}>{c("returnToAnswer")}</Button>
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
          src={readerRevision ? "/htlb/book?revision=" + encodeURIComponent(readerRevision) : "/htlb/book"}
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
          <div className={expandedChat
            ? "w-[min(65vw,48rem)] shrink-0 border-l"
            : "w-96 shrink-0 border-l xl:w-[420px]"
          }>
            {panel}
          </div>
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
