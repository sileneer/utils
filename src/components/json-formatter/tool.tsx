"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Eraser, TriangleAlert, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  errorExcerpt,
  formatJson,
  jsonLimits,
  type Indent,
  type JsonError,
} from "@/lib/tools/json";
import { markUnsaved } from "@/lib/unsaved";

function describe(found?: string): string {
  if (found === undefined || found === "") return "";
  return "“" + found + "”";
}

function reason(error: JsonError, t: ReturnType<typeof useTranslations>): string {
  switch (error.code) {
    case "empty":
      return t("reasonEmpty");
    case "tooLarge":
      return t("reasonTooLarge", {
        max: Number(error.found ?? jsonLimits.characters).toLocaleString(),
      });
    case "tooDeep":
      return t("reasonTooDeep", { max: error.found ?? jsonLimits.depth });
    case "outputTooLarge":
      return t("reasonOutputTooLarge", { max: jsonLimits.output.toLocaleString() });
    case "unexpectedEnd":
      return t("reasonUnexpectedEnd");
    case "unexpectedToken":
      return t("reasonUnexpectedToken", { found: describe(error.found) });
    case "badEscape":
      return t("reasonBadEscape", { found: describe(error.found) });
    case "badNumber":
      return t("reasonBadNumber", { found: describe(error.found) });
    case "missingColon":
      return t("reasonMissingColon");
    case "missingComma":
      return t("reasonMissingComma", { found: describe(error.found) });
    case "trailingComma":
      return t("reasonTrailingComma", { found: describe(error.found) });
    case "duplicateKey":
      return t("reasonDuplicateKey", { key: error.key ?? "" });
    case "extraData":
      return t("reasonExtraData", { found: describe(error.found) });
  }
}

export function JsonFormatterTool() {
  const t = useTranslations("jsonFormatter");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<"pretty" | "minified">("pretty");
  const [indent, setIndent] = useState<Indent>("2");
  const [copied, setCopied] = useState(false);

  const dirty = source !== "";
  // Switching locale reloads the document, so a pasted document is confirmed away.
  useEffect(() => {
    if (!dirty) return;
    return markUnsaved("json-formatter");
  }, [dirty]);

  const slowSource = useDeferredValue(source);
  const updating = slowSource !== source;
  const result = useMemo(
    () => formatJson(slowSource, { mode, indent }),
    [slowSource, mode, indent],
  );
  const output = result.ok ? result.text : "";
  const excerpt = result.ok ? null : errorExcerpt(slowSource, result.error);

  async function copy() {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
      setCopied(false);
    }
  }

  function download() {
    if (!result.ok) return;
    const href = URL.createObjectURL(new Blob([result.text], { type: "application/json" }));
    const link = document.createElement("a");
    // A fixed name: the document, and any key inside it, never becomes a filename.
    link.href = href;
    link.download = "formatted.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast.success(t("saved"));
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="json-input" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="json-input" className="text-lg font-semibold md:text-xl">
            {t("input")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("localNote")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => {
              setSource(t("example"));
            }}
          >
            <WandSparkles />
            {t("loadExample")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={!dirty}
            onClick={() => setSource("")}
          >
            <Eraser />
            {t("clear")}
          </Button>
          <div
            role="group"
            aria-label={t("style")}
            className="ms-auto flex gap-1 rounded-lg bg-muted p-1"
          >
            <Button
              variant={mode === "pretty" ? "secondary" : "ghost"}
              aria-pressed={mode === "pretty"}
              onClick={() => setMode("pretty")}
              className="min-h-10 px-3"
            >
              {t("pretty")}
            </Button>
            <Button
              variant={mode === "minified" ? "secondary" : "ghost"}
              aria-pressed={mode === "minified"}
              onClick={() => setMode("minified")}
              className="min-h-10 px-3"
            >
              {t("minified")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="json-indent" className="text-xs text-muted-foreground">
              {t("indent")}
            </Label>
            <Select value={indent} onValueChange={(value) => setIndent(value as Indent)}>
              <SelectTrigger
                id="json-indent"
                className="h-10!"
                disabled={mode === "minified"}
                aria-label={t("indent")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t("indent2")}</SelectItem>
                <SelectItem value="4">{t("indent4")}</SelectItem>
                <SelectItem value="tab">{t("indentTab")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Textarea
          id="json-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={t("inputPlaceholder")}
          spellCheck={false}
          aria-label={t("input")}
          className="max-h-[60vh] min-h-40 overflow-y-auto font-mono text-sm"
        />
        <p className="font-mono text-xs text-muted-foreground">
          {t("characters", { count: source.length.toLocaleString() })}
          {updating ? " · " + t("updating") : ""}
        </p>
      </section>

      <section aria-labelledby="json-output" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="json-output" className="text-lg font-semibold md:text-xl">
            {t("output")}
          </h2>
          {result.ok && (
            <p className="font-mono text-xs text-muted-foreground">
              {t("characters", { count: output.length.toLocaleString() })}
            </p>
          )}
        </div>

        {!dirty && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("waiting")}
          </p>
        )}

        {result.ok ? (
          <div className="space-y-3">
            <p className="text-sm">
              {t("valid", {
                objects: result.stats.objects,
                arrays: result.stats.arrays,
                keys: result.stats.keys,
                values: result.stats.values,
                depth: result.stats.depth,
              })}
            </p>
            <Textarea
              id="json-result"
              readOnly
              value={output}
              aria-label={t("output")}
              spellCheck={false}
              className="max-h-[60vh] min-h-40 overflow-y-auto font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-10" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {t(copied ? "copied" : "copy")}
              </Button>
              <Button variant="outline" className="min-h-10" onClick={download}>
                <Download />
                {t("download")}
              </Button>
            </div>
          </div>
        ) : (
          dirty && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{t("invalid")}</AlertTitle>
              <AlertDescription className="space-y-2">
                <span>{reason(result.error, t)}</span>
                <span className="block font-mono text-xs">
                  {t("position", {
                    line: result.error.line,
                    column: result.error.column,
                  })}
                  {result.error.otherLine !== undefined
                    ? " · " +
                      t("firstDefined", {
                        line: result.error.otherLine,
                        column: result.error.otherColumn ?? 1,
                      })
                    : ""}
                </span>
                {excerpt && (
                  <span className="block overflow-x-auto font-mono text-xs" aria-hidden>
                    <span className="block whitespace-pre">{excerpt.text}</span>
                    <span className="block whitespace-pre">
                      {" ".repeat(excerpt.caret.indexOf("^"))}
                      {"↑"}
                    </span>
                  </span>
                )}
                <span className="block text-xs">{t("noRepair")}</span>
              </AlertDescription>
            </Alert>
          )
        )}
      </section>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="min-h-10 px-0">
            {t("footnote")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="max-w-2xl space-y-2 pt-2 text-sm text-muted-foreground">
          <p>{t("privacy")}</p>
          <p>
            {t("howItWorks", {
              max: jsonLimits.characters.toLocaleString(),
              depth: jsonLimits.depth,
            })}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
