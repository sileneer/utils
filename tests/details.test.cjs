/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  tokenUsage,
  totalTokens,
  parseMessageDetails,
  recordedDetails,
} = require("../src/lib/chat/details.ts");
const { readChatStream } = require("../src/lib/chat/protocol.ts");
test("turn tokens include separate cache counts; missing differs from reported zero", () => {
  const tokens = tokenUsage({
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 50,
    cache_creation_input_tokens: 10,
  });
  assert.equal(totalTokens(tokens), 180);
  assert.deepEqual(tokenUsage({ input_tokens: 0, output_tokens: 0 }), {
    input: 0,
    output: 0,
  });
  assert.equal(tokenUsage(undefined), undefined);
  for (const value of [-1, 1.5, Infinity, "100", Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      tokenUsage({ input_tokens: value, output_tokens: 20 }),
      undefined,
    );
  assert.equal(
    tokenUsage({ input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 }),
    undefined,
  );
});
test("stored details and legacy usage expose only validated public fields", () => {
  const details = {
    model: "deepseek-flash",
    durationMs: 4200,
    firstTextMs: 1000,
    searchCalls: 2,
    readCalls: 1,
    tokens: { input: 4, output: 6 },
  };
  assert.deepEqual(
    recordedDetails(
      JSON.stringify({
        details: { ...details, rawLog: "private", sessionId: "private" },
        totalCostUsd: 999,
      }),
    ),
    details,
  );
  assert.deepEqual(
    recordedDetails(
      JSON.stringify({
        usage: { input_tokens: 4, output_tokens: 6 },
        totalCostUsd: 999,
      }),
    ),
    { tokens: { input: 4, output: 6 } },
  );
  assert.equal(recordedDetails(null), undefined);
  assert.equal(recordedDetails("bad JSON"), undefined);
  assert.equal(parseMessageDetails({ model: "unknown" }), undefined);
  assert.equal(parseMessageDetails({ durationMs: -1 }), undefined);
  assert.equal(parseMessageDetails({ tokens: { input: 1 } }), undefined);
});
test("chunked metadata SSE rejects malformed metrics and strips private extras", async () => {
  async function parse(event) {
    const bytes = new TextEncoder().encode(
      "data: " + JSON.stringify(event) + '\n\ndata: {"type":"done"}\n\n',
    );
    const events = [];
    await readChatStream(
      new ReadableStream({
        start(c) {
          for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
          c.close();
        },
      }),
      (e) => events.push(e),
    );
    return events;
  }
  assert.deepEqual(
    (
      await parse({
        type: "details",
        details: { model: "deepseek-flash", searchCalls: 1, rawLog: "private" },
      })
    )[0],
    { type: "details", details: { model: "deepseek-flash", searchCalls: 1 } },
  );
  await assert.rejects(
    parse({ type: "details", details: { durationMs: -1 } }),
    /invalid_stream/,
  );
});
