/**
 * QR code generation for `/qr-studio` (DESIGN.md §5.19). Everything runs in the
 * browser: the payload never leaves the tab, and it is never written to a URL,
 * storage, a log, a filename or the DOM as text.
 *
 * `qrcode-generator` supplies the module matrix only. Its 8-bit byte mode reads
 * the byte converter off the factory (not off the instance), so UTF-8 has to be
 * installed there — otherwise non-ASCII input is silently truncated to its low
 * byte and the code scans as mojibake. The ESM build that Turbopack picks ships
 * no encoding table at all, so this site supplies the converter itself; the CJS
 * build used by the tests then takes exactly the same path. Nothing else in the
 * app imports this package.
 */
import qrcode from "qrcode-generator";

const utf8 = new TextEncoder();

qrcode.stringToBytes = (value: string) => Array.from(utf8.encode(value));

export type QrEcc = "L" | "M" | "Q" | "H";
export type QrKind = "text" | "url" | "wifi";
export type QrEncryption = "wpa" | "wep" | "none";

/** The QR spec asks for four quiet-zone modules; the control never goes below it. */
export const minQuietZone = 4;

/** A v40-H byte-mode code holds 1 273 bytes; the input is capped well inside it. */
export const qrLimits = { bytes: 1200, ssid: 128, password: 128 };

export const exportSizes = [256, 512, 1024] as const;

export type QrMatrix = {
  /** Dark module per cell, row-major. */
  cells: boolean[][];
  size: number;
  /** Symbol version 1–40, derived from the module count (4 × version + 17). */
  version: number;
  bytes: number;
  ecc: QrEcc;
};

export type QrBuild =
  | { ok: true; matrix: QrMatrix }
  | { ok: false; reason: "empty" | "tooLong" };

export type WifiFields = {
  ssid: string;
  password: string;
  encryption: QrEncryption;
  hidden: boolean;
};

/**
 * Wi-Fi payload escaping per the common `WIFI:` scheme: the separators and the
 * escape character itself are backslash-prefixed, so a password containing
 * `;:,\"` survives a scanner's parser instead of truncating the field.
 */
export function escapeWifi(value: string): string {
  return value.replace(/[\\;,:"]/g, (character) => "\\" + character);
}

/**
 * Builds the exact string that will be encoded. `none` omits the password field
 * and a visible network omits `H:`, because readers treat an absent key as the
 * default rather than as a value to decode.
 */
export function qrPayload(
  kind: QrKind,
  value: { text?: string; url?: string; wifi?: WifiFields },
): string {
  if (kind === "wifi") {
    const wifi = value.wifi ?? {
      ssid: "",
      password: "",
      encryption: "none" as QrEncryption,
      hidden: false,
    };
    const type = wifi.encryption === "wpa" ? "WPA" : wifi.encryption === "wep" ? "WEP" : "nopass";
    const parts = ["WIFI:", `T:${type};`, `S:${escapeWifi(wifi.ssid)};`];
    if (type !== "nopass") parts.push(`P:${escapeWifi(wifi.password)};`);
    if (wifi.hidden) parts.push("H:true;");
    parts.push(";");
    return parts.join("");
  }
  // Text and URL are encoded exactly as typed: no trimming, no scheme added and
  // no validation, because this tool never follows what it writes.
  return kind === "url" ? (value.url ?? "") : (value.text ?? "");
}

/**
 * Auto-selects the smallest symbol that fits. The library throws when nothing
 * fits, which is the only honest signal available: a code that silently drops
 * data still renders as a plausible pattern.
 */
export function buildQr(payload: string, ecc: QrEcc): QrBuild {
  if (payload === "") return { ok: false, reason: "empty" };
  if (payload.length > qrLimits.bytes) return { ok: false, reason: "tooLong" };
  const bytes = qrcode.stringToBytes(payload).length;
  if (bytes > qrLimits.bytes) return { ok: false, reason: "tooLong" };
  let code: ReturnType<typeof qrcode>;
  try {
    code = qrcode(0, ecc);
    code.addData(payload);
    code.make();
  } catch {
    return { ok: false, reason: "tooLong" };
  }
  const size = code.getModuleCount();
  const cells: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let column = 0; column < size; column++) line.push(code.isDark(row, column));
    cells.push(line);
  }
  return { ok: true, matrix: { cells, size, version: (size - 17) / 4, bytes, ecc } };
}

function hexChannel(value: string): number {
  return Number.parseInt(value, 16) / 255;
}

/** Accepts `#rgb` and `#rrggbb`; anything else is not a colour this tool will use. */
export function parseHexColor(value: string): [number, number, number] | null {
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  if (short) {
    return [
      hexChannel(short[1] + short[1]),
      hexChannel(short[2] + short[2]),
      hexChannel(short[3] + short[3]),
    ];
  }
  const long = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!long) return null;
  return [hexChannel(long[1]), hexChannel(long[2]), hexChannel(long[3])];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG relative luminance, or null for a colour this tool will not accept. */
export function luminance(value: string): number | null {
  const rgb = parseHexColor(value);
  return rgb ? relativeLuminance(rgb) : null;
}

/** WCAG contrast ratio, 1–21. Used for the scan-reliability warning, not for text. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const first = relativeLuminance(fg);
  const second = relativeLuminance(bg);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export type QrStyle = {
  /** Exported edge length in CSS pixels; the symbol is centred inside it. */
  size: number;
  quietZone: number;
  dark: string;
  light: string;
};

/** Integer module size that still fits the requested export edge. */
export function moduleScale(matrix: QrMatrix, style: QrStyle): number {
  const side = matrix.size + 2 * Math.max(minQuietZone, style.quietZone);
  return Math.max(1, Math.floor(style.size / side));
}

/**
 * Self-contained SVG: no script, no style element, no external reference and no
 * user text at all — only geometry and two validated colours. Numbers are the
 * only interpolated values, so there is nothing that needs escaping.
 */
export function qrSvg(matrix: QrMatrix, style: QrStyle): string {
  const quietZone = Math.max(minQuietZone, style.quietZone);
  const scale = moduleScale(matrix, style);
  const side = matrix.size + 2 * quietZone;
  const edge = side * scale;
  const offset = (side - matrix.size) / 2;
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (!matrix.cells[row][column]) continue;
      parts.push(
        `<rect x="${(column + offset) * scale}" y="${(row + offset) * scale}" width="${scale}" height="${scale}"/>`,
      );
    }
  }
  const dark = parseHexColor(style.dark) ? style.dark : "#000000";
  const light = parseHexColor(style.light) ? style.light : "#ffffff";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${style.size}" height="${style.size}" ` +
    `viewBox="0 0 ${edge} ${edge}" shape-rendering="crispEdges" role="img">` +
    `<title>QR code</title>` +
    `<rect width="${edge}" height="${edge}" fill="${light}"/>` +
    `<g fill="${dark}">${parts.join("")}</g>` +
    `</svg>`
  );
}

/**
 * Where each module lands once the integer-scaled symbol is centred inside the
 * exact export box. Shared by the download path and the tests so both describe
 * the same geometry.
 */
export function qrLayout(matrix: QrMatrix, style: QrStyle) {
  const quietZone = Math.max(minQuietZone, style.quietZone);
  const scale = moduleScale(matrix, style);
  const edge = (matrix.size + 2 * quietZone) * scale;
  const shift = Math.floor((style.size - edge) / 2);
  return { quietZone, scale, edge, shift };
}
