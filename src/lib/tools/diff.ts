/**
 * Line diff for `/text-diff` (DESIGN.md §5.18). Runs entirely in the browser:
 * no server route, no storage, and the inputs are never rewritten.
 *
 * The alignment is an LCS diff with patience anchoring. Common prefix/suffix
 * trimming covers the usual "edited one place" case, unique-line anchors keep
 * large files near-linear, and a bounded cell budget protects the main thread;
 * a range that exceeds the budget with no anchor available becomes one
 * delete-plus-insert block and is reported as coarse rather than guessed at.
 */

export type Eol = "\r\n" | "\n" | "\r" | "";

export type DiffLine = { text: string; eol: Eol; number: number };

export type Segment = { text: string; changed: boolean };

export type DiffRow =
  | { kind: "equal"; hunk: 0; left: DiffLine; right: DiffLine }
  | { kind: "delete"; hunk: number; left: DiffLine; right: null }
  | { kind: "insert"; hunk: number; left: null; right: DiffLine }
  | {
      kind: "change";
      hunk: number;
      left: DiffLine;
      right: DiffLine;
      leftParts: Segment[] | null;
      rightParts: Segment[] | null;
      /** Nothing in the compared text differs; only the line ending does. */
      endingOnly: boolean;
    }
  | { kind: "gap"; hunk: 0; lines: number }
  | { kind: "cap"; hunk: 0; lines: number };

export type DiffStats = {
  added: number;
  removed: number;
  unchanged: number;
  hunks: number;
  leftLines: number;
  rightLines: number;
};

export type DiffResult = {
  rows: DiffRow[];
  stats: DiffStats;
  /** A range exceeded the cell budget, so at least one block is coarse. */
  coarse: boolean;
  /** Rows were dropped to stay inside `limits.rows`. */
  capped: boolean;
  identical: boolean;
};

export type DiffOptions = {
  ignoreCase: boolean;
  ignoreTrailingWhitespace: boolean;
  /** Equal lines kept around each change; `-1` keeps every line. */
  context?: number;
};

/** Guards against a frozen tab; exceeding any of them refuses the comparison. */
export const limits = { chars: 100_000, lines: 20_000, rows: 2_000 };

/** Equal lines kept around each difference — the viewer and the copy agree. */
export const defaultContext = 3;

const dpCells = 2_000_000;
const maxDepth = 8;
const inlineCells = 20_000;
const inlineTokens = 600;

const eolCode: Record<Eol, string> = { "\r\n": "2", "\n": "1", "\r": "3", "": "0" };

export function eolLabel(eol: Eol): "CRLF" | "LF" | "CR" | "none" {
  if (eol === "\r\n") return "CRLF";
  if (eol === "\n") return "LF";
  if (eol === "\r") return "CR";
  return "none";
}

/** Each line keeps its own ending, and a missing final newline stays empty. */
export function splitLines(text: string): DiffLine[] {
  const out: DiffLine[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n" || ch === "\r") {
      const eol: Eol = ch === "\r" && text[i + 1] === "\n" ? "\r\n" : ch;
      out.push({ text: text.slice(start, i), eol, number: out.length + 1 });
      i += eol.length;
      start = i;
    } else i++;
  }
  if (start < text.length)
    out.push({ text: text.slice(start), eol: "", number: out.length + 1 });
  return out;
}

function comparedText(line: DiffLine, options: DiffOptions): string {
  let text = line.text;
  if (options.ignoreCase) text = text.toLowerCase();
  if (options.ignoreTrailingWhitespace) text = text.replace(/\s+$/, "");
  return text;
}

/** Comparison key only: the displayed line always keeps the original characters. */
function lineKey(line: DiffLine, options: DiffOptions): string {
  return `${comparedText(line, options)}\u0000${eolCode[line.eol]}`;
}

type Op =
  | { type: "equal"; a: number; b: number }
  | { type: "delete"; a: number; b: -1 }
  | { type: "insert"; a: -1; b: number };

function alignKeys(
  a: string[],
  b: string[],
  state: { coarse: boolean } = { coarse: false },
): Op[] {
  const ops: Op[] = [];
  let aLo = 0;
  let bLo = 0;
  let aHi = a.length;
  let bHi = b.length;
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    ops.push({ type: "equal", a: aLo, b: bLo });
    aLo++;
    bLo++;
  }
  const tail: Op[] = [];
  while (aHi > aLo && bHi > bLo && a[aHi - 1] === b[bHi - 1]) {
    tail.push({ type: "equal", a: aHi - 1, b: bHi - 1 });
    aHi--;
    bHi--;
  }
  tail.reverse();
  alignRange(a, b, aLo, aHi, bLo, bHi, ops, state, 0);
  for (const op of tail) ops.push(op);
  return ops;
}

function alignRange(
  a: string[],
  b: string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  ops: Op[],
  state: { coarse: boolean },
  depth: number,
): void {
  const n = aHi - aLo;
  const m = bHi - bLo;
  if (n === 0) {
    for (let j = bLo; j < bHi; j++) ops.push({ type: "insert", a: -1, b: j });
    return;
  }
  if (m === 0) {
    for (let i = aLo; i < aHi; i++) ops.push({ type: "delete", a: i, b: -1 });
    return;
  }
  if ((n + 1) * (m + 1) <= dpCells) {
    alignCells(a, b, aLo, aHi, bLo, bHi, ops);
    return;
  }
  const anchors = depth < maxDepth ? patienceAnchors(a, b, aLo, aHi, bLo, bHi) : [];
  if (anchors.length === 0) {
    state.coarse = true;
    for (let i = aLo; i < aHi; i++) ops.push({ type: "delete", a: i, b: -1 });
    for (let j = bLo; j < bHi; j++) ops.push({ type: "insert", a: -1, b: j });
    return;
  }
  let pa = aLo;
  let pb = bLo;
  for (const [ai, bi] of anchors) {
    alignRange(a, b, pa, ai, pb, bi, ops, state, depth + 1);
    ops.push({ type: "equal", a: ai, b: bi });
    pa = ai + 1;
    pb = bi + 1;
  }
  alignRange(a, b, pa, aHi, pb, bHi, ops, state, depth + 1);
}

/** Length table over the range, then a forward walk to recover the operations. */
function lcsTable(
  a: string[],
  b: string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): Uint32Array {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[aLo + i] === b[bLo + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

function alignCells(
  a: string[],
  b: string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  ops: Op[],
): void {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const width = m + 1;
  const table = lcsTable(a, b, aLo, aHi, bLo, bHi);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[aLo + i] === b[bLo + j]) {
      ops.push({ type: "equal", a: aLo + i, b: bLo + j });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: "delete", a: aLo + i, b: -1 });
      i++;
    } else {
      ops.push({ type: "insert", a: -1, b: bLo + j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "delete", a: aLo + i, b: -1 });
    i++;
  }
  while (j < m) {
    ops.push({ type: "insert", a: -1, b: bLo + j });
    j++;
  }
}

function uniqueIndexes(source: string[], lo: number, hi: number): Map<string, number> {
  const seen = new Map<string, number>();
  for (let i = lo; i < hi; i++) {
    const key = source[i];
    if (seen.has(key)) seen.set(key, -1);
    else seen.set(key, i);
  }
  return seen;
}

/** Lines that occur exactly once on both sides, in an order that fits both. */
function patienceAnchors(
  a: string[],
  b: string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): [number, number][] {
  const inA = uniqueIndexes(a, aLo, aHi);
  const inB = uniqueIndexes(b, bLo, bHi);
  const pairs: [number, number][] = [];
  for (const [key, i] of inA) {
    if (i === -1) continue;
    const j = inB.get(key);
    if (j !== undefined && j !== -1) pairs.push([i, j]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  // Patience sorting: one running chain per chain length, smallest ending first.
  const tails: number[] = [];
  const previous = new Int32Array(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    const value = pairs[k][1];
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (pairs[tails[mid]][1] < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[k] = tails[low - 1];
    if (low === tails.length) tails.push(k);
    else tails[low] = k;
  }
  const chain: [number, number][] = [];
  let cursor = tails.length === 0 ? -1 : tails[tails.length - 1];
  while (cursor !== -1) {
    chain.push(pairs[cursor]);
    cursor = previous[cursor];
  }
  return chain.reverse();
}

const cjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;
const pictographic = /[\p{Extended_Pictographic}\p{Emoji_Component}\u{1f1e6}-\u{1f1ff}\ufe0f\u200d]/u;
const spacing = /\s/u;
const wordChar = /[\p{L}\p{N}_]/u;

/**
 * Word-ish tokens for the inline marks. Han, Hiragana, Katakana and Hangul
 * become one token each because they are not space-separated, and an emoji
 * sequence stays one token so it can never render as half a surrogate pair.
 */
export function tokenizeWords(text: string): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (spacing.test(ch)) {
      let token = ch;
      while (i + 1 < chars.length && spacing.test(chars[i + 1])) token += chars[++i];
      out.push(token);
    } else if (pictographic.test(ch)) {
      let token = ch;
      while (
        i + 1 < chars.length &&
        (pictographic.test(chars[i + 1]) || chars[i + 1] === "\u200d")
      )
        token += chars[++i];
      out.push(token);
    } else if (cjk.test(ch) || !wordChar.test(ch)) {
      out.push(ch);
    } else {
      let token = ch;
      while (
        i + 1 < chars.length &&
        wordChar.test(chars[i + 1]) &&
        !cjk.test(chars[i + 1]) &&
        !pictographic.test(chars[i + 1])
      )
        token += chars[++i];
      out.push(token);
    }
  }
  return out;
}

/** Null when the pair is too large to align inline; the row marks whole lines. */
export function inlineParts(
  left: string,
  right: string,
  ignoreCase: boolean,
): { left: Segment[]; right: Segment[] } | null {
  const a = tokenizeWords(left);
  const b = tokenizeWords(right);
  if (a.length > inlineTokens || b.length > inlineTokens) return null;
  if ((a.length + 1) * (b.length + 1) > inlineCells) return null;
  const keysA = a.map((token) => (ignoreCase ? token.toLowerCase() : token));
  const keysB = b.map((token) => (ignoreCase ? token.toLowerCase() : token));
  const ops = alignKeys(keysA, keysB);
  const leftParts: Segment[] = [];
  const rightParts: Segment[] = [];
  for (const op of ops) {
    if (op.type === "equal") {
      pushSegment(leftParts, a[op.a], false);
      pushSegment(rightParts, b[op.b], false);
    } else if (op.type === "delete") pushSegment(leftParts, a[op.a], true);
    else pushSegment(rightParts, b[op.b], true);
  }
  return { left: leftParts, right: rightParts };
}

function pushSegment(parts: Segment[], text: string, changed: boolean): void {
  const last = parts[parts.length - 1];
  if (last && last.changed === changed) last.text += text;
  else parts.push({ text, changed });
}

export function diffInputProblem(original: string, changed: string): "chars" | "lines" | null {
  if (original.length > limits.chars || changed.length > limits.chars) return "chars";
  if (splitLines(original).length > limits.lines || splitLines(changed).length > limits.lines)
    return "lines";
  return null;
}

export function diffLines(original: string, changed: string, options: DiffOptions): DiffResult {
  const raw = diffRows(original, changed, options);
  const collapsed = collapseContext(raw.rows, options.context ?? defaultContext);
  const bounded = capRows(collapsed);
  return {
    rows: bounded.rows,
    stats: raw.stats,
    coarse: raw.coarse,
    capped: bounded.capped,
    identical: raw.stats.hunks === 0,
  };
}

/** Every aligned line as one row per line, before any collapsing. */
function diffRows(
  original: string,
  changed: string,
  options: DiffOptions,
): { rows: DiffRow[]; stats: DiffStats; coarse: boolean } {
  const left = splitLines(original);
  const right = splitLines(changed);
  const keysA = left.map((line) => lineKey(line, options));
  const keysB = right.map((line) => lineKey(line, options));
  const state = { coarse: false };
  const ops = alignKeys(keysA, keysB, state);

  const rows: DiffRow[] = [];
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    unchanged: 0,
    hunks: 0,
    leftLines: left.length,
    rightLines: right.length,
  };
  let hunk = 0;
  let index = 0;
  while (index < ops.length) {
    const op = ops[index];
    if (op.type === "equal") {
      rows.push({ kind: "equal", hunk: 0, left: left[op.a], right: right[op.b] });
      stats.unchanged++;
      index++;
      continue;
    }
    const run: Op[] = [];
    while (index < ops.length && ops[index].type !== "equal") run.push(ops[index++]);
    const removed = run.filter((item) => item.type === "delete");
    const added = run.filter((item) => item.type === "insert");
    hunk++;
    stats.hunks++;
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      const l = left[removed[k].a];
      const r = right[added[k].b];
      const sameText = comparedText(l, options) === comparedText(r, options);
      const parts = sameText ? null : inlineParts(l.text, r.text, options.ignoreCase);
      rows.push({
        kind: "change",
        hunk,
        left: l,
        right: r,
        leftParts: parts?.left ?? null,
        rightParts: parts?.right ?? null,
        endingOnly: sameText,
      });
      stats.removed++;
      stats.added++;
    }
    for (let k = pairs; k < removed.length; k++) {
      rows.push({ kind: "delete", hunk, left: left[removed[k].a], right: null });
      stats.removed++;
    }
    for (let k = pairs; k < added.length; k++) {
      rows.push({ kind: "insert", hunk, left: null, right: right[added[k].b] });
      stats.added++;
    }
  }

  return { rows, stats, coarse: state.coarse };
}

function collapseContext(rows: DiffRow[], context: number): DiffRow[] {
  if (rows.length === 0 || context < 0) return rows;
  const visible = new Array<boolean>(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === "equal") continue;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++)
      visible[k] = true;
  }
  const out: DiffRow[] = [];
  let hidden = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!visible[i]) {
      hidden++;
      continue;
    }
    if (hidden > 0) {
      out.push({ kind: "gap", hunk: 0, lines: hidden });
      hidden = 0;
    }
    out.push(rows[i]);
  }
  if (hidden > 0) out.push({ kind: "gap", hunk: 0, lines: hidden });
  return out;
}

function capRows(rows: DiffRow[]): { rows: DiffRow[]; capped: boolean } {
  if (rows.length <= limits.rows) return { rows, capped: false };
  let dropped = 0;
  for (const row of rows.slice(limits.rows)) dropped += row.kind === "gap" ? row.lines : 1;
  const kept = rows.slice(0, limits.rows);
  kept.push({ kind: "cap", hunk: 0, lines: dropped });
  return { rows: kept, capped: true };
}

/**
 * Unified text for the copy control: three lines of context, no file headers,
 * and `-`/`+` before every difference. It is never row-capped, and line endings
 * are not reproduced because a copied block is pasted as text — the viewer marks
 * an ending change instead.
 */
export function unifiedDiff(original: string, changed: string, options: DiffOptions): string {
  const raw = diffRows(original, changed, options);
  const lines: string[] = [];
  for (const row of collapseContext(raw.rows, options.context ?? defaultContext)) {
    if (row.kind === "equal") lines.push(`  ${row.left.text}`);
    else if (row.kind === "delete") lines.push(`- ${row.left.text}`);
    else if (row.kind === "insert") lines.push(`+ ${row.right.text}`);
    else if (row.kind === "change") {
      lines.push(`- ${row.left.text}`);
      lines.push(`+ ${row.right.text}`);
    }
  }
  return lines.join("\n");
}
