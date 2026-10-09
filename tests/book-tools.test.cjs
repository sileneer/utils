/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
require("./ai-fixture.cjs")();
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
    "### 1. 睡眠\n" +
      "a".repeat(8000) +
      "\n### 2. late-睡眠-entry\n" +
      "b".repeat(7000),
  );
  for (let section = 2; section <= 8; section++) {
    await fs.writeFile(
      path.join(
        directory,
        "book",
        String(section).padStart(2, "0") + "-test.md",
      ),
      Array.from({ length: 4 }, (_, i) => "### " + (i + 1) + ". 睡眠\n" + "x".repeat(1000)).join("\n"),
    );
  }
  await fs.writeFile(path.join(directory, "private.txt"), "must-not-read");
  const server = await bookTools(directory),
    read = server.tools.find((t) => t.name === "read_section"),
    search = server.tools.find((t) => t.name === "search");
  assert.equal(read.schema.section.safeParse("../private.txt").success, false);
  assert.equal(read.schema.section.safeParse(35).success, false);
  assert.equal(search.schema.phrase.safeParse("x".repeat(101)).success, false);
  const found = await search.handler({ phrase: "睡眠" });
  assert.match(found.content[0].text, /睡眠/);
  assert.ok(found.content[0].text.length <= 4000);
  assert.ok(
    [...found.content[0].text.matchAll(/read_section section=/g)].length <= 6,
  );
  const late = await search.handler({ phrase: "late-睡眠-entry" });
  const hits = [
    ...late.content[0].text.matchAll(/read_section section=1 offset=(\d+)/g),
  ];
  assert.equal(hits.length, 1);
  const lateOffset = Number(hits[0][1]);
  assert.ok(lateOffset > 0);
  assert.match(
    (await read.handler({ section: 1, offset: lateOffset })).content[0].text,
    /late-睡眠-entry/,
  );
  const missing = await search.handler({ phrase: "../private.txt" });
  assert.doesNotMatch(missing.content[0].text, /must-not-read/);
  const section = await read.handler({ section: 1, offset: 0 });
  assert.ok(section.content[0].text.length < 3100);
  assert.match(section.content[0].text, /Continue at offset 3000/);
  const next = await read.handler({ section: 1, offset: 3000 });
  assert.equal(next.content[0].text.split("\n")[1], "a".repeat(3000));
  assert.match(
    (await read.handler({ section: 1, offset: 16000 })).content[0].text,
    /\[End\]$/,
  );
  process.env.BETTER_AUTH_SECRET = "test";
  process.env.BREVO_API_KEY = "test";
  process.env.TURNSTILE_SECRET_KEY = "test";
  process.env.CHAT_PASSCODE = "test";
  const env = agentEnvironment("deepseek-flash");
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
