"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Check, Copy, Eraser, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  baseUnit,
  convert,
  displayDigits,
  formatQuantity,
  unitCategories,
  unitsIn,
  type Unit,
  type UnitCategory,
  type UnitError,
} from "@/lib/tools/units";
import { markUnsaved } from "@/lib/unsaved";

/** The pair each category opens with: one metric unit and its usual counterpart. */
const defaults: Record<UnitCategory, { from: string; to: string }> = {
  length: { from: "m", to: "ft" },
  area: { from: "m2", to: "ft2" },
  volume: { from: "l", to: "gal_us" },
  mass: { from: "kg", to: "lb" },
  temperature: { from: "c", to: "f" },
  speed: { from: "kmh", to: "mph" },
  time: { from: "sec", to: "h" },
};

function reason(error: UnitError, from: Unit, t: ReturnType<typeof useTranslations>): string {
  switch (error.code) {
    case "empty":
      return t("reasonEmpty");
    case "invalid":
      return t("reasonInvalid", { found: error.found ?? "" });
    case "overflow":
      return t("reasonOverflow", { found: error.found ?? "" });
    case "underflow":
      return t("reasonUnderflow", { found: error.found ?? "" });
    case "belowAbsoluteZero":
      return t("reasonAbsoluteZero", {
        min: formatQuantity(error.limit ?? 0) + " " + from.symbol,
      });
    case "mixedDimensions":
      return t("reasonMixed");
    case "unknownUnit":
      return t("reasonUnknown");
  }
}

function UnitSelect({
  id,
  label,
  units,
  value,
  onChange,
}: {
  id: string;
  label: string;
  units: readonly Unit[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("unitConverter");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-11! w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit.id} value={unit.id} className="min-h-10">
            {t(`unit.${unit.id}`)} · {unit.symbol}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UnitConverterTool() {
  const t = useTranslations("unitConverter");
  const [category, setCategory] = useState<UnitCategory>("length");
  const [value, setValue] = useState("");
  const [fromId, setFromId] = useState(defaults.length.from);
  const [toId, setToId] = useState(defaults.length.to);
  const [copied, setCopied] = useState(false);

  const units = unitsIn(category);
  // Whitespace counts as "the user is trying to enter something", so a box with
  // only spaces gets the empty-value message rather than the idle placeholder.
  const entered = value !== "";
  // Switching locale reloads the document, so a typed number needs confirming away.
  useEffect(() => {
    if (!entered) return;
    return markUnsaved("unit-converter");
  }, [entered]);

  const result = useMemo(() => convert(value, fromId, toId), [value, fromId, toId]);
  const from = units.find((unit) => unit.id === fromId) ?? units[0];
  const to = units.find((unit) => unit.id === toId) ?? units[1];
  const base = baseUnit(category);
  const same = fromId === toId;
  // The through-the-base chain only says something when the base is a step,
  // not when one of the two chosen units already is the base.
  const chain =
    result.ok && Number.isFinite(result.baseValue) &&
    (result.baseValue !== 0 || result.value === 0 || category === "temperature") &&
    !same && from.id !== base.id && to.id !== base.id
      ? t("throughBase", {
          value: formatQuantity(result.value),
          from: from.symbol,
          base: result.baseText,
          baseUnit: base.symbol,
          result: result.text,
          to: to.symbol,
        })
      : null;

  function chooseCategory(next: UnitCategory) {
    setCategory(next);
    // Only units of one dimension are ever offered together, so a stale pair
    // cannot survive a category change; the number itself is kept.
    setFromId(defaults[next].from);
    setToId(defaults[next].to);
  }

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

  return (
    <div className="space-y-10">
      <section aria-labelledby="unit-entry" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="unit-entry" className="text-lg font-semibold md:text-xl">
            {t("convert")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("localNote")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="unit-category">{t("category")}</Label>
            <Select value={category} onValueChange={(next) => chooseCategory(next as UnitCategory)}>
              <SelectTrigger id="unit-category" className="h-11! w-full" aria-label={t("category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitCategories.map((option) => (
                  <SelectItem key={option} value={option} className="min-h-10">
                    {t(`categories.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit-value">{t("value")}</Label>
            <Input
              id="unit-value"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="1"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              className="h-11 min-h-10 font-mono text-base"
            />
            <p className="text-xs text-muted-foreground">{t("valueHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit-from">{t("from")}</Label>
            <UnitSelect id="unit-from" label={t("from")} units={units} value={fromId} onChange={setFromId} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit-to">{t("to")}</Label>
            <UnitSelect id="unit-to" label={t("to")} units={units} value={toId} onChange={setToId} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => {
              setFromId(toId);
              setToId(fromId);
            }}
          >
            <ArrowLeftRight />
            {t("swap")}
          </Button>
          <Button variant="ghost" className="min-h-10" disabled={!entered} onClick={() => setValue("")}>
            <Eraser />
            {t("clear")}
          </Button>
        </div>
      </section>

      <section aria-labelledby="unit-output" className="space-y-4">
        <h2 id="unit-output" className="text-lg font-semibold md:text-xl">
          {t("result")}
        </h2>

        {!entered && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("waiting")}
          </p>
        )}

        {entered && !result.ok && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{t("invalidTitle")}</AlertTitle>
            <AlertDescription>
              <span>{reason(result.error, from, t)}</span>
            </AlertDescription>
          </Alert>
        )}

        {result.ok && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 max-w-sm grow space-y-2">
                <Label htmlFor="unit-result">{t("result")}</Label>
                <Input
                  id="unit-result"
                  readOnly
                  value={result.text}
                  aria-label={t("result")}
                  spellCheck={false}
                  className="h-11 min-h-10 font-mono text-base"
                />
              </div>
              <span className="pb-3 font-mono text-sm text-muted-foreground">{to.symbol}</span>
              <Button className="min-h-10" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {t(copied ? "copied" : "copy")}
              </Button>
            </div>

            <div className="max-w-2xl space-y-2 rounded-lg border border-border/60 p-4">
              <h3 className="text-sm font-semibold">{t("relationship")}</h3>
              {same ? (
                <p className="text-xs">{t("sameUnit")}</p>
              ) : result.factorText === null ? (
                <p className="text-xs">{t("noFactor")}</p>
              ) : (
                <p className="font-mono text-xs">
                  {t("factor", { from: from.symbol, factor: result.factorText, to: to.symbol })}
                </p>
              )}
              {chain !== null && <p className="font-mono text-xs">{chain}</p>}
              <p className="text-xs text-muted-foreground">
                {t("baseOf", { category: t(`categories.${category}`), baseUnit: base.symbol })}
                {from.definedAs !== undefined
                  ? " · " + t("definedAs", { definition: from.definedAs })
                  : ""}
                {to.definedAs !== undefined
                  ? " · " + t("definedAs", { definition: to.definedAs })
                  : ""}
              </p>
            </div>
          </div>
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
          <p>{t("howItWorks", { digits: displayDigits })}</p>
          <p>{t("noRates")}</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
