"use client";

import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  FileDiff,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  defaultContext,
  diffInputProblem,
  diffLines,
  eolLabel,
  limits,
  unifiedDiff,
  type DiffLine,
  type DiffOptions,
  type DiffResult,
  type Eol,
  type Segment,
} from "@/lib/tools/diff";
import { markUnsaved } from "@/lib/unsaved";

type View = "side" | "unified";
type Translate = ReturnType<typeof useTranslations>;

export function TextDiffTool() {
  const t = useTranslations("textDiff");
  const [original, setOriginal] = useState("");
  const [changed, setChanged] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [view, setView] = useState<View>("side");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState("");

  const dirty = original !== "" || changed !== "";
  // Switching locale reloads the document, so pasted text needs confirming away.
  useEffect(() => {
    if (!dirty) return;
    return markUnsaved("text-diff");
  }, [dirty]);

  const slowOriginal = useDeferredValue(original);
  const slowChanged = useDeferredValue(changed);
  const updating = slowOriginal !== original || slowChanged !== changed;

  const options: DiffOptions = useMemo(
    () => ({ ignoreCase, ignoreTrailingWhitespace: ignoreWhitespace }),
    [ignoreCase, ignoreWhitespace],
  );
  const problem = useMemo(
    () => diffInputProblem(slowOriginal, slowChanged),
    [slowOriginal, slowChanged],
  );
  const result = useMemo(
    () => (problem ? null : diffLines(slowOriginal, slowChanged, options)),
    [problem, slowOriginal, slowChanged, options],
  );
  const hunks = useMemo(() => {
    const seen: number[] = [];
    for (const row of result?.rows ?? [])
      if (row.hunk > 0 && !seen.includes(row.hunk)) seen.push(row.hunk);
    return seen;
  }, [result]);
  const current = hunks.length === 0 ? 0 : Math.min(active, hunks.length - 1);
  const activeHunk = hunks.length === 0 ? 0 : hunks[current];

  async function copy(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      toast.error(t("copyFailed"));
      setCopied("");
    }
  }

  function goTo(delta: number) {
    if (hunks.length === 0) return;
    const next = (current + delta + hunks.length) % hunks.length;
    setActive(next);
    const node = document.getElementById("text-diff-hunk-" + hunks[next]);
    if (!node) return;
    node.scrollIntoView({ block: "center" });
    node.focus({ preventScroll: true });
  }

  function loadExample() {
    setOriginal(t("exampleOriginal"));
    setChanged(t("exampleChanged"));
    setActive(0);
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="text-diff-inputs" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="text-diff-inputs" className="text-lg font-semibold md:text-xl">
            {t("inputs")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("localNote")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="min-h-10" onClick={loadExample}>
            <WandSparkles />
            {t("example")}
          </Button>
          <Button
            variant="outline"
            className="min-h-10"
            disabled={!dirty}
            onClick={() => {
              setOriginal(changed);
              setChanged(original);
              setActive(0);
            }}
          >
            <ArrowLeftRight />
            {t("swap")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={!dirty}
            onClick={() => {
              setOriginal("");
              setChanged("");
              setActive(0);
            }}
          >
            <Eraser />
            {t("clear")}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Pane
            id="text-diff-original"
            name={t("original")}
            placeholder={t("originalPlaceholder")}
            value={original}
            copied={copied === "original"}
            onChange={(value) => {
              setOriginal(value);
              setActive(0);
            }}
            onCopy={() => copy("original", original)}
            t={t}
          />
          <Pane
            id="text-diff-changed"
            name={t("changed")}
            placeholder={t("changedPlaceholder")}
            value={changed}
            copied={copied === "changed"}
            onChange={(value) => {
              setChanged(value);
              setActive(0);
            }}
            onCopy={() => copy("changed", changed)}
            t={t}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The switch pill is 18px tall, so its invisible hit area has to reach
              the 40px minimum in DESIGN §9; -inset-y-3 makes it 42px. */}
          <span className="group/field-label flex min-h-10 items-center gap-2">
            <Switch
              id="text-diff-case"
              className="after:-inset-y-3"
              checked={ignoreCase}
              onCheckedChange={(value) => {
                setIgnoreCase(value);
                setActive(0);
              }}
            />
            <Label htmlFor="text-diff-case">{t("ignoreCase")}</Label>
          </span>
          <span className="group/field-label flex min-h-10 items-center gap-2">
            <Switch
              id="text-diff-space"
              className="after:-inset-y-3"
              checked={ignoreWhitespace}
              onCheckedChange={(value) => {
                setIgnoreWhitespace(value);
                setActive(0);
              }}
            />
            <Label htmlFor="text-diff-space">{t("ignoreWhitespace")}</Label>
          </span>
          <p className="text-xs text-muted-foreground">{t("optionsNote")}</p>
        </div>
      </section>

      <section aria-labelledby="text-diff-result" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="text-diff-result" className="text-lg font-semibold md:text-xl">
            {t("result")}
          </h2>
          {result && result.stats.hunks > 0 && (
            <p className="font-mono text-xs">
              <span aria-hidden className="text-success">
                {t("added", { count: result.stats.added })}
              </span>{" "}
              <span aria-hidden className="text-destructive">
                {t("removed", { count: result.stats.removed })}
              </span>{" "}
              <span aria-hidden className="text-muted-foreground">
                {t("unchanged", { count: result.stats.unchanged })}
              </span>{" "}
              <span className="sr-only">
                {t("statsAria", {
                  hunks: result.stats.hunks,
                  added: result.stats.added,
                  removed: result.stats.removed,
                  unchanged: result.stats.unchanged,
                  lines: result.stats.leftLines + result.stats.rightLines,
                })}
              </span>
            </p>
          )}
        </div>

        {problem && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {problem === "chars"
                ? t("tooManyChars", { max: limits.chars.toLocaleString() })
                : t("tooManyLines", { max: limits.lines.toLocaleString() })}
            </AlertDescription>
          </Alert>
        )}

        {!problem && !dirty && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <FileDiff className="size-8 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
            <Button variant="outline" className="min-h-10" onClick={loadExample}>
              <WandSparkles />
              {t("example")}
            </Button>
          </div>
        )}

        {!problem && dirty && result && result.stats.hunks === 0 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {ignoreCase || ignoreWhitespace ? t("identicalOptions") : t("identical")}
          </p>
        )}

        {!problem && result && result.stats.hunks > 0 && (
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as View)}
            className="gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* shadcn pins the horizontal list to 32px, which leaves 25px
                  triggers — under the 40px minimum in DESIGN §9. */}
              <TabsList
                aria-label={t("views")}
                className="h-12 items-center group-data-horizontal/tabs:h-12"
              >
                <TabsTrigger value="side" className="px-3">
                  {t("sideBySide")}
                </TabsTrigger>
                <TabsTrigger value="unified" className="px-3">
                  {t("unified")}
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-wrap items-center gap-2">
                <p aria-live="polite" className="font-mono text-xs text-muted-foreground">
                  {t("position", { current: current + 1, total: hunks.length })}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => goTo(-1)}
                      aria-label={t("previous")}
                    >
                      <ChevronLeft />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("previous")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10"
                      onClick={() => goTo(1)}
                      aria-label={t("next")}
                    >
                      <ChevronRight />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("next")}</TooltipContent>
                </Tooltip>
                <Button
                  variant="secondary"
                  className="min-h-10"
                  onClick={() =>
                    copy("diff", unifiedDiff(slowOriginal, slowChanged, options))
                  }
                >
                  {copied === "diff" ? <Check /> : <Copy />}
                  {t("copyDiff")}
                </Button>
              </div>
            </div>

            {(updating || result.coarse || result.capped) && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {updating && <span>{t("computing")}</span>}
                {result.coarse && <span>{t("coarse")}</span>}
                {result.capped && <span>{t("cappedNote")}</span>}
              </p>
            )}

            <TabsContent value="side" className="mt-0">
              <Rows
                result={result}
                view="side"
                activeHunk={activeHunk}
                originalName={t("original")}
                changedName={t("changed")}
                t={t}
              />
            </TabsContent>
            <TabsContent value="unified" className="mt-0">
              <Rows
                result={result}
                view="unified"
                activeHunk={activeHunk}
                originalName={t("original")}
                changedName={t("changed")}
                t={t}
              />
            </TabsContent>
          </Tabs>
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
          <p>{t("howItWorks", { context: defaultContext })}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Pane({
  id,
  name,
  placeholder,
  value,
  copied,
  onChange,
  onCopy,
  t,
}: {
  id: string;
  name: string;
  placeholder: string;
  value: string;
  copied: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
  t: Translate;
}) {
  const over = value.length > limits.chars;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{name}</Label>
        <div className="flex items-center gap-1">
          <span
            className={
              "font-mono text-xs " +
              (over ? "text-destructive" : "text-muted-foreground")
            }
          >
            {t("characters", { count: value.length.toLocaleString() })}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                disabled={value === ""}
                onClick={onCopy}
                aria-label={t(copied ? "copiedAria" : "copyAria", { side: name })}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t(copied ? "copied" : "copy")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="max-h-80 min-h-32 overflow-y-auto font-mono text-sm"
      />
    </div>
  );
}

function endingName(eol: Eol, t: Translate): string {
  return eol === "" ? t("eolNone") : eolLabel(eol);
}

function Rows({
  result,
  view,
  activeHunk,
  originalName,
  changedName,
  t,
}: {
  result: DiffResult;
  view: View;
  activeHunk: number;
  originalName: string;
  changedName: string;
  t: Translate;
}) {
  return (
    <ul
      role="list"
      className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card text-xs ring-1 ring-foreground/10 md:text-sm"
    >
      {result.rows.map((row, index) => {
        if (row.kind === "gap" || row.kind === "cap")
          return (
            <li
              key={index}
              className="bg-muted/60 px-3 py-1 font-mono text-xs text-muted-foreground"
            >
              {row.kind === "gap"
                ? t("hiddenLines", { count: row.lines })
                : t("capped", { rows: limits.rows, rest: row.lines })}
            </li>
          );
        const anchor = row.hunk > 0 && row.hunk !== result.rows[index - 1]?.hunk;
        const shared = {
          id: anchor ? "text-diff-hunk-" + row.hunk : undefined,
          tabIndex: anchor ? -1 : undefined,
          className: [
            anchor ? "outline-none" : "",
            row.hunk === activeHunk ? "border-s-2 border-primary" : "",
          ]
            .filter(Boolean)
            .join(" "),
        };
        if (view === "unified")
          return (
            <li key={index} {...shared}>
              {row.kind === "equal" ? (
                <Cell line={row.right} tone="same" t={t} />
              ) : row.kind === "change" ? (
                <>
                  <Cell
                    line={row.left}
                    tone="removed"
                    parts={row.leftParts}
                    ending={row.endingOnly ? endingName(row.left.eol, t) : null}
                    t={t}
                  />
                  <Cell
                    line={row.right}
                    tone="added"
                    parts={row.rightParts}
                    ending={row.endingOnly ? endingName(row.right.eol, t) : null}
                    t={t}
                  />
                </>
              ) : row.kind === "delete" ? (
                <Cell line={row.left} tone="removed" t={t} />
              ) : (
                <Cell line={row.right} tone="added" t={t} />
              )}
            </li>
          );
        return (
          <li key={index} {...shared}>
            <div className="grid md:grid-cols-2">
              {row.kind === "equal" ? (
                <>
                  <Cell line={row.left} tone="same" name={originalName} t={t} />
                  <Cell line={row.right} tone="same" name={changedName} divider t={t} />
                </>
              ) : row.kind === "change" ? (
                <>
                  <Cell
                    line={row.left}
                    tone="removed"
                    parts={row.leftParts}
                    ending={row.endingOnly ? endingName(row.left.eol, t) : null}
                    name={originalName}
                    t={t}
                  />
                  <Cell
                    line={row.right}
                    tone="added"
                    parts={row.rightParts}
                    ending={row.endingOnly ? endingName(row.right.eol, t) : null}
                    name={changedName}
                    divider
                    t={t}
                  />
                </>
              ) : row.kind === "delete" ? (
                <>
                  <Cell line={row.left} tone="removed" name={originalName} t={t} />
                  <Cell line={null} tone="blank" name={changedName} divider t={t} />
                </>
              ) : (
                <>
                  <Cell line={null} tone="blank" name={originalName} t={t} />
                  <Cell line={row.right} tone="added" name={changedName} divider t={t} />
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Cell({
  line,
  tone,
  parts,
  ending,
  name,
  divider = false,
  t,
}: {
  line: DiffLine | null;
  tone: "same" | "added" | "removed" | "blank";
  parts?: Segment[] | null;
  ending?: string | null;
  name?: string;
  divider?: boolean;
  t: Translate;
}) {
  const status =
    tone === "added" ? t("srAdded") : tone === "removed" ? t("srRemoved") : "";
  return (
    <div
      className={
        "flex min-w-0 gap-2 px-3 py-1 font-mono" +
        (tone === "added"
          ? " bg-success/10"
          : tone === "removed"
            ? " bg-destructive/10"
            : tone === "blank"
              ? " bg-muted/40"
              : "") +
        (divider ? " border-border/60 md:border-s" : "")
      }
    >
      {name && (
        <span className="font-sans text-xs text-muted-foreground md:hidden">
          {name}
        </span>
      )}
      <span aria-hidden className="w-12 shrink-0 text-end text-muted-foreground select-none">
        {line ? line.number : ""}
      </span>
      <span aria-hidden className="w-3 shrink-0 select-none">
        {tone === "added" ? "+" : tone === "removed" ? "−" : ""}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {status && <span className="sr-only">{status} </span>}
        {line === null
          ? ""
          : parts
            ? parts.map((part, index) =>
                !part.changed ? (
                  <Fragment key={index}>{part.text}</Fragment>
                ) : tone === "removed" ? (
                  <del key={index} className="rounded-sm bg-destructive/15">
                    {part.text}
                  </del>
                ) : (
                  <ins key={index} className="rounded-sm bg-success/15 no-underline">
                    {part.text}
                  </ins>
                ),
              )
            : line.text}
        {ending && (
          <span className="ms-2 rounded-sm bg-muted px-1 align-middle font-sans text-xs text-muted-foreground">
            {t("ending", { eol: ending })}
          </span>
        )}
      </span>
    </div>
  );
}
