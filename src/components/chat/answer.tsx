"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CitationPreview, type SourceDisclosure } from "./citation-preview";
import { extractCitations } from "@/lib/chat/citations";

export function Answer({
  text,
  incomplete = false,
  revision,
  readerRevision,
  anchors,
  onCitation,
  sourceDisclosures,
  onSourceDisclosure,
  sourceKey,
}: {
  text: string;
  incomplete?: boolean;
  revision?: string;
  readerRevision?: string;
  anchors: Set<string>;
  onCitation: (anchor: string, revision: string) => void;
  sourceKey: string;
  sourceDisclosures: Record<string, SourceDisclosure>;
  onSourceDisclosure: (key: string, value: SourceDisclosure) => void;
}) {
  const t = useTranslations("chat");
  const [copied, setCopied] = useState(false);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
      setCopied(false);
    }
  }
  const citations = extractCitations(text);
  return (
    <div className="min-w-0 space-y-3 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => (
            <h3 className="mt-4 font-semibold">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 font-semibold">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 font-semibold">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="my-2 whitespace-pre-wrap">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre
              tabIndex={0}
              className="my-3 max-w-full overflow-x-auto rounded-lg bg-background p-3 text-xs"
            >
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-background px-1 font-mono text-xs">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div tabIndex={0} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border bg-background p-2 text-left">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border p-2 align-top">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
      {citations.length > 0 && (
        <div
          role="group"
          className="grid min-w-0 gap-2"
          aria-label={t("citations")}
        >
          {citations.map(c => (
            <CitationPreview key={(revision ?? "missing") + c.anchor} citation={c} revision={revision}
              canNavigate={Boolean(revision && (revision !== readerRevision || anchors.has(c.anchor)))}
              remembered={sourceDisclosures[sourceKey + (revision ?? "missing") + c.anchor]}
              onRemember={value => onSourceDisclosure(sourceKey + (revision ?? "missing") + c.anchor, value)}
              onNavigate={() => { if (revision) onCitation(c.anchor, revision); }} />
          ))}
        </div>
      )}
      {text && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-xs"
              aria-label={t(
                copied ? "copied" : incomplete ? "copyCurrent" : "copy",
              )}
              onClick={() => void copy(text)}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {t(copied ? "copied" : incomplete ? "copyCurrent" : "copy")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(copied ? "copied" : incomplete ? "copyCurrent" : "copy")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
