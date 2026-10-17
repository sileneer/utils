/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  errorExcerpt,
  formatJson,
  jsonLimits,
  locate,
  parseJson,
  serializeJson,
} = require("../src/lib/tools/json.ts");

const pretty = (source, indent = "2") => {
  const result = formatJson(source, { mode: "pretty", indent });
  assert.equal(result.ok, true, "expected valid JSON: " + JSON.stringify(result.error ?? null));
  return result.text;
};
const minified = (source) => {
  const result = formatJson(source, { mode: "minified", indent: "2" });
  assert.equal(result.ok, true, "expected valid JSON");
  return result.text;
};
const failure = (source) => {
  const parsed = parseJson(source);
  assert.equal(parsed.ok, false, "expected a rejection for " + JSON.stringify(source));
  return parsed.error;
};

test("top-level values include objects, arrays and every scalar", () => {
  assert.equal(minified('{"a":1}'), '{"a":1}');
  assert.equal(minified("[1,2,3]"), "[1,2,3]");
  assert.equal(minified('"text"'), '"text"');
  assert.equal(minified("42"), "42");
  assert.equal(minified("true"), "true");
  assert.equal(minified("false"), "false");
  assert.equal(minified("null"), "null");
  assert.equal(minified("  -0  "), "-0");
  assert.equal(minified("[]"), "[]");
  assert.equal(minified("{}"), "{}");
  assert.deepEqual(
    Object.keys(parseJson('{"a":[]}').stats),
    ["objects", "arrays", "keys", "values", "depth"],
  );
  const stats = parseJson('{"a":[1,{"b":2}],"c":null}');
  assert.deepEqual(stats.stats, { objects: 2, arrays: 1, keys: 3, values: 3, depth: 4 });
});

test("empty input is its own answer, not a parse error", () => {
  assert.deepEqual(failure(""), { code: "empty", line: 1, column: 1 });
  assert.equal(failure("   \n\t ").code, "empty");
  assert.equal(parseJson("null").ok, true);
});

test("numbers are printed from their own source text", () => {
  const raws = [
    "123456789012345678901234567890",
    "9007199254740993",
    "-0",
    "1e2",
    "1E+2",
    "1.0",
    "0.1000000000000000000000001",
    "-1.5e-7",
    "0.30000000000000004",
    "1000000000000000000000.5",
  ];
  for (const raw of raws) {
    const document = '{"n":' + raw + "}";
    assert.equal(minified(document), '{"n":' + raw + "}", "minified must keep " + raw);
    assert.match(pretty(document), new RegExp('"n": ' + raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "m"));
  }
  // The trap this exists to avoid: JSON.parse/stringify rewrites several of them.
  const lossy = raws.filter(
    (raw) => JSON.stringify(JSON.parse('{"n":' + raw + "}").n) !== raw,
  );
  assert.ok(lossy.includes("-0") && lossy.includes("1e2"), "expected some lossy numbers: " + lossy);
  assert.ok(
    lossy.includes("123456789012345678901234567890"),
    "a 30-digit integer must be one of them",
  );
});

test("strings keep their escapes and their decoded meaning", () => {
  const cases = [
    ['"\\u4e2d\\u6587"', "中文"],
    ['"a\\/b"', "a/b"],
    ['"line\\nnext"', "line\nnext"],
    ['"tab\\there"', "tab\there"],
    ['"quote\\"inside"', 'quote"inside'],
    ['"back\\\\slash"', "back\\slash"],
    ['"🎉 party"', "🎉 party"],
    ['"\\ud83d\\ude00"', "😀"],
    ['"\\u0000 sentinel"', "\u0000 sentinel"],
  ];
  for (const [source, decoded] of cases) {
    const text = source;
    const printed = minified(text);
    assert.equal(printed, text, "raw escape text must survive");
    const parsed = parseJson(text);
    assert.ok(parsed.ok);
    const value = parsed.root.kind === "array" ? parsed.root.items[0] : parsed.root;
    assert.equal(value.value, decoded, "decoded value for " + text);
  }
});

test("member order is preserved and never sorted", () => {
  const source = '{"z":1,"a":2,"m":3,"B":4,"0":5}';
  assert.equal(minified(source), source);
  assert.deepEqual(
    [...pretty(source).matchAll(/"(\w+)":/g)].map((match) => match[1]),
    ["z", "a", "m", "B", "0"],
  );
});

test("a duplicate key is reported, not silently overwritten", () => {
  const error = failure('{"a":1,"b":2,"a":3}');
  assert.equal(error.code, "duplicateKey");
  assert.equal(error.key, "a");
  assert.equal(error.line, 1);
  assert.equal(error.column, 14);
  assert.equal(error.otherColumn, 2);
  // Escaped spellings of the same name are still the same key.
  assert.equal(failure('{"a":1,"\\u0061":2}').code, "duplicateKey");
  // Different nesting levels are different objects, so they are allowed.
  assert.equal(parseJson('{"a":{"b":1},"c":{"b":2}}').ok, true);
  assert.equal(parseJson('{"a":1,"b":2,"c":3}').ok, true);
  // Nothing is printed while a duplicate is present.
  assert.equal(formatJson('{"a":1,"a":2}', { mode: "pretty", indent: "2" }).ok, false);
});

test("malformed input is refused with a position instead of repaired", () => {
  const cases = [
    ['{"a":1,}', "trailingComma"],
    ["[1,2,]", "trailingComma"],
    ['{"a" 1}', "missingColon"],
    ['{"a":1 "b":2}', "missingComma"],
    ["[1 2]", "missingComma"],
    ['{"a":}', "unexpectedToken"],
    ['"unterminated', "unexpectedEnd"],
    ["{", "unexpectedEnd"],
    ['"\\x20"', "badEscape"],
    ['"raw\nbreak"', "badEscape"],
    ["01", "badNumber"],
    ["1.", "badNumber"],
    [".5", "unexpectedToken"],
    ["+1", "unexpectedToken"],
    ["tru", "unexpectedToken"],
    ["nulll", "unexpectedToken"],
    ["{} {}", "extraData"],
    ["[1],", "extraData"],
    ['{"a":// comment\n1}', "unexpectedToken"],
    ["{'single':1}", "unexpectedToken"],
    ["NaN", "unexpectedToken"],
    ["Infinity", "unexpectedToken"],
  ];
  for (const [source, code] of cases) {
    assert.equal(failure(source).code, code, "for " + JSON.stringify(source));
  }
});

test("errors point at the right line and column", () => {
  const source = '{\n  "a": 1,\n  "b": [1, 2,],\n  "c": 3\n}';
  const error = failure(source);
  assert.equal(error.code, "trailingComma");
  assert.equal(error.line, 3);
  assert.equal(error.column, 14);
  assert.deepEqual(locate(source, 0), { line: 1, column: 1 });
  assert.deepEqual(locate("a\r\nb", 3), { line: 2, column: 1 });
  const excerpt = errorExcerpt(source, error);
  assert.equal(excerpt.text, '  "b": [1, 2,],');
  // One caret, under the offending column (1-based, this line starts at column 1).
  assert.equal(excerpt.caret.replace(/\^/g, "").length, excerpt.caret.length - 1);
  assert.equal(excerpt.caret.indexOf("^") + 1, error.column);
});

test("long lines are centred on the column for the excerpt", () => {
  const source = '{"a":"' + "x".repeat(400) + '",}';
  const error = failure(source);
  const excerpt = errorExcerpt(source, error);
  assert.ok(excerpt.text.length <= jsonLimits.excerpt + 2, excerpt.text.length);
  assert.ok(excerpt.text.includes("…"));
  assert.ok(excerpt.caret.includes("^"));
  assert.equal(errorExcerpt("", { code: "empty", line: 99, column: 1 }), null);
});

test("size and depth are bounded so the tab cannot be wedged", () => {
  const deep = "[".repeat(jsonLimits.depth) + "]".repeat(jsonLimits.depth);
  assert.equal(parseJson(deep).ok, true);
  assert.equal(failure("[".repeat(jsonLimits.depth + 5) + "]".repeat(jsonLimits.depth + 5)).code, "tooDeep");
  const big = '"' + "x".repeat(jsonLimits.characters + 10) + '"';
  assert.equal(failure(big).code, "tooLarge");
  assert.equal(failure(big).found, String(jsonLimits.characters));
  // A document just inside the limit still parses.
  assert.equal(parseJson('"' + "x".repeat(100_000) + '"').ok, true);
});

test("pretty printing uses the chosen indent and is stable", () => {
  const source = '{"a":[1,2],"b":{"c":true,"d":null}}';
  assert.equal(
    pretty(source, "2"),
    '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": true,\n    "d": null\n  }\n}',
  );
  const tabbed = pretty(source, "tab");
  assert.ok(tabbed.includes('\n\t"a": ['));
  assert.ok(tabbed.includes("\n\t\t1,"));
  assert.equal(pretty(source, "2"), pretty(pretty(source, "2"), "2"), "formatting is idempotent");
  assert.equal(minified(pretty(source, "tab")), minified(source), "minifying pretty output");
  assert.equal(pretty('{"a":{},"b":[],"c":[]}', "2").includes("{}"), true);
});

test("four-space output indents one, two and three levels correctly", () => {
  const source = '{"a":{"b":[1]}}';
  assert.equal(
    pretty(source, "4"),
    '{\n    "a": {\n        "b": [\n            1\n        ]\n    }\n}',
  );
});

test("output structure matches JSON.parse for ordinary documents", () => {
  const documents = [
    '{"name":"中文","items":[1,2.5,true,false,null],"nested":{"a":{"b":[{}]}}}',
    '[[],{},[{"a":"b"}],0]',
    '{"escaped":"a\\nb\\tc\\u00e9\\"/"}',
    '"top level string"',
    "-12.5e3",
  ];
  for (const document of documents) {
    for (const style of ["2", "4", "tab"]) {
      assert.deepEqual(
        JSON.parse(pretty(document, style)),
        JSON.parse(document),
        "pretty output must parse to the same value",
      );
    }
    assert.deepEqual(JSON.parse(minified(document)), JSON.parse(document));
  }
});

test("serializeJson works on a parsed tree directly", () => {
  const parsed = parseJson('{"a":[1,2]}');
  assert.ok(parsed.ok);
  assert.equal(serializeJson(parsed.root, { mode: "minified", indent: "2" }), '{"a":[1,2]}');
  assert.equal(
    serializeJson(parsed.root, { mode: "pretty", indent: "tab" }),
    '{\n\t"a": [\n\t\t1,\n\t\t2\n\t]\n}',
  );
});

test("CR, LF and CRLF share one line-location and excerpt convention", () => {
  for (const eol of ["\r", "\n", "\r\n"]) {
    const source = ["[", "  1,", "  2,", "]"].join(eol);
    const error = failure(source);
    assert.equal(error.code, "trailingComma");
    assert.equal(error.line, 4);
    assert.equal(error.column, 1);
    assert.deepEqual(errorExcerpt(source, error), { text: "]", caret: "^" });
  }
  const source = '{"a"';
  const error = failure(source);
  assert.equal(error.column, source.length + 1);
  assert.equal(errorExcerpt(source, error).caret.indexOf("^"), source.length);
});

test("indent expansion is refused before allocating a huge result", () => {
  const source = "[".repeat(199) + Array(20000).fill("0").join(",") + "]".repeat(199);
  assert.ok(source.length < jsonLimits.characters);
  const result = formatJson(source, { mode: "pretty", indent: "4" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "outputTooLarge");
  assert.equal(result.error.found, String(jsonLimits.output));
  assert.equal(minified(source), source, "minification remains usable without indentation");
  assert.equal(formatJson(source, { mode: "pretty", indent: "tab" }).ok, true);
});

test("chinese and mixed-script documents round-trip with counts", () => {
  const source = '{"标题":"高性价比人生指南","条目":["睡眠","运动"],"数量":3}';
  const result = formatJson(source, { mode: "pretty", indent: "2" });
  assert.ok(result.ok);
  assert.equal(result.stats.keys, 3);
  assert.equal(result.stats.depth, 3);
  assert.ok(result.text.includes("高性价比人生指南"));
  assert.deepEqual(JSON.parse(result.text), JSON.parse(source));
});
