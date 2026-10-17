/**
 * Unit definitions and conversion for `/unit-converter` (DESIGN.md §5.21). Every
 * conversion runs in the browser; the value being converted is never uploaded,
 * stored or put into a URL.
 *
 * One rule shapes the whole file: a category has exactly one base unit, and every
 * unit in it is expressed against that base. Area, volume and speed factors are
 * *derived* from the length and time tables instead of being typed in again, so
 * "square" and "cubic" relationships are arithmetic the tests can check rather than
 * numbers someone remembered. Temperature is the one category that cannot be a
 * multiplier — its scales differ by an offset as well as a gradient — so it is
 * affine on kelvin, and `convert` refuses to report a factor for it.
 */

export type UnitCategory =
  | "length"
  | "area"
  | "volume"
  | "mass"
  | "temperature"
  | "speed"
  | "time";

export const unitCategories: readonly UnitCategory[] = [
  "length",
  "area",
  "volume",
  "mass",
  "temperature",
  "speed",
  "time",
];

/** A multiplier to the base unit, or the affine pair temperature needs. */
export type Scale =
  | { readonly kind: "linear"; readonly factor: number }
  | {
      readonly kind: "affine";
      /** Reading × slope + intercept, in units of 900 kelvin. */
      readonly slope: number;
      readonly intercept: number;
    };

export type Unit = {
  /** Stable key for the message catalogs: `unitConverter.unit.<id>`. */
  readonly id: string;
  readonly category: UnitCategory;
  /** Locale-neutral symbol used in results and definitions, e.g. "in" or "gal (US)". */
  readonly symbol: string;
  readonly scale: Scale;
  /** Exact definition in terms of other symbols, shown beside the derived factor. */
  readonly definedAs?: string;
};

/**
 * Significant digits used for every displayed number. The value returned by
 * `convert` is the full double; rounding happens only here, and nothing feeds a
 * rounded display back into a calculation.
 */
export const displayDigits = 12;

const linear = (factor: number): Scale => ({ kind: "linear", factor });

// ---- length (base: metre) ----------------------------------------------------
// The 1959 international definitions, as exact decimals.
const METRE = 1;
const INCH = 0.0254;
const FOOT = 0.3048;
const YARD = 0.9144;
const MILE = 1609.344;
const NAUTICAL_MILE = 1852;

// ---- time (base: second) -----------------------------------------------------
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
/** The Julian year: 365.25 days. "year" has no other unambiguous definition. */
const YEAR = 31557600;

/** Squares and cubes come from the length table, so the ratio cannot drift. */
const squared = (side: number): number => side * side;
const cubed = (side: number): number => side * side * side;
const squareOf = (side: string): string => `1 ${side} × 1 ${side}`;
const cubeOf = (side: string): string => `1 ${side} × 1 ${side} × 1 ${side}`;

// ---- mass (base: kilogram) --------------------------------------------------
const POUND = 0.45359237;

// ---- volume (base: litre) ---------------------------------------------------
const CUBIC_METRE_IN_LITRES = 1000;
const CUBIC_INCH_IN_LITRES = cubed(INCH) * CUBIC_METRE_IN_LITRES;
/** US gallon = 231 in³ exactly; Imperial gallon = 4.54609 L exactly (1824). */
const GALLON_US = 231 * CUBIC_INCH_IN_LITRES;
const GALLON_IMPERIAL = 4.54609;

const length: Unit[] = [
  { id: "um", category: "length", symbol: "µm", scale: linear(1e-6) },
  { id: "mm", category: "length", symbol: "mm", scale: linear(1e-3) },
  { id: "cm", category: "length", symbol: "cm", scale: linear(1e-2) },
  { id: "m", category: "length", symbol: "m", scale: linear(METRE) },
  { id: "km", category: "length", symbol: "km", scale: linear(1e3) },
  { id: "in", category: "length", symbol: "in", scale: linear(INCH), definedAs: "2.54 cm" },
  { id: "ft", category: "length", symbol: "ft", scale: linear(FOOT), definedAs: "12 in" },
  { id: "yd", category: "length", symbol: "yd", scale: linear(YARD), definedAs: "3 ft" },
  { id: "mi", category: "length", symbol: "mi", scale: linear(MILE), definedAs: "5280 ft" },
  {
    id: "nmi",
    category: "length",
    symbol: "nmi",
    scale: linear(NAUTICAL_MILE),
    definedAs: "1852 m",
  },
];

const area: Unit[] = [
  { id: "mm2", category: "area", symbol: "mm²", scale: linear(squared(1e-3)) },
  { id: "cm2", category: "area", symbol: "cm²", scale: linear(squared(1e-2)) },
  { id: "m2", category: "area", symbol: "m²", scale: linear(squared(METRE)) },
  { id: "ha", category: "area", symbol: "ha", scale: linear(1e4), definedAs: "10000 m²" },
  { id: "km2", category: "area", symbol: "km²", scale: linear(squared(1e3)) },
  {
    id: "in2",
    category: "area",
    symbol: "in²",
    scale: linear(squared(INCH)),
    definedAs: squareOf("in"),
  },
  {
    id: "ft2",
    category: "area",
    symbol: "ft²",
    scale: linear(squared(FOOT)),
    definedAs: squareOf("ft"),
  },
  {
    id: "yd2",
    category: "area",
    symbol: "yd²",
    scale: linear(squared(YARD)),
    definedAs: squareOf("yd"),
  },
  {
    id: "mi2",
    category: "area",
    symbol: "mi²",
    scale: linear(squared(MILE)),
    definedAs: squareOf("mi"),
  },
  {
    id: "acre",
    category: "area",
    symbol: "acre",
    scale: linear(squared(FOOT) * 43560),
    definedAs: "43560 ft²",
  },
];

const volume: Unit[] = [
  { id: "ml", category: "volume", symbol: "mL", scale: linear(1e-3) },
  { id: "l", category: "volume", symbol: "L", scale: linear(1) },
  {
    id: "m3",
    category: "volume",
    symbol: "m³",
    scale: linear(CUBIC_METRE_IN_LITRES),
    definedAs: cubeOf("m"),
  },
  {
    id: "in3",
    category: "volume",
    symbol: "in³",
    scale: linear(CUBIC_INCH_IN_LITRES),
    definedAs: cubeOf("in"),
  },
  {
    id: "ft3",
    category: "volume",
    symbol: "ft³",
    scale: linear(cubed(FOOT) * CUBIC_METRE_IN_LITRES),
    definedAs: cubeOf("ft"),
  },
  {
    id: "gal_us",
    category: "volume",
    symbol: "gal (US)",
    scale: linear(GALLON_US),
    definedAs: "231 in³",
  },
  {
    id: "gal_imp",
    category: "volume",
    symbol: "gal (imp)",
    scale: linear(GALLON_IMPERIAL),
    definedAs: "4.54609 L",
  },
  {
    id: "qt_us",
    category: "volume",
    symbol: "qt (US)",
    scale: linear(GALLON_US / 4),
    definedAs: "1/4 gal (US)",
  },
  {
    id: "qt_imp",
    category: "volume",
    symbol: "qt (imp)",
    scale: linear(GALLON_IMPERIAL / 4),
    definedAs: "1/4 gal (imp)",
  },
  {
    id: "pt_us",
    category: "volume",
    symbol: "pt (US)",
    scale: linear(GALLON_US / 8),
    definedAs: "1/8 gal (US)",
  },
  {
    id: "pt_imp",
    category: "volume",
    symbol: "pt (imp)",
    scale: linear(GALLON_IMPERIAL / 8),
    definedAs: "1/8 gal (imp)",
  },
  {
    id: "floz_us",
    category: "volume",
    symbol: "fl oz (US)",
    scale: linear(GALLON_US / 128),
    definedAs: "1/128 gal (US)",
  },
  {
    id: "floz_imp",
    category: "volume",
    symbol: "fl oz (imp)",
    scale: linear(GALLON_IMPERIAL / 160),
    definedAs: "1/160 gal (imp)",
  },
];

const mass: Unit[] = [
  { id: "mg", category: "mass", symbol: "mg", scale: linear(1e-6) },
  { id: "g", category: "mass", symbol: "g", scale: linear(1e-3) },
  { id: "kg", category: "mass", symbol: "kg", scale: linear(1) },
  { id: "t", category: "mass", symbol: "t", scale: linear(1000), definedAs: "1000 kg" },
  { id: "oz", category: "mass", symbol: "oz", scale: linear(POUND / 16), definedAs: "1/16 lb" },
  {
    id: "lb",
    category: "mass",
    symbol: "lb",
    scale: linear(POUND),
    definedAs: "0.45359237 kg",
  },
  { id: "st", category: "mass", symbol: "st", scale: linear(POUND * 14), definedAs: "14 lb" },
  {
    id: "ton_us",
    category: "mass",
    symbol: "ton (US)",
    scale: linear(POUND * 2000),
    definedAs: "2000 lb",
  },
  {
    id: "ton_uk",
    category: "mass",
    symbol: "ton (UK)",
    scale: linear(POUND * 2240),
    definedAs: "2240 lb",
  },
];

/**
 * Temperature scales are affine, so they cannot be a factor. They are stored as
 * `reading × slope + intercept` on a shared unit of 900 kelvin — 900 because it is
 * the smallest integer that makes both the 5/9 Fahrenheit gradient and the two
 * decimal offsets (273.15, 459.67) integral. Combined with the exact decimal the
 * user typed, the whole conversion stays in integer arithmetic until one final
 * division, so 32 °F is 0 °C rather than 5.68e-14 °C.
 */
const KELVIN = 900;

/** Offset scales, all anchored on 900 × kelvin. */
const temperature: Unit[] = [
  {
    id: "c",
    category: "temperature",
    symbol: "°C",
    definedAs: "K = °C + 273.15",
    scale: { kind: "affine", slope: KELVIN, intercept: 245835 }, // 273.15 × 900
  },
  {
    id: "f",
    category: "temperature",
    symbol: "°F",
    definedAs: "K = (°F + 459.67) × 5/9",
    // 459.67 × 500, written as an integer: a decimal literal here would carry its
    // own binary error into every reading and put it back on screen as 3.2e-14 °C.
    scale: { kind: "affine", slope: 500, intercept: 229835 },
  },
  {
    id: "k",
    category: "temperature",
    symbol: "K",
    scale: { kind: "affine", slope: KELVIN, intercept: 0 },
  },
  {
    id: "r",
    category: "temperature",
    symbol: "°R",
    definedAs: "K = °R × 5/9",
    scale: { kind: "affine", slope: 500, intercept: 0 },
  },
];

/** Speed is a length divided by a time, so its factor is computed, never typed. */
function speedOf(
  id: string,
  symbol: string,
  metres: number,
  seconds: number,
  definedAs: string,
): Unit {
  return { id, category: "speed", symbol, scale: linear(metres / seconds), definedAs };
}

const speed: Unit[] = [
  speedOf("cmps", "cm/s", 1e-2, 1, "1 cm / 1 s"),
  speedOf("mps", "m/s", METRE, 1, "1 m / 1 s"),
  speedOf("kms", "km/s", 1e3, 1, "1000 m / 1 s"),
  speedOf("kmh", "km/h", 1e3, HOUR, "1000 m / 3600 s"),
  speedOf("mph", "mph", MILE, HOUR, "1 mi / 1 h"),
  speedOf("fps", "ft/s", FOOT, 1, "1 ft / 1 s"),
  speedOf("kn", "kn", NAUTICAL_MILE, HOUR, "1 nmi / 1 h"),
];

const time: Unit[] = [
  { id: "ns", category: "time", symbol: "ns", scale: linear(1e-9) },
  { id: "us", category: "time", symbol: "µs", scale: linear(1e-6) },
  { id: "ms", category: "time", symbol: "ms", scale: linear(1e-3) },
  { id: "sec", category: "time", symbol: "s", scale: linear(1) },
  { id: "min", category: "time", symbol: "min", scale: linear(MINUTE), definedAs: "60 s" },
  { id: "h", category: "time", symbol: "h", scale: linear(HOUR), definedAs: "60 min" },
  { id: "day", category: "time", symbol: "d", scale: linear(DAY), definedAs: "24 h" },
  { id: "week", category: "time", symbol: "wk", scale: linear(WEEK), definedAs: "7 d" },
  { id: "year", category: "time", symbol: "yr", scale: linear(YEAR), definedAs: "365.25 d" },
];

export const units: readonly Unit[] = [
  ...length,
  ...area,
  ...volume,
  ...mass,
  ...temperature,
  ...speed,
  ...time,
];

const byId = new Map(units.map((unit) => [unit.id, unit]));

/** The base unit id each category converts through. */
export const baseIds: Record<UnitCategory, string> = {
  length: "m",
  area: "m2",
  volume: "l",
  mass: "kg",
  temperature: "k",
  speed: "mps",
  time: "sec",
};

export function findUnit(id: string): Unit | undefined {
  return byId.get(id);
}

export function baseUnit(category: UnitCategory): Unit {
  return byId.get(baseIds[category])!;
}

/** Only units of one dimension are ever offered together. */
export function unitsIn(category: UnitCategory): readonly Unit[] {
  return units.filter((unit) => unit.category === category);
}

/** The multiplier from one reading of this unit to its category base, if it has one. */
export function baseFactor(unit: Unit): number | null {
  return unit.scale.kind === "linear" ? unit.scale.factor : null;
}

function affineOf(unit: Unit): { slope: number; intercept: number } | null {
  return unit.scale.kind === "affine"
    ? { slope: unit.scale.slope, intercept: unit.scale.intercept }
    : null;
}

/** Absolute zero in this unit — the lowest reading the physical world allows. */
function floorOf(unit: Unit): number {
  const scale = affineOf(unit);
  if (scale === null) return 0;
  const floor = -scale.intercept / scale.slope;
  // Kelvin and Rankine start at zero, and the division above would say "-0".
  return floor === 0 ? 0 : floor;
}

const decimalToken = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

export type UnitErrorCode =
  | "empty"
  | "invalid"
  | "overflow"
  | "underflow"
  | "belowAbsoluteZero"
  | "unknownUnit"
  | "mixedDimensions";

export type UnitError = {
  code: UnitErrorCode;
  /** The offending text, for an input problem. */
  found?: string;
  /** Absolute zero in the unit being entered, for a physical-range refusal. */
  limit?: number;
};

export type Quantity =
  | { ok: true; value: number; scaled: bigint; denominator: bigint }
  | { ok: false; error: UnitError };

/**
 * Accepts decimals, an optional leading sign and scientific notation. Rejects
 * everything else — thousands separators, spaces between digits, units typed into
 * the number box, `NaN` and `Infinity` — rather than guessing what was meant.
 */
export function parseQuantity(input: string): Quantity {
  const text = input.trim();
  if (text === "") return { ok: false, error: { code: "empty" } };
  if (text.length > 4096 || !decimalToken.test(text))
    return { ok: false, error: { code: "invalid", found: shorten(text) } };
  const value = Number(text);
  if (!Number.isFinite(value))
    return { ok: false, error: { code: "overflow", found: shorten(text) } };
  // "1e-400" is a well-formed token no double can hold; it must not read as 0.
  if (value === 0 && /[1-9]/.test(text.split(/[eE]/)[0]))
    return { ok: false, error: { code: "underflow", found: shorten(text) } };
  const { scaled, denominator } = decimalParts(text);
  return { ok: true, value, scaled, denominator };
}

/** The typed decimal as an integer over a power of ten: "98.6" → 986 / 10. */
function decimalParts(text: string): { scaled: bigint; denominator: bigint } {
  const sign = text.startsWith("-") ? BigInt(-1) : BigInt(1);
  const [mantissa, power] = text.replace(/^[+-]/, "").split(/[eE]/);
  const [whole, fraction] = mantissa.split(".");
  const exponent = (power === undefined ? 0 : Number(power)) - (fraction?.length ?? 0);
  const digits = BigInt((whole || "0") + (fraction ?? ""));
  // Zero stays zero even when its exponent is too large to represent as a Number.
  if (digits === BigInt(0)) return { scaled: BigInt(0), denominator: BigInt(1) };
  if (exponent >= 0)
    return { scaled: sign * digits * BigInt(10) ** BigInt(exponent), denominator: BigInt(1) };
  return { scaled: sign * digits, denominator: BigInt(10) ** BigInt(-exponent) };
}

/** Divide before converting to double, including finite ratios of huge integers. */
function rationalNumber(numerator: bigint, denominator: bigint): number {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (Number.isFinite(top) && Number.isFinite(bottom)) return top / bottom;
  if (numerator === BigInt(0)) return 0;
  const magnitude = numerator < BigInt(0) ? -numerator : numerator;
  const shift = 18 + denominator.toString().length - magnitude.toString().length;
  const quotient = shift >= 0
    ? (numerator * BigInt(10) ** BigInt(shift)) / denominator
    : numerator / (denominator * BigInt(10) ** BigInt(-shift));
  return Number(quotient.toString() + "e" + -shift);
}

export type Conversion =
  | {
      ok: true;
      from: Unit;
      to: Unit;
      /** Full-precision results: only the `*Text` fields are rounded for display. */
      value: number;
      baseValue: number;
      result: number;
      text: string;
      baseText: string;
      /** `1 from = factorText to`, or null when the scales differ by an offset. */
      factor: number | null;
      factorText: string | null;
    }
  | { ok: false; error: UnitError };

export function convert(input: string, fromId: string, toId: string): Conversion {
  const from = findUnit(fromId);
  const to = findUnit(toId);
  if (!from || !to)
    return { ok: false, error: { code: "unknownUnit", found: shorten(from ? toId : fromId) } };
  if (from.category !== to.category)
    return { ok: false, error: { code: "mixedDimensions", found: from.id + " → " + to.id } };

  const parsed = parseQuantity(input);
  if (!parsed.ok) return parsed;
  const { value } = parsed;

  let baseValue: number;
  let result: number;
  const fromAffine = affineOf(from);
  const toAffine = affineOf(to);
  if (fromAffine && toAffine) {
    // Integer arithmetic on 900 × kelvin, divided once at the end.
    const numerator = BigInt(fromAffine.slope) * parsed.scaled + parsed.denominator * BigInt(fromAffine.intercept);
    if (numerator < BigInt(0))
      return { ok: false, error: { code: "belowAbsoluteZero", limit: floorOf(from) } };
    baseValue = rationalNumber(numerator, parsed.denominator * BigInt(KELVIN));
    const resultNumerator = numerator - parsed.denominator * BigInt(toAffine.intercept);
    result = from.id === to.id ? value : rationalNumber(resultNumerator, parsed.denominator * BigInt(toAffine.slope));
    if (result === 0 && resultNumerator !== BigInt(0))
      return { ok: false, error: { code: "underflow", found: shorten(input.trim()) } };
  } else {
    const fromFactor = baseFactor(from);
    const toFactor = baseFactor(to);
    if (fromFactor === null || toFactor === null)
      return { ok: false, error: { code: "mixedDimensions", found: from.id + " → " + to.id } };
    baseValue = value * fromFactor;
    // Combine factors first: an intermediate base value may overflow/underflow
    // even when the requested result (including an identity conversion) is finite.
    result = value * (fromFactor / toFactor);
  }

  if (!Number.isFinite(result))
    return { ok: false, error: { code: "overflow", found: shorten(input.trim()) } };
  // A multiplier can flatten a non-zero magnitude to nothing; an offset scale cannot,
  // and 0 K is a real reading rather than a lost one.
  if (
    result === 0 &&
    value !== 0 &&
    from.scale.kind === "linear" &&
    to.scale.kind === "linear"
  )
    return { ok: false, error: { code: "underflow", found: shorten(input.trim()) } };

  const factor =
    from.scale.kind === "linear" && to.scale.kind === "linear"
      ? from.scale.factor / to.scale.factor
      : null;

  return {
    ok: true,
    from,
    to,
    value,
    baseValue,
    result,
    text: formatQuantity(result),
    baseText: formatQuantity(baseValue),
    factor,
    factorText: factor === null ? null : formatQuantity(factor),
  };
}

/**
 * Rounds for display only: `toPrecision` and back to a Number gives the shortest
 * decimal that still reads as that rounded value, which is what removes the
 * `16.387064000000003` tails without hiding real digits. `convert` keeps the full
 * double separately, so a displayed number is never the input to the next step.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  return String(Number(value.toPrecision(displayDigits)));
}

function shorten(text: string): string {
  return text.length > 24 ? text.slice(0, 24) + "…" : text;
}
