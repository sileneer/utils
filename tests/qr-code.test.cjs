/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jsQR = require("jsqr").default || require("jsqr");
const {
  buildQr,
  contrastRatio,
  escapeWifi,
  minQuietZone,
  moduleScale,
  qrLayout,
  qrLimits,
  qrPayload,
  qrSvg,
} = require("../src/lib/tools/qr.ts");

/** The same geometry the download path uses, as an RGBA buffer jsQR can read. */
function render(matrix, options = {}) {
  const {
    size = 512,
    quietZone = 4,
    dark = [0, 0, 0],
    light = [255, 255, 255],
  } = options;
  const zone = Math.max(minQuietZone, quietZone);
  const scale = moduleScale(matrix, { size, quietZone: zone, dark: "", light: "" });
  const width = (matrix.size + 2 * zone) * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const column = Math.floor(x / scale) - zone;
      const row = Math.floor(y / scale) - zone;
      const on =
        row >= 0 &&
        column >= 0 &&
        row < matrix.size &&
        column < matrix.size &&
        matrix.cells[row][column];
      const [r, g, b] = on ? dark : light;
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { data, width, scale };
}

function decode(matrix, options) {
  const { data, width } = render(matrix, options);
  const code = jsQR(data, width, width);
  return code ? code.data : null;
}

const ok = (payload, ecc) => {
  const built = buildQr(payload, ecc);
  assert.equal(built.ok, true, "expected a code for " + ecc + " / " + payload.slice(0, 24));
  return built.matrix;
};

test("wifi escaping protects the separators and the escape character", () => {
  assert.equal(escapeWifi("plain"), "plain");
  assert.equal(escapeWifi("a\\b;c:d,e\"f"), "a\\\\b\\;c\\:d\\,e\\\"f");
  assert.equal(escapeWifi("päss1"), "päss1");
  // A password that itself looks like a field boundary must stay one field.
  assert.equal(escapeWifi("S:x;T:WEP"), "S\\:x\\;T\\:WEP");
});

test("wifi payload carries the network, the type and the hidden flag", () => {
  const generated = randomUUID();
  const base = { ssid: "Café Net", password: generated + ";,x", encryption: "wpa", hidden: false };
  assert.equal(
    qrPayload("wifi", { wifi: base }),
    `WIFI:T:WPA;S:Café Net;P:${generated}\\;\\,x;;`,
  );
  assert.equal(
    qrPayload("wifi", { wifi: { ...base, hidden: true } }),
    `WIFI:T:WPA;S:Café Net;P:${generated}\\;\\,x;H:true;;`,
  );
  assert.equal(
    qrPayload("wifi", { wifi: { ...base, encryption: "wep" } }),
    `WIFI:T:WEP;S:Café Net;P:${generated}\\;\\,x;;`,
  );
  // An open network has no password field at all.
  assert.equal(
    qrPayload("wifi", { wifi: { ...base, encryption: "none" } }),
    "WIFI:T:nopass;S:Café Net;;",
  );
  assert.equal(
    qrPayload("wifi", { wifi: { ssid: "", password: "", encryption: "wpa", hidden: false } }),
    "WIFI:T:WPA;S:;P:;;",
  );
});

test("text and url payloads are encoded exactly as typed", () => {
  assert.equal(qrPayload("text", { text: "  keep me  " }), "  keep me  ");
  assert.equal(qrPayload("url", { url: "example.com/a" }), "example.com/a");
  const hostile = 'javascript:alert(1)//<img src=x onerror="x">';
  assert.equal(qrPayload("url", { url: hostile }), hostile);
  assert.equal(qrPayload("text", { text: "" }), "");
  assert.equal(qrPayload("url", { url: undefined }), "");
});

test("an empty or over-long payload is refused instead of guessed at", () => {
  assert.deepEqual(buildQr("", "M"), { ok: false, reason: "empty" });
  const big = "x".repeat(qrLimits.bytes + 1);
  assert.deepEqual(buildQr(big, "M"), { ok: false, reason: "tooLong" });
  // CJK costs three bytes per character, so the byte count is what matters.
  const cjk = "中".repeat(Math.floor(qrLimits.bytes / 3) + 1);
  assert.equal(buildQr(cjk, "M").reason, "tooLong");
  assert.equal(buildQr("x".repeat(qrLimits.bytes), "L").ok, true);
});

test("a higher correction level needs a bigger symbol for the same content", () => {
  const payload = "https://utils.lzhdev.com/text-diff?share=1";
  const sizes = ["L", "M", "Q", "H"].map((ecc) => ok(payload, ecc).size);
  assert.ok(sizes[0] <= sizes[1] && sizes[1] <= sizes[2] && sizes[2] <= sizes[3], sizes.join(","));
  const matrix = ok(payload, "H");
  assert.equal(matrix.version, (matrix.size - 17) / 4);
  assert.ok(matrix.version >= 1 && matrix.version <= 40);
  assert.equal(matrix.bytes, payload.length);
});

test("every generated code decodes back to the exact input", () => {
  const payloads = [
    "Hello, world!",
    "中文测试：高性价比人生指南",
    "混合 mixed 내용 日本語 🎉 emoji — dash",
    "https://utils.lzhdev.com/qr-studio?a=1&b=two#frag",
    'WIFI:T:WPA;S:Café\\ Net;P:p\\;a"s,s\\,w:,;H:true;;',
    "  leading and trailing  ",
    "line1\nline2\nline3",
    "👨‍👩‍👧‍👦 family",
    "x".repeat(900),
  ];
  for (const payload of payloads) {
    for (const ecc of ["L", "M", "Q", "H"]) {
      const matrix = ok(payload, ecc);
      assert.equal(
        decode(matrix, { size: 600 }),
        payload,
        "mismatch for " + ecc + " / " + JSON.stringify(payload.slice(0, 32)),
      );
    }
  }
});

test("the export geometry still decodes at every offered size", () => {
  const matrix = ok("https://lzhdev.com", "Q");
  for (const size of [256, 512, 1024]) {
    const style = { size, quietZone: 4, dark: "#000", light: "#fff" };
    const scale = moduleScale(matrix, style);
    const { edge, shift } = qrLayout(matrix, style);
    assert.ok(scale >= 1, "at least one pixel per module at " + size);
    assert.ok(edge + shift * 2 <= size + scale, "the symbol must fit inside " + size);
    assert.equal(decode(matrix, { size }), "https://lzhdev.com", "must decode at " + size + "px");
  }
});

test("the quiet zone never drops below four modules", () => {
  const matrix = ok("quiet", "M");
  for (const quietZone of [0, 2, 4, 8]) {
    const layout = qrLayout(matrix, { size: 512, quietZone, dark: "#000", light: "#fff" });
    assert.ok(layout.quietZone >= minQuietZone, "requested " + quietZone);
    const { data, width } = render(matrix, { size: 512, quietZone });
    // The outermost ring must be uniformly light.
    const first = [data[0], data[1], data[2]].join(",");
    for (let x = 0; x < width; x++) {
      assert.equal([data[x * 4], data[x * 4 + 1], data[x * 4 + 2]].join(","), first);
      const bottom = ((width - 1) * width + x) * 4;
      assert.equal([data[bottom], data[bottom + 1], data[bottom + 2]].join(","), first);
    }
    assert.equal(jsQR(data, width, width).data, "quiet");
  }
});

test("colours invert without breaking the decode", () => {
  const matrix = ok("invert me", "M");
  const { data, width } = render(matrix, {
    size: 512,
    dark: [255, 255, 255],
    light: [0, 0, 0],
  });
  const code = jsQR(data, width, width);
  assert.equal(code && code.data, "invert me");
});

test("contrast ratio reports the scan risk of a custom palette", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#000", "#fff"), 21);
  assert.equal(contrastRatio("#767676", "#ffffff").toFixed(2), "4.54");
  assert.equal(contrastRatio("#808080", "#7f7f7f").toFixed(2), "1.01");
  assert.equal(contrastRatio("#000000", "#000000"), 1);
  assert.equal(contrastRatio("red", "#ffffff"), null);
  assert.equal(contrastRatio("#12345", "#ffffff"), null);
  assert.equal(contrastRatio("", ""), null);
});

test("the svg carries geometry only, never the payload or a script", () => {
  const ssid = "qa-network-" + randomUUID();
  const generated = randomUUID();
  const secret = qrPayload("wifi", { wifi: { ssid, password: generated, encryption: "wpa", hidden: false } });
  const matrix = ok(secret, "M");
  const style = { size: 512, quietZone: 4, dark: "#000000", light: "#ffffff" };
  const svg = qrSvg(matrix, style);
  const darkModules = matrix.cells.flat().filter(Boolean).length;
  assert.equal((svg.match(/<rect /g) || []).length, darkModules + 1, "one background rect");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="512" height="512"/);
  assert.ok(!svg.includes(generated));
  assert.ok(!svg.includes(ssid));
  assert.ok(!/<script|onload|onerror|href|xlink|url\(|<!DOCTYPE|<!ENTITY|<image|<foreignObject/i.test(svg));
  assert.ok(!svg.includes("http://www.w3.org/1999/xlink"));
  // Only the declared namespace may be an absolute URI.
  assert.deepEqual([...svg.matchAll(/https?:\/\/[^\s"']+/g)].map((m) => m[0]), [
    "http://www.w3.org/2000/svg",
  ]);
  const layout = qrLayout(matrix, style);
  assert.ok(svg.includes(`width="${layout.scale}" height="${layout.scale}"`));
});

test("invalid colours fall back to the scannable default pair", () => {
  const matrix = ok("fallback", "M");
  const svg = qrSvg(matrix, { size: 256, quietZone: 4, dark: "#zzz", light: "white" });
  assert.ok(svg.includes('fill="#ffffff"'));
  assert.ok(svg.includes('fill="#000000"'));
  assert.ok(!svg.includes("#zzz"));
  assert.equal(decode(matrix, { size: 256 }), "fallback");
});

test("the exported symbol is centred inside the requested box", () => {
  const matrix = ok("centred", "H");
  const style = { size: 1024, quietZone: 6, dark: "#000000", light: "#ffffff" };
  const { scale, edge, shift, quietZone } = qrLayout(matrix, style);
  assert.equal(quietZone, 6);
  assert.equal(scale, Math.floor(1024 / (matrix.size + 12)));
  assert.equal(edge, (matrix.size + 2 * quietZone) * scale);
  assert.ok(edge <= 1024);
  assert.equal(shift, Math.floor((1024 - edge) / 2));
});
