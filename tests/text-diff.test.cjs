/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  diffLines,
  diffInputProblem,
  splitLines,
  eolLabel,
  tokenizeWords,
  inlineParts,
  unifiedDiff,
  limits,
} = require("../src/lib/tools/diff.ts");

const off = { ignoreCase: false, ignoreTrailingWhitespace: false };
/** `-1` disables context collapsing so a test can see every aligned line. */
const shown = { ...off, context: -1 };

/** Brute-force LCS length, kept here so the engine's minimality is checked. */
function lcs(a, b) {
  const width = b.length + 1;
  const dp = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  return dp[0];
}

/** Every line the rows show, per side, so nothing can be lost or invented. */
function sides(rows) {
  const left = [];
  const right = [];
  for (const row of rows) {
    if (row.kind === "gap" || row.kind === "cap")
      throw new Error("unexpected " + row.kind + " row");
    if (row.left) left.push(row.left.text);
    if (row.right) right.push(row.right.text);
  }
  return { left, right };
}

test("line splitting keeps each ending and a missing final newline", () => {
  assert.deepEqual(splitLines(""), []);
  assert.deepEqual(splitLines("a"), [{ text: "a", eol: "", number: 1 }]);
  assert.deepEqual(splitLines("\n").map((l) => l.eol), ["\n"]);
  assert.deepEqual(
    splitLines("a\r\nb\rc\nd").map((l) => [l.text, l.eol, l.number]),
    [
      ["a", "\r\n", 1],
      ["b", "\r", 2],
      ["c", "\n", 3],
      ["d", "", 4],
    ],
  );
  assert.deepEqual(splitLines("a\n").map((l) => l.text), ["a"]);
  assert.deepEqual(splitLines("a\n\nb").map((l) => l.text), ["a", "", "b"]);
  assert.deepEqual(
    splitLines("a\nb").map((l) => l.number),
    [1, 2],
  );
  assert.deepEqual(
    splitLines("😀x").map((l) => l.text),
    ["😀x"],
  );
  assert.equal(eolLabel("\r\n"), "CRLF");
  assert.equal(eolLabel("\n"), "LF");
  assert.equal(eolLabel("\r"), "CR");
  assert.equal(eolLabel(""), "none");
});

test("empty, identical and one-sided inputs stay explicit", () => {
  const empty = diffLines("", "", off);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.identical, true);
  assert.equal(empty.stats.hunks, 0);
  assert.deepEqual(
    { ...empty.stats },
    {
      added: 0,
      removed: 0,
      unchanged: 0,
      hunks: 0,
      leftLines: 0,
      rightLines: 0,
    },
  );

  const same = diffLines("a\nb\nc\n", "a\nb\nc\n", off);
  assert.equal(same.identical, true);
  assert.equal(same.stats.unchanged, 3);
  assert.deepEqual(same.rows, [{ kind: "gap", hunk: 0, lines: 3 }]);
  assert.deepEqual(
    diffLines("a\nb\nc\n", "a\nb\nc\n", shown).rows.map((r) => r.kind),
    ["equal", "equal", "equal"],
  );

  const allAdded = diffLines("", "one\ntwo\n", off);
  assert.equal(allAdded.stats.added, 2);
  assert.equal(allAdded.stats.removed, 0);
  assert.deepEqual(
    sides(allAdded.rows).right,
    ["one", "two"],
  );
  const allRemoved = diffLines("one\ntwo\n", "", off);
  assert.equal(allRemoved.stats.removed, 2);
  assert.equal(allRemoved.stats.added, 0);
  assert.deepEqual(
    sides(allRemoved.rows).left,
    ["one", "two"],
  );
});

test("added, removed and changed lines are distinguished with line numbers", () => {
  const original = "keep\nremove\nsame\n";
  const changed = "keep\nsame\ninsert\n";
  const result = diffLines(original, changed, shown);
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ["equal", "delete", "equal", "insert"],
  );
  assert.deepEqual(
    result.rows.map((row) => [row.hunk, row.left?.number ?? null, row.right?.number ?? null]),
    [
      [0, 1, 1],
      [1, 2, null],
      [0, 3, 2],
      [2, null, 3],
    ],
  );
  assert.deepEqual(sides(result.rows), {
    left: ["keep", "remove", "same"],
    right: ["keep", "same", "insert"],
  });
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.removed, 1);
  assert.equal(result.stats.hunks, 2);
  assert.equal(result.coarse, false);
});

test("paired differences become one changed row with inline marks", () => {
  const result = diffLines(
    "line one\nthe quick brown fox\nline three\n",
    "line one\nthe quick red fox\nline three\n",
    shown,
  );
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ["equal", "change", "equal"],
  );
  assert.equal(result.stats.hunks, 1);
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.removed, 1);
  const row = result.rows[1];
  assert.equal(row.endingOnly, false);
  assert.deepEqual(row.leftParts, [
    { text: "the quick ", changed: false },
    { text: "brown", changed: true },
    { text: " fox", changed: false },
  ]);
  assert.deepEqual(row.rightParts, [
    { text: "the quick ", changed: false },
    { text: "red", changed: true },
    { text: " fox", changed: false },
  ]);
  assert.equal(row.left.text, "the quick brown fox");
  assert.equal(row.right.text, "the quick red fox");
});

test("many changed lines in one block pair up line by line", () => {
  const result = diffLines("a\nb\nc\nd\n", "a\nx\ny\nz\n", off);
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    ["equal", "change", "change", "change"],
  );
  assert.equal(result.stats.removed, 3);
  assert.equal(result.stats.added, 3);
  assert.equal(result.stats.hunks, 1);
});

test("surplus lines in an uneven block stay plain inserts", () => {
  const result = diffLines("a\nb\n", "x\ny\nz\n", off);
  assert.deepEqual(
    result.rows.map((row) => [row.kind, row.hunk]),
    [
      ["change", 1],
      ["change", 1],
      ["insert", 1],
    ],
  );
  assert.equal(result.stats.removed, 2);
  assert.equal(result.stats.added, 3);
  assert.equal(result.stats.hunks, 1);
});

test("unchanged runs collapse to gaps and counts stay whole-file", () => {
  const original = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n") + "\n";
  const changed = original.replace("l14", "L14");
  const result = diffLines(original, changed, off);
  assert.equal(result.stats.unchanged, 29);
  assert.equal(result.stats.hunks, 1);
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    [
      "gap",
      "equal",
      "equal",
      "equal",
      "change",
      "equal",
      "equal",
      "equal",
      "gap",
    ],
  );
  assert.deepEqual(
    result.rows.filter((row) => row.kind === "gap").map((row) => row.lines),
    [11, 12],
  );
  assert.equal(
    result.rows.filter((row) => row.kind !== "gap" && row.kind !== "equal").length,
    1,
  );
});

test("line endings are treated as a difference and flagged as ending-only", () => {
  const trailing = diffLines("a\nb\n", "a\nb", shown);
  assert.equal(trailing.stats.hunks, 1);
  assert.equal(trailing.rows[1].kind, "change");
  assert.equal(trailing.rows[1].endingOnly, true);
  assert.equal(trailing.rows[1].leftParts, null);
  assert.equal(trailing.rows[1].left.eol, "\n");
  assert.equal(trailing.rows[1].right.eol, "");

  // Contiguous differences form one hunk, even when every line is inside it.
  const unix = diffLines("a\nb\nc\n", "a\r\nb\r\nc\r\n", shown);
  assert.equal(unix.stats.hunks, 1);
  assert.deepEqual(
    unix.rows.map((row) => [row.kind, row.endingOnly ?? null]),
    [
      ["change", true],
      ["change", true],
      ["change", true],
    ],
  );
  assert.deepEqual(
    sides(unix.rows).left,
    ["a", "b", "c"],
  );
  assert.deepEqual(
    unix.rows.map((row) => [eolLabel(row.left.eol), eolLabel(row.right.eol)]),
    [
      ["LF", "CRLF"],
      ["LF", "CRLF"],
      ["LF", "CRLF"],
    ],
  );

  const classic = diffLines("a\rb\rc\r", "a\nb\nc\n", shown);
  assert.equal(classic.stats.hunks, 1);
  assert.equal(classic.rows.every((row) => row.endingOnly), true);

  // One line among unchanged neighbours is still reported on its own.
  const mixed = diffLines("a\nb\nc\n", "a\r\nb\nc\n", shown);
  assert.equal(mixed.stats.hunks, 1);
  assert.deepEqual(
    mixed.rows.map((row) => [row.kind, row.endingOnly ?? null]),
    [
      ["change", true],
      ["equal", null],
      ["equal", null],
    ],
  );
});

test("the two options change the comparison without rewriting the text", () => {
  const plain = diffLines("Hello\nWORLD\n", "hello\nworld\n", off);
  assert.equal(plain.stats.hunks, 1);
  assert.equal(plain.stats.removed, 2);
  assert.equal(plain.stats.added, 2);
  const ignoring = diffLines("Hello\nWORLD\n", "hello\nworld\n", {
    ...off,
    ignoreCase: true,
    context: -1,
  });
  assert.equal(ignoring.identical, true);
  assert.equal(ignoring.stats.unchanged, 2);
  assert.deepEqual(
    sides(ignoring.rows).left,
    ["Hello", "WORLD"],
  );

  const spaced = diffLines("a  \nb", "a\nb", shown);
  assert.equal(spaced.stats.hunks, 1);
  assert.equal(spaced.rows[0].kind, "change");
  assert.equal(spaced.rows[0].endingOnly, false);
  assert.deepEqual(spaced.rows[0].leftParts, [
    { text: "a", changed: false },
    { text: "  ", changed: true },
  ]);
  const trimmed = diffLines("a  \nb", "a\nb", {
    ...off,
    ignoreTrailingWhitespace: true,
  });
  assert.equal(trimmed.identical, true);
  assert.deepEqual(
    sides(
      diffLines("a  \nb", "a\nb", {
        ...off,
        ignoreTrailingWhitespace: true,
        context: -1,
      }).rows,
    ).left,
    ["a  ", "b"],
  );
  // Leading whitespace is deliberately not ignored.
  assert.equal(
    diffLines("  a", "a", { ...off, ignoreTrailingWhitespace: true }).stats.hunks,
    1,
  );
});

test("word tokens split CJK per character and keep emoji sequences whole", () => {
  assert.deepEqual(tokenizeWords("我喜欢猫"), ["我", "喜", "欢", "猫"]);
  assert.deepEqual(tokenizeWords("read 中文 ok"), ["read", " ", "中", "文", " ", "ok"]);
  assert.deepEqual(tokenizeWords("👨‍👩‍👧 family"), ["👨‍👩‍👧", " ", "family"]);
  assert.deepEqual(tokenizeWords("🇨🇳🇺🇸 flags"), ["🇨🇳🇺🇸", " ", "flags"]);
  assert.deepEqual(tokenizeWords("a,b.c"), ["a", ",", "b", ".", "c"]);
  for (const sample of [
    "我喜欢猫 👨‍👩‍👧🇨🇳 emoji",
    "line\twith   spaces",
    "𝒘𝒂𝒗𝒆 dash- and_underscore",
  ]) {
    assert.equal(tokenizeWords(sample).join(""), sample);
    // No token may end or start with half of a surrogate pair.
    for (const token of tokenizeWords(sample))
      assert.equal(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(
          token,
        ),
        false,
        "surrogate half in " + JSON.stringify(token),
      );
  }
});

test("inline parts mark only the differing words", () => {
  assert.deepEqual(inlineParts("the quick brown fox", "the quick red fox", false), {
    left: [
      { text: "the quick ", changed: false },
      { text: "brown", changed: true },
      { text: " fox", changed: false },
    ],
    right: [
      { text: "the quick ", changed: false },
      { text: "red", changed: true },
      { text: " fox", changed: false },
    ],
  });
  assert.deepEqual(inlineParts("我喜欢猫", "我喜欢狗", false), {
    left: [
      { text: "我喜欢", changed: false },
      { text: "猫", changed: true },
    ],
    right: [
      { text: "我喜欢", changed: false },
      { text: "狗", changed: true },
    ],
  });
  assert.deepEqual(inlineParts("Cat", "cat", true), {
    left: [{ text: "Cat", changed: false }],
    right: [{ text: "cat", changed: false }],
  });
  assert.deepEqual(inlineParts("same", "same", false).left, [
    { text: "same", changed: false },
  ]);
  const long = Array.from({ length: 700 }, (_, i) => `w${i}`).join(" ");
  assert.equal(inlineParts(long, long + " extra", false), null);
});

test("html and control-looking text stay plain strings", () => {
  const original = '<img src=x onerror="alert(1)">\nplain\n';
  const changed = '<img src=x onerror="alert(2)">\nplain\n';
  const result = diffLines(original, changed, shown);
  assert.equal(result.rows[0].kind, "change");
  assert.equal(result.rows[0].left.text, '<img src=x onerror="alert(1)">');
  assert.equal(
    result.rows[0].leftParts.some((part) => part.text.includes("<img")),
    true,
  );
  assert.equal(unifiedDiff(original, changed, off).includes("<img"), true);
});

test("size guards report which limit was hit", () => {
  const big = "x".repeat(limits.chars + 1);
  assert.equal(diffInputProblem(big, "a"), "chars");
  assert.equal(diffInputProblem("a", big), "chars");
  assert.equal(diffInputProblem("x".repeat(limits.chars), "a"), null);
  const manyLines = Array.from({ length: limits.lines + 1 }, () => "l").join("\n");
  assert.equal(diffInputProblem(manyLines, "a"), "lines");
  assert.equal(diffInputProblem("a\n", "a\n"), null);
  assert.equal(diffInputProblem("", ""), null);
});

test("an unalignable range degrades to one coarse block instead of stalling", () => {
  // No line repeats usefully on both sides and the middle exceeds the cell
  // budget, so the engine must report one coarse block rather than keep working.
  const original = Array.from({ length: 1500 }, () => "same-line").join("\n") + "\n";
  const changed = Array.from({ length: 3000 }, () => "other-line").join("\n") + "\n";
  const started = Date.now();
  const result = diffLines(original, changed, off);
  assert.equal(result.coarse, true);
  assert.equal(result.stats.hunks, 1);
  assert.equal(result.stats.removed, 1500);
  assert.equal(result.stats.added, 3000);
  assert.equal(result.capped, true);
  assert.equal(result.rows.length, limits.rows + 1);
  assert.equal(result.rows[limits.rows].kind, "cap");
  assert.ok(Date.now() - started < 30_000, "stayed bounded");
});

test("paired coarse lines become changed rows, not a delete and an insert", () => {
  const original = Array.from({ length: 1500 }, () => "same-line").join("\n") + "\n";
  const changed = Array.from({ length: 1500 }, () => "other-line").join("\n") + "\n";
  const result = diffLines(original, changed, off);
  assert.equal(result.coarse, true);
  assert.equal(result.rows.length, 1500);
  assert.equal(result.capped, false);
  assert.equal(
    result.rows.every((row) => row.kind === "change"),
    true,
  );
});

test("repeated lines still align when the budget allows it", () => {
  const result = diffLines(
    Array.from({ length: 400 }, () => "same-line").join("\n") + "\n",
    Array.from({ length: 401 }, () => "same-line").join("\n") + "\n",
    off,
  );
  assert.equal(result.coarse, false);
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.unchanged, 400);
});

test("view bounds are enforced and reported when rows are dropped", () => {
  const original = Array.from({ length: 2500 }, (_, i) => `a${i}`).join("\n") + "\n";
  const changed = Array.from({ length: 2500 }, (_, i) => `b${i}`).join("\n") + "\n";
  const result = diffLines(original, changed, off);
  assert.equal(result.capped, true);
  assert.equal(result.rows.length, limits.rows + 1);
  assert.equal(result.rows[limits.rows].kind, "cap");
  assert.equal(result.stats.hunks, 1);
});

test("unaligned fuzz keeps every line of both texts and matches a minimal LCS", () => {
  let seed = 12345;
  const next = (limit) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return Math.floor((seed / 2147483648) * limit);
  };
  for (let run = 0; run < 200; run++) {
    const pool = ["alpha", "beta", "gamma", "delta", "ελληνικά", "中文行", "🎉 party", "", "  "];
    const make = () =>
      Array.from({ length: next(14) }, () => pool[next(pool.length)] + next(50)).join("\n");
    const original = make();
    const changed = make();
    const options = {
      ignoreCase: run % 3 === 0,
      ignoreTrailingWhitespace: run % 4 === 0,
      context: -1,
    };
    const result = diffLines(original, changed, options);
    const rows = result.rows.filter((row) => row.kind !== "gap");
    assert.deepEqual(
      sides(rows).left,
      splitLines(original).map((line) => line.text),
      "left side lost or invented a line",
    );
    assert.deepEqual(
      sides(rows).right,
      splitLines(changed).map((line) => line.text),
      "right side lost or invented a line",
    );
    assert.equal(result.capped, false);
    assert.equal(result.coarse, false);
    const keys = (text) =>
      splitLines(text).map((line) => {
        let value = line.text;
        if (options.ignoreCase) value = value.toLowerCase();
        if (options.ignoreTrailingWhitespace) value = value.replace(/\s+$/, "");
        return `${value}\u0000${{ "\r\n": "2", "\n": "1", "\r": "3", "": "0" }[line.eol]}`;
      });
    const equalRows = rows.filter((row) => row.kind === "equal").length;
    assert.equal(
      equalRows,
      lcs(keys(original), keys(changed)),
      "the alignment is not minimal for run " + run,
    );
    assert.equal(result.stats.unchanged, equalRows);
    assert.equal(result.stats.leftLines, splitLines(original).length);
    assert.equal(result.stats.rightLines, splitLines(changed).length);
    assert.equal(
      result.stats.hunks,
      rows.reduce((count, row, i) => count + (row.hunk > 0 && rows[i - 1]?.hunk !== row.hunk ? 1 : 0), 0),
    );
  }
});

test("the unified copy text carries context and +/- markers", () => {
  const original = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n";
  const changed = "one\ntwo\nTHREE\nfour\nfive\nsix\nseven\nadded\neight\n";
  assert.equal(
    unifiedDiff(original, changed, off),
    [
      "  one",
      "  two",
      "- three",
      "+ THREE",
      "  four",
      "  five",
      "  six",
      "  seven",
      "+ added",
      "  eight",
    ].join("\n"),
  );
  assert.equal(unifiedDiff("a\n", "a\n", off), "");
  assert.equal(unifiedDiff("", "a\nb\n", off), "+ a\n+ b");
  assert.equal(unifiedDiff("a\nb\n", "", off), "- a\n- b");
  assert.equal(unifiedDiff("a\n", "a", off), "- a\n+ a");
  assert.equal(
    unifiedDiff("alpha beta gamma\n", "alpha delta gamma\n", off),
    "- alpha beta gamma\n+ alpha delta gamma",
  );
});

test("a long unchanged middle becomes one gap that keeps both hunks reachable", () => {
  const lines = (count, changes = {}) =>
    Array.from({ length: count }, (_, i) => changes[i + 1] ?? `l${i + 1}`).join("\n") + "\n";
  const original = lines(30);
  const changed = lines(30, { 3: "X3", 27: "Y27" });
  const result = diffLines(original, changed, off);
  assert.deepEqual(
    result.rows.map((row) => row.kind),
    [
      "equal",
      "equal",
      "change",
      "equal",
      "equal",
      "equal",
      "gap",
      "equal",
      "equal",
      "equal",
      "change",
      "equal",
      "equal",
      "equal",
    ],
  );
  assert.deepEqual(
    result.rows.filter((row) => row.hunk > 0).map((row) => row.hunk),
    [1, 2],
  );
  assert.equal(result.rows[6].lines, 17);
  assert.equal(result.stats.hunks, 2);
  assert.equal(result.stats.unchanged, 28);
  assert.equal(result.stats.added, 2);
  assert.equal(result.stats.removed, 2);
});
