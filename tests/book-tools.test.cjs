/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path");
const { randomUUID } = require("node:crypto");
const Module = require("node:module"),
  original = Module._load;
Module._load = function (name, ...args) {
  if (name === "@anthropic-ai/claude-agent-sdk")
    return {
      createSdkMcpServer: (value) => value,
      tool: (name, description, schema, handler) => ({ name, schema, handler }),
    };
  return original.call(this, name, ...args);
};
const {
  bookTools,
  agentEnvironment,
} = require("../src/lib/agent/book-tools.ts");
const directory = path.join(
  process.cwd(),
  "data",
  "tools-test-" + randomUUID(),
);
test("book tools accept only bounded sections and literal search; env excludes authentication and mail secrets", async () => {
  await fs.mkdir(path.join(directory, "book"), { recursive: true });
  await fs.writeFile(
    path.join(directory, "book", "01-test.md"),
    "第1节第1条：睡眠。" + "a".repeat(15000),
  );
  await fs.writeFile(path.join(directory, "private.txt"), "must-not-read");
  const server = await bookTools(directory),
    read = server.tools.find((t) => t.name === "read_section"),
    search = server.tools.find((t) => t.name === "search");
  assert.equal(read.schema.section.safeParse("../private.txt").success, false);
  assert.equal(read.schema.section.safeParse(35).success, false);
  assert.equal(search.schema.phrase.safeParse("x".repeat(101)).success, false);
  const found = await search.handler({ phrase: "睡眠" });
  assert.match(found.content[0].text, /睡眠/);
  const missing = await search.handler({ phrase: "../private.txt" });
  assert.doesNotMatch(missing.content[0].text, /must-not-read/);
  const section = await read.handler({ section: 1, offset: 0 });
  assert.ok(section.content[0].text.length < 12100);
  process.env.BETTER_AUTH_SECRET = "test";
  process.env.BREVO_API_KEY = "test";
  process.env.TURNSTILE_SECRET_KEY = "test";
  process.env.CHAT_PASSCODE = "test";
  const env = agentEnvironment();
  for (const name of [
    "BETTER_AUTH_SECRET",
    "BREVO_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "CHAT_PASSCODE",
    "DATABASE_PATH",
  ])
    assert.equal(name in env, false);
  assert.ok(env.PATH);
});
test.after(async () => {
  Module._load = original;
  await fs.rm(directory, { recursive: true, force: true });
});
