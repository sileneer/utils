/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  baseFactor,
  baseIds,
  convert,
  displayDigits,
  findUnit,
  formatQuantity,
  parseQuantity,
  unitCategories,
  units,
  unitsIn,
} = require("../src/lib/tools/units.ts");

const converted = (input, from, to) => {
  const result = convert(input, from, to);
  assert.equal(
    result.ok,
    true,
    "expected " + input + " " + from + " to convert to " + to + ", got " + JSON.stringify(result.error),
  );
  return result;
};
const text = (input, from, to) => converted(input, from, to).text;
const refused = (input, from, to) => {
  const result = convert(input, from, to);
  assert.equal(result.ok, false, "expected a refusal for " + input + " " + from + "→" + to);
  return result.error;
};
const near = (actual, expected, rel = 1e-12, label = "") => {
  const tolerance = Math.abs(expected) * rel + Number.EPSILON;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    label + actual + " is not within " + rel + " relative of " + expected,
  );
};

/** Significant digits in a displayed string: padding zeros either side do not count. */
function sigDigits(value) {
  const mantissa = value.replace(/^-/, "").split(/[eE]/)[0];
  const digits = mantissa.includes(".")
    ? mantissa.replace(".", "")
    : mantissa.replace(/0+$/, "");
  return digits.replace(/^0+/, "").length;
}

test("the definitions the table claims are the definitions it uses", () => {
  // Each of these is an exact, published definition rather than a measured ratio.
  assert.equal(text("1", "in", "cm"), "2.54");
  assert.equal(text("1", "ft", "in"), "12");
  assert.equal(text("1", "yd", "ft"), "3");
  assert.equal(text("1", "mi", "ft"), "5280");
  assert.equal(text("1", "nmi", "m"), "1852");
  assert.equal(text("1", "lb", "kg"), "0.45359237");
  assert.equal(text("1", "oz", "lb"), "0.0625");
  assert.equal(text("1", "st", "lb"), "14");
  assert.equal(text("1", "t", "kg"), "1000");
  assert.equal(text("1", "gal_us", "in3"), "231");
  assert.equal(text("1", "gal_imp", "l"), "4.54609");
  assert.equal(text("1", "acre", "ft2"), "43560");
  assert.equal(text("1", "ha", "m2"), "10000");
  assert.equal(text("1", "week", "day"), "7");
  assert.equal(text("1", "day", "h"), "24");
  assert.equal(text("1", "h", "min"), "60");
  assert.equal(text("1", "year", "day"), "365.25");
  assert.equal(findUnit("year").definedAs, "365.25 d", "the Julian year is the one offered");
});

test("the three benchmarks named in the brief", () => {
  assert.equal(text("1", "in", "cm"), "2.54");
  assert.equal(text("0", "c", "f"), "32");
  const kph = converted("100", "kmh", "mps");
  assert.equal(kph.text, "27.7777777778");
  assert.equal(Number(kph.result.toFixed(4)), 27.7778);
  assert.equal(text("27.77777777777778", "mps", "kmh"), "100", "and back again");
  assert.equal(text("1", "mph", "mps"), "0.44704");
  assert.equal(text("1", "kn", "mps"), "0.514444444444");
});

test("area squares the length factor and volume cubes it", () => {
  const perFoot = converted("1", "m", "ft").result;
  near(converted("1", "m2", "ft2").result, perFoot * perFoot, 1e-12, "m²→ft² is the square: ");
  near(converted("1", "m3", "ft3").result, perFoot ** 3, 1e-12, "m³→ft³ is the cube: ");
  assert.equal(text("1", "m2", "ft2"), "10.7639104167");
  assert.equal(text("1", "m3", "ft3"), "35.3146667215");
  assert.equal(text("1", "ft2", "in2"), "144");
  assert.equal(text("1", "ft3", "in3"), "1728");
  assert.equal(text("1", "yd2", "ft2"), "9");
  assert.equal(text("1", "mi2", "acre"), "640");
  assert.equal(text("1", "km2", "ha"), "100");
  assert.equal(text("1", "m3", "l"), "1000");
  assert.equal(text("1", "m3", "ml"), "1000000");
  // The cubic inch is the bridge between the two gallon definitions.
  assert.equal(text("1", "in3", "ml"), "16.387064");
  assert.equal(text("1", "ft3", "l"), "28.316846592");
});

test("temperature is affine, so it never reports a multiplier", () => {
  assert.equal(text("0", "c", "f"), "32");
  assert.equal(text("100", "c", "f"), "212");
  assert.equal(text("-40", "c", "f"), "-40", "the point where the scales cross");
  assert.equal(text("25", "c", "f"), "77");
  assert.equal(text("0", "c", "k"), "273.15");
  assert.equal(text("0", "c", "r"), "491.67");
  // A ratio would give 10 × 5/9 = 18 here; the offset formula gives 50.
  assert.equal(text("10", "c", "f"), "50");
  for (const from of unitsIn("temperature").map((unit) => unit.id)) {
    for (const to of unitsIn("temperature").map((unit) => unit.id)) {
      const result = converted("100", from, to);
      assert.equal(result.factor, null, from + "→" + to + " must not claim a factor");
      assert.equal(result.factorText, null, from + "→" + to + " must not display a factor");
    }
  }
  assert.equal(baseFactor(findUnit("c")), null);
  assert.equal(baseFactor(findUnit("m")), 1);
});

test("temperature stays exact for the readings people actually type", () => {
  // Every one of these is a clean value in double arithmetic only if the offset
  // path is kept integral; the obvious (x + 459.67) × 5/9 form shows 3.2e-14 °C.
  assert.equal(text("32", "f", "c"), "0");
  assert.equal(text("212", "f", "c"), "100");
  assert.equal(text("98.6", "f", "c"), "37");
  assert.equal(text("37", "c", "f"), "98.6");
  assert.equal(text("273.15", "k", "c"), "0");
  assert.equal(text("-273.15", "c", "k"), "0");
  assert.equal(text("-459.67", "f", "c"), "-273.15");
  assert.equal(text("-459.67", "f", "k"), "0");
  assert.equal(text("0", "k", "c"), "-273.15");
  assert.equal(text("0", "k", "f"), "-459.67");
  assert.equal(text("100", "c", "r"), "671.67");
  assert.equal(text("212", "f", "k"), "373.15");
  assert.equal(converted("0", "c", "f").baseValue, 273.15);
  assert.equal(converted("32", "f", "c").result, 0, "not 5.68e-14");
});

test("absolute zero bounds the input, and zero kelvin itself is a valid reading", () => {
  assert.deepEqual(refused("-300", "c", "f"), { code: "belowAbsoluteZero", limit: -273.15 });
  assert.deepEqual(refused("-500", "f", "c"), { code: "belowAbsoluteZero", limit: -459.67 });
  assert.deepEqual(refused("-1", "k", "c"), { code: "belowAbsoluteZero", limit: 0 });
  assert.deepEqual(refused("-0.1", "r", "k"), { code: "belowAbsoluteZero", limit: 0 });
  assert.equal(text("-273.15", "c", "f"), "-459.67");
  assert.equal(text("0", "k", "r"), "0");
  // The same refusal arrives whichever unit is entered, because the bound is physical.
  for (const id of ["c", "f", "k", "r"]) {
    assert.equal(refused("-1e3", id, id === "c" ? "f" : "c").code, "belowAbsoluteZero");
  }
  // Length and mass have no such floor here: a negative reading still converts.
  assert.equal(text("-2.5", "m", "cm"), "-250");
  assert.equal(text("-3", "kg", "g"), "-3000");
});

test("decimals, signs and scientific notation are read as typed", () => {
  assert.equal(text("1e3", "m", "km"), "1");
  assert.equal(text(".5", "m", "cm"), "50");
  assert.equal(text("7.", "m", "cm"), "700");
  assert.equal(text("+2", "km", "m"), "2000");
  assert.equal(text("1.5E-2", "m", "cm"), "1.5");
  assert.equal(text("  42  ", "m", "ft"), "137.795275591");
  assert.equal(text("-0", "m", "ft"), "0", "negative zero is still zero");
  assert.equal(text("0", "m", "ft"), "0");
  assert.equal(text("0", "c", "k"), "273.15", "zero is not zero on an offset scale");
  // The exact decimal is kept beside the double so the offset path can stay integral.
  const parts = parseQuantity("98.6");
  assert.deepEqual({ scaled: parts.scaled, denominator: parts.denominator }, { scaled: 986n, denominator: 10n });
  const small = parseQuantity("1.5e-7");
  assert.deepEqual({ scaled: small.scaled, denominator: small.denominator }, { scaled: 15n, denominator: 100000000n });
});

test("zero exponent digits do not become a nonzero mantissa", () => {
  for (const input of ["0e10", "-0e-20", "+0.000e9999999999999999999999999999999999999"])
    assert.equal(text(input, "m", "cm"), "0");
  assert.equal(text("0e300", "c", "f"), "32");
});

test("finite conversions survive extreme intermediate base magnitudes", () => {
  assert.equal(converted("1e308", "km", "km").result, 1e308);
  assert.equal(converted("5e-324", "mm", "mm").result, 5e-324);
  assert.equal(converted("1e307", "k", "k").result, 1e307);
  assert.equal(text("1e307", "k", "r"), "1.8e+307");
  assert.equal(converted("1e-310", "k", "k").result, 1e-310);
  assert.equal(converted("1e-100", "k", "k").result, 1e-100);
  assert.equal(converted("5e-324", "k", "k").result, 5e-324);
  assert.equal(text("1e-310", "k", "c"), "-273.15");
});

test("absolute-zero comparison retains all typed decimal digits", () => {
  assert.equal(refused("-273.15000000000001", "c", "k").code, "belowAbsoluteZero");
  assert.equal(refused("-459.67000000000001", "f", "k").code, "belowAbsoluteZero");
  assert.equal(refused("-1e-310", "k", "c").code, "belowAbsoluteZero");
  assert.equal(text("-273.15000000000000", "c", "k"), "0");
  assert.ok(converted("-273.14999999999999", "c", "k").result > 0);
});

test("anything ambiguous or non-numeric is refused rather than guessed", () => {
  const invalid = [
    "abc",
    "1,000",
    "1 000",
    "12 in",
    "1e",
    "--1",
    "0x10",
    "Infinity",
    "NaN",
    "1.2.3",
    ".",
    "-",
    "+",
    "1/2",
    "½",
    "٣",
    "１２",
    "1..0",
    "5%m",
    "3.2e4.5",
  ];
  for (const input of invalid)
    assert.equal(refused(input, "m", "ft").code, "invalid", "refused " + input);
  assert.equal(refused("", "m", "ft").code, "empty");
  assert.equal(refused("   ", "m", "ft").code, "empty", "whitespace is an empty box, not a zero");
  assert.equal(refused("\n\t", "c", "f").code, "empty");
  assert.equal(refused("1,5", "m", "ft").found, "1,5", "the offending text comes back for the message");
  assert.equal(refused("12 inches", "m", "ft").found, "12 inches");
  assert.equal(refused("a".repeat(40), "m", "ft").found.length, 25, "long junk is shortened");
});

test("overflow and underflow are named instead of shown as Infinity or 0", () => {
  assert.equal(refused("1e400", "m", "km").code, "overflow", "not representable as input");
  assert.equal(refused("1e308", "km", "mm").code, "overflow", "not representable as output");
  assert.equal(refused("1e-400", "m", "km").code, "underflow", "a real magnitude that no double holds");
  assert.equal(refused("5e-324", "m", "km").code, "underflow");
  assert.equal(text("1e300", "m", "km"), "1e+297", "huge but finite still converts");
  assert.equal(text("1e-300", "m", "km"), "1e-303");
  assert.equal(text("1e-300", "m", "mm"), "1e-297");
  // An offset scale cannot flatten a reading to nothing, so 0 K is never an underflow.
  assert.equal(text("-273.15", "c", "k"), "0");
});

test("no displayed number is NaN, empty, or a float tail", () => {
  // Rounding happens at display only, and it is what removes these tails.
  assert.equal(converted("1", "ft3", "l").result, 28.316846592000005);
  assert.equal(converted("1", "ft3", "l").text, "28.316846592");
  assert.equal(converted("1", "m", "ft").text, "3.28083989501");
  assert.equal(converted("1", "m", "ft").result, 3.280839895013123);
  assert.equal(converted("1", "mps", "kmh").text, "3.6", "the 3.5999999999999996 case");
  assert.equal(converted("1", "ton_uk", "kg").text, "1016.0469088");
  assert.equal(converted("1", "m2", "acre").text, "0.000247105381467");
  assert.equal(formatQuantity(-0), "0");
  assert.equal(formatQuantity(0), "0");
  assert.equal(formatQuantity(16.387064000000003), "16.387064");
  assert.equal(formatQuantity(Number.NaN), "", "an unrepresentable value renders as nothing");
  assert.equal(formatQuantity(Number.POSITIVE_INFINITY), "");
  assert.equal(formatQuantity(-1.5e-7), "-1.5e-7");

  for (const category of unitCategories) {
    const ids = unitsIn(category).map((unit) => unit.id);
    for (const from of ids) {
      for (const to of ids) {
        for (const input of ["0", "1", "2.5", "-7.125", "100", "98.6", "1e3", "1024"]) {
          const result = convert(input, from, to);
          if (!result.ok) {
            // Below absolute zero is the one refusal a temperature sweep produces.
            assert.equal(result.error.code, "belowAbsoluteZero", input + " " + from + "→" + to);
            continue;
          }
          assert.doesNotMatch(result.text, /NaN|Infinity|undefined/, from + "→" + to + " " + input);
          assert.notEqual(result.text, "", from + "→" + to + " " + input);
          assert.ok(
            sigDigits(result.text) <= displayDigits,
            result.text + " shows more than " + displayDigits + " significant digits",
          );
          assert.ok(
            sigDigits(result.baseText) <= displayDigits,
            result.baseText + " shows more than " + displayDigits + " significant digits",
          );
        }
      }
    }
  }
});

test("the full-precision value, not the rounded display, is what converts back", () => {
  const out = converted("1", "m", "ft");
  assert.equal(out.text, "3.28083989501");
  assert.notEqual(out.result, Number(out.text), "the display really is rounded");
  const fromEngine = converted(String(out.result), "ft", "m");
  const fromDisplay = converted(out.text, "ft", "m");
  near(fromEngine.result, 1, 1e-15, "the engine value returns to 1: ");
  near(fromDisplay.result, 1, 1e-12, "the display round-trips close but not exactly: ");
  assert.ok(
    Math.abs(fromDisplay.result - 1) > Math.abs(fromEngine.result - 1),
    "which is why the rounded display is never fed back",
  );
});

test("every pair in every category round-trips through the base unit", () => {
  const samples = ["1", "2.5", "-7.125", "100", "98.6", "1e3", "1024", "0.001"];
  for (const category of unitCategories) {
    const ids = unitsIn(category).map((unit) => unit.id);
    for (const from of ids) {
      for (const to of ids) {
        for (const input of samples) {
          const out = convert(input, from, to);
          if (!out.ok) {
            assert.equal(out.error.code, "belowAbsoluteZero", input + " " + from + "→" + to);
            continue;
          }
          const back = converted(String(out.result), to, from);
          near(back.result, Number(input), 1e-9, input + " " + from + "→" + to + "→" + from + ": ");
        }
      }
    }
  }
});

test("the table is well-formed and each category converts through one base", () => {
  assert.equal(units.length, 62);
  assert.equal(new Set(units.map((unit) => unit.id)).size, units.length, "ids are unique");
  assert.equal(new Set(units.map((unit) => unit.symbol)).size, units.length, "symbols are unique");
  for (const category of unitCategories) {
    const list = unitsIn(category);
    assert.ok(list.length >= 4, category + " needs a useful spread of units");
    const base = findUnit(baseIds[category]);
    assert.equal(base.category, category, category + " has a base inside itself");
    if (category === "temperature") assert.equal(baseFactor(base), null, "kelvin is the anchor");
    else assert.equal(baseFactor(base), 1, category + "'s base multiplies by 1");
    const kinds = new Set(list.map((unit) => unit.scale.kind));
    assert.equal(kinds.size, 1, category + " mixes linear and affine scales");
    assert.equal(
      kinds.has("affine"),
      category === "temperature",
      "only temperature is affine: " + category,
    );
    for (const unit of list) {
      const factor = baseFactor(unit);
      if (factor !== null) {
        assert.ok(Number.isFinite(factor) && factor > 0, unit.id + " has a usable factor");
      }
      assert.ok(unit.symbol.length > 0 && unit.id.length > 0);
    }
  }
  // A unit id is a message key, so a duplicate would silently shadow a translation.
  const keys = units.map((unit) => "unit." + unit.id);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(refused("1", "m", "kg").code, "mixedDimensions", "length is not mass");
  assert.equal(refused("1", "m", "nope").code, "unknownUnit");
  assert.equal(refused("1", "nope", "m").code, "unknownUnit");
});

test("US and Imperial quantities never merge and always say which", () => {
  const gallons = unitsIn("volume").filter((unit) => unit.symbol.startsWith("gal"));
  assert.equal(gallons.length, 2);
  assert.deepEqual(gallons.map((unit) => unit.symbol).sort(), ["gal (US)", "gal (imp)"]);
  assert.notEqual(baseFactor(findUnit("gal_us")), baseFactor(findUnit("gal_imp")));
  // 1 US gallon is 0.832674 Imperial gallons, so a bare "gal" would be a coin flip.
  assert.equal(text("1", "gal_us", "gal_imp"), "0.832674184629");
  assert.equal(text("1", "gal_imp", "l"), "4.54609");
  for (const unit of unitsIn("volume")) {
    if (/^(gal|qt|pt|fl oz)/.test(unit.symbol))
      assert.match(unit.symbol, /\((US|imp)\)$/, unit.symbol + " names its system");
  }
  assert.equal(text("1", "floz_us", "ml"), "29.5735295625");
  assert.equal(text("1", "floz_imp", "ml"), "28.4130625");
  assert.equal(text("1", "pt_imp", "floz_imp"), "20", "an Imperial pint is 20 fluid ounces");
  assert.equal(text("1", "pt_us", "floz_us"), "16", "a US pint is 16");
  assert.equal(text("1", "gal_imp", "floz_imp"), "160");
  assert.equal(text("1", "gal_us", "floz_us"), "128");
  // Three different tons, none of them called "ton".
  const tons = unitsIn("mass").filter((unit) => /^t(on)?/.test(unit.symbol));
  assert.deepEqual(tons.map((unit) => unit.symbol).sort(), ["t", "ton (UK)", "ton (US)"]);
  assert.equal(text("1", "ton_us", "kg"), "907.18474");
  assert.equal(text("1", "ton_uk", "kg"), "1016.0469088");
  assert.equal(text("1", "t", "ton_us"), "1.10231131092");
  assert.equal(text("1", "mi", "nmi"), "0.868976241901", "the statute and nautical mile differ");
});

test("nothing that is ambiguous or needs a live source is in the table", () => {
  const banned = /month|tablespoon|teaspoon|cup|mach|bps|knot\/|usd|euro|pound\s*sterling|£|\$|¥|汇率/i;
  for (const unit of units) {
    const haystack = unit.id + " " + unit.symbol + " " + (unit.definedAs ?? "");
    assert.doesNotMatch(haystack, banned, unit.id + " is excluded by design");
  }
  assert.equal(unitsIn("volume").find((unit) => unit.symbol === "gal"), undefined);
  assert.equal(units.find((unit) => unit.symbol === "ton"), undefined);
  assert.equal(units.find((unit) => unit.category === "currency"), undefined);
  assert.equal(unitCategories.includes("currency"), false, "exchange rates need live data");
});

test("the stated factor is the multiplier the result used", () => {
  for (const [from, to] of [
    ["m", "ft"],
    ["kmh", "mps"],
    ["gal_us", "l"],
    ["acre", "m2"],
    ["kg", "lb"],
    ["week", "sec"],
    ["m2", "ft2"],
    ["m3", "in3"],
  ]) {
    const one = converted("1", from, to);
    const seven = converted("7", from, to);
    assert.equal(one.factorText, formatQuantity(one.factor));
    near(seven.result, seven.value * one.factor, 1e-9, from + "→" + to + " scales linearly: ");
    near(one.factor, seven.result / 7, 1e-9, from + "→" + to + " factor is value-independent: ");
    const viaBase = baseFactor(findUnit(from)) / baseFactor(findUnit(to));
    near(one.factor, viaBase, 1e-15, from + "→" + to + " factor comes from the base units: ");
  }
  assert.equal(converted("1", "kmh", "mps").factorText, "0.277777777778");
  assert.equal(converted("1", "in", "cm").factorText, "2.54");
  assert.equal(converted("1", "kn", "mps").factorText, "0.514444444444");
  assert.equal(converted("1", "mph", "kmh").factorText, "1.609344");
});
