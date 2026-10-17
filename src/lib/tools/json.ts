/**
 * JSON parsing and printing for `/json-formatter` (DESIGN.md §5.20). Everything
 * runs in the browser; the document is never uploaded, stored or put in a URL.
 *
 * This is a hand-written parser rather than `JSON.parse` plus a library, because
 * the two things this tool must never do are exactly what the built-ins do:
 * `JSON.stringify` rewrites a number it cannot represent (`1e2` becomes `100`,
 * `-0` becomes `0`, a 30-digit integer silently rounds), and `JSON.parse` drops
 * every duplicate key but the last. So the AST keeps the source text of each
 * number, string and key verbatim, keeps members in document order, and reports
 * a duplicate instead of resolving it. Errors carry a line and column.
 */

export type JsonNode =
  | { kind: "object"; members: JsonMember[]; start: number; end: number }
  | { kind: "array"; items: JsonNode[]; start: number; end: number }
  | { kind: "string"; raw: string; value: string; start: number; end: number }
  | { kind: "number"; raw: string; start: number; end: number }
  | { kind: "boolean"; raw: string; value: boolean; start: number; end: number }
  | { kind: "null"; raw: string; start: number; end: number };

export type JsonMember = {
  keyRaw: string;
  key: string;
  keyStart: number;
  keyEnd: number;
  value: JsonNode;
};

export type JsonStats = {
  objects: number;
  arrays: number;
  keys: number;
  values: number;
  depth: number;
};

/** Explicit bounds: the tab must refuse rather than stall on a monster input. */
export const jsonLimits = { characters: 2_000_000, output: 8_000_000, depth: 200, excerpt: 160 };

export type JsonErrorCode =
  | "empty"
  | "tooLarge"
  | "outputTooLarge"
  | "tooDeep"
  | "unexpectedEnd"
  | "unexpectedToken"
  | "badEscape"
  | "badNumber"
  | "missingColon"
  | "missingComma"
  | "trailingComma"
  | "duplicateKey"
  | "extraData";

export type JsonError = {
  code: JsonErrorCode;
  line: number;
  column: number;
  /** Second site for a pair, e.g. where the key was first defined. */
  otherLine?: number;
  otherColumn?: number;
  key?: string;
  found?: string;
};

export type JsonFailure = { ok: false; error: JsonError };

export type JsonParse = { ok: true; root: JsonNode; stats: JsonStats } | JsonFailure;

export type JsonFormat = { ok: true; text: string; stats: JsonStats } | JsonFailure;

export type Indent = "2" | "4" | "tab";
export type OutputStyle = { mode: "pretty" | "minified"; indent: Indent };

const whitespace = new Set([" ", "\t", "\n", "\r"]);

/** 1-based line and column for a character offset. */
export function locate(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\r") {
      line++;
      column = 1;
      if (source[i + 1] === "\n" && i + 1 < offset) i++;
    } else if (source[i] === "\n") {
      line++;
      column = 1;
    } else column++;
  }
  return { line, column };
}

class Reader {
  index = 0;
  depth = 0;

  constructor(readonly source: string) {}

  get done(): boolean {
    return this.index >= this.source.length;
  }

  skipSpace(): void {
    while (!this.done && whitespace.has(this.source[this.index])) this.index++;
  }

  error(code: JsonErrorCode, at = this.index, extra: Partial<JsonError> = {}): JsonFailure {
    return { ok: false, error: { code, ...locate(this.source, at), ...extra } };
  }
}

const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/y;
const hexDigits = /^[0-9a-fA-F]{4}/;

function readString(reader: Reader): { raw: string; value: string } | JsonFailure {
  const source = reader.source;
  const start = reader.index;
  reader.index++; // opening quote
  let decoded = "";
  while (true) {
    if (reader.done) return reader.error("unexpectedEnd", start);
    const character = source[reader.index];
    if (character === '"') {
      reader.index++;
      return { raw: source.slice(start, reader.index), value: decoded };
    }
    if (character === "\\") {
      const escape = source[reader.index + 1];
      if (escape === undefined) return reader.error("unexpectedEnd", reader.index);
      const simple: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      if (Object.prototype.hasOwnProperty.call(simple, escape)) {
        decoded += simple[escape];
        reader.index += 2;
        continue;
      }
      if (escape === "u") {
        const digits = source.slice(reader.index + 2, reader.index + 6);
        if (!hexDigits.test(digits))
          return reader.error("badEscape", reader.index, { found: "\\u" + digits });
        decoded += String.fromCharCode(Number.parseInt(digits, 16));
        reader.index += 6;
        continue;
      }
      return reader.error("badEscape", reader.index, { found: "\\" + escape });
    }
    if (character < " ")
      return reader.error("badEscape", reader.index, {
        found: "U+" + character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"),
      });
    decoded += character;
    reader.index++;
  }
}

function readNumber(reader: Reader): { raw: string } | JsonFailure {
  const source = reader.source;
  numberPattern.lastIndex = reader.index;
  const match = numberPattern.exec(source);
  if (!match || match.index !== reader.index)
    return reader.error("badNumber", reader.index, { found: source[reader.index] });
  const raw = match[0];
  const next = source[reader.index + raw.length];
  // A digit, sign or name glued to the number is a typo, not a number to split.
  if (next !== undefined && /[\w.+-]/.test(next))
    return reader.error("badNumber", reader.index, { found: raw + next });
  reader.index += raw.length;
  return { raw };
}

function parseValue(reader: Reader): JsonNode | JsonFailure {
  if (reader.done) return reader.error("unexpectedEnd");
  reader.depth++;
  if (reader.depth > jsonLimits.depth)
    return reader.error("tooDeep", reader.index, { found: String(jsonLimits.depth) });
  const source = reader.source;
  const character = source[reader.index];
  const start = reader.index;

  if (character === "{") {
    reader.index++;
    const members: JsonMember[] = [];
    const seen = new Map<string, { keyStart: number; keyEnd: number }>();
    reader.skipSpace();
    if (source[reader.index] === "}") {
      reader.index++;
      reader.depth--;
      return { kind: "object", members, start, end: reader.index };
    }
    while (true) {
      reader.skipSpace();
      if (reader.done) return reader.error("unexpectedEnd", start);
      if (source[reader.index] === "}")
        return reader.error("trailingComma", reader.index, { found: "}" });
      if (source[reader.index] !== '"')
        return reader.error("unexpectedToken", reader.index, { found: source[reader.index] });
      const keyStart = reader.index;
      const key = readString(reader);
      if ("ok" in key) return key;
      const keyEnd = reader.index;
      reader.skipSpace();
      if (source[reader.index] !== ":") return reader.error("missingColon", reader.index);
      reader.index++;
      reader.skipSpace();
      const value = parseValue(reader);
      if ("ok" in value) return value;
      const duplicate = seen.get(key.value);
      if (duplicate) {
        const first = locate(source, duplicate.keyStart);
        const second = locate(source, keyStart);
        return {
          ok: false,
          error: {
            code: "duplicateKey",
            key: key.value,
            line: second.line,
            column: second.column,
            otherLine: first.line,
            otherColumn: first.column,
          },
        };
      }
      seen.set(key.value, { keyStart, keyEnd });
      members.push({ keyRaw: key.raw, key: key.value, keyStart, keyEnd, value });
      reader.skipSpace();
      const separator = source[reader.index];
      if (separator === ",") {
        reader.index++;
        continue;
      }
      if (separator === "}") {
        reader.index++;
        break;
      }
      if (separator === undefined) return reader.error("unexpectedEnd", start);
      return reader.error("missingComma", reader.index, { found: separator });
    }
    reader.depth--;
    return { kind: "object", members, start, end: reader.index };
  }

  if (character === "[") {
    reader.index++;
    const items: JsonNode[] = [];
    reader.skipSpace();
    if (source[reader.index] === "]") {
      reader.index++;
      reader.depth--;
      return { kind: "array", items, start, end: reader.index };
    }
    while (true) {
      reader.skipSpace();
      if (reader.done) return reader.error("unexpectedEnd", start);
      if (source[reader.index] === "]")
        return reader.error("trailingComma", reader.index, { found: "]" });
      const item = parseValue(reader);
      if ("ok" in item) return item;
      items.push(item);
      reader.skipSpace();
      const separator = source[reader.index];
      if (separator === ",") {
        reader.index++;
        continue;
      }
      if (separator === "]") {
        reader.index++;
        break;
      }
      if (separator === undefined) return reader.error("unexpectedEnd", start);
      return reader.error("missingComma", reader.index, { found: separator });
    }
    reader.depth--;
    return { kind: "array", items, start, end: reader.index };
  }

  if (character === '"') {
    const value = readString(reader);
    if ("ok" in value) return value;
    reader.depth--;
    return {
      kind: "string",
      raw: value.raw,
      value: value.value,
      start,
      end: reader.index,
    };
  }

  if (character === "-" || (character >= "0" && character <= "9")) {
    const value = readNumber(reader);
    if ("ok" in value) return value;
    reader.depth--;
    return { kind: "number", raw: value.raw, start, end: reader.index };
  }

  for (const literal of ["true", "false", "null"] as const) {
    if (source.startsWith(literal, reader.index)) {
      const after = source[reader.index + literal.length];
      if (after !== undefined && /[\w]/.test(after))
        return reader.error("unexpectedToken", start, { found: literal + after });
      reader.index += literal.length;
      reader.depth--;
      if (literal === "null") return { kind: "null", raw: literal, start, end: reader.index };
      return {
        kind: "boolean",
        raw: literal,
        value: literal === "true",
        start,
        end: reader.index,
      };
    }
  }

  return reader.error("unexpectedToken", start, { found: character });
}

function walk(node: JsonNode, stats: JsonStats, depth: number): void {
  stats.depth = Math.max(stats.depth, depth);
  if (node.kind === "object") {
    stats.objects++;
    for (const member of node.members) {
      stats.keys++;
      walk(member.value, stats, depth + 1);
    }
    return;
  }
  if (node.kind === "array") {
    stats.arrays++;
    for (const item of node.items) walk(item, stats, depth + 1);
    return;
  }
  stats.values++;
}

/** Parses strictly: no comments, no trailing commas, no single quotes, no repair. */
export function parseJson(source: string): JsonParse {
  if (source.length > jsonLimits.characters)
    return {
      ok: false,
      error: { code: "tooLarge", ...locate(source, 0), found: String(jsonLimits.characters) },
    };
  if (source.trim() === "") return { ok: false, error: { code: "empty", line: 1, column: 1 } };
  const reader = new Reader(source);
  reader.skipSpace();
  const root = parseValue(reader);
  if ("ok" in root) return root;
  reader.skipSpace();
  if (!reader.done)
    return reader.error("extraData", reader.index, { found: source[reader.index] });
  const stats: JsonStats = { objects: 0, arrays: 0, keys: 0, values: 0, depth: 0 };
  walk(root, stats, 1);
  return { ok: true, root, stats };
}

function indentUnit(indent: Indent): string {
  return indent === "tab" ? "\t" : " ".repeat(Number(indent));
}

/**
 * Prints the tree. Every scalar is written from its own source text, so numbers
 * and escapes survive untouched; `minified` removes only the insignificant
 * whitespace the source may or may not have had.
 */
export function serializeJson(node: JsonNode, style: OutputStyle): string {
  if (style.mode === "minified") return printMinified(node);
  return printPretty(node, indentUnit(style.indent), "");
}

function printMinified(node: JsonNode): string {
  switch (node.kind) {
    case "string":
      return node.raw;
    case "number":
    case "boolean":
    case "null":
      return node.raw;
    case "array":
      return "[" + node.items.map(printMinified).join(",") + "]";
    case "object":
      return (
        "{" +
        node.members.map((member) => member.keyRaw + ":" + printMinified(member.value)).join(",") +
        "}"
      );
  }
}

function printPretty(node: JsonNode, unit: string, pad: string): string {
  const inner = pad + unit;
  switch (node.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return node.raw;
    case "array":
      if (node.items.length === 0) return "[]";
      return (
        "[\n" +
        node.items.map((item) => inner + printPretty(item, unit, inner)).join(",\n") +
        "\n" +
        pad +
        "]"
      );
    case "object":
      if (node.members.length === 0) return "{}";
      return (
        "{\n" +
        node.members
          .map(
            (member) =>
              inner + member.keyRaw + ": " + printPretty(member.value, unit, inner),
          )
          .join(",\n") +
        "\n" +
        pad +
        "}"
      );
  }
}

/** Measure indentation expansion before allocating the output string. */
function prettyLength(node: JsonNode, width: number, depth = 0): number {
  if (node.kind !== "array" && node.kind !== "object") return node.raw.length;
  const entries = node.kind === "array" ? node.items : node.members;
  if (entries.length === 0) return 2;
  let length = 4 + depth * width + (entries.length - 1) * 2;
  for (const entry of entries) {
    length += (depth + 1) * width;
    if ("keyRaw" in entry)
      length += entry.keyRaw.length + 2 + prettyLength(entry.value, width, depth + 1);
    else length += prettyLength(entry, width, depth + 1);
    if (length > jsonLimits.output) return length;
  }
  return length;
}

/** Format or minify a document in one step, keeping any parse error visible. */
export function formatJson(source: string, style: OutputStyle): JsonFormat {
  const parsed = parseJson(source);
  if (!parsed.ok) return parsed;
  if (style.mode === "pretty" && prettyLength(parsed.root, indentUnit(style.indent).length) > jsonLimits.output)
    return {
      ok: false,
      error: { code: "outputTooLarge", line: 1, column: 1, found: String(jsonLimits.output) },
    };
  return { ok: true, text: serializeJson(parsed.root, style), stats: parsed.stats };
}

/**
 * The offending line and a caret under its column, so a location is usable on a
 * phone as well as in a desktop editor. Long lines are centred on the column.
 */
export function errorExcerpt(
  source: string,
  error: JsonError,
): { text: string; caret: string } | null {
  const lines = source.split(/\r\n|\r|\n/);
  const line = lines[error.line - 1];
  if (line === undefined) return null;
  const index = Math.min(error.column - 1, line.length);
  const limit = jsonLimits.excerpt;
  if (line.length <= limit)
    return { text: line, caret: " ".repeat(index) + "^" };
  const from = Math.max(0, Math.min(index - Math.floor(limit / 2), line.length - limit));
  const to = Math.min(line.length, from + limit);
  return {
    text: (from > 0 ? "…" : "") + line.slice(from, to) + (to < line.length ? "…" : ""),
    caret: " ".repeat(index - from + (from > 0 ? 1 : 0)) + "^",
  };
}
