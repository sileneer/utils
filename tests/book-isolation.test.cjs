/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict"), Module = require("node:module");
const load = Module._load;
const revision = "a".repeat(40);
Module._load = function (name, ...args) {
  if (name === "@/lib/book/source") return { getBook: async () => ({ revision, html: "<body><script>/* untrusted upstream */</script></body>" }) };
  return load.call(this, name, ...args);
};
const { GET } = require("../src/app/htlb/book/route.ts");
test("book HTML enforces opaque isolation even when opened without an iframe", async () => {
  const response = await GET(new Request("http://localhost/htlb/book"));
  assert.equal(response.status, 200);
  const policy = new Map(response.headers.get("content-security-policy").split(";").map((part) => {
    const [directive, ...values] = part.trim().split(/\s+/);
    return [directive, values];
  }));
  assert.ok(policy.get("sandbox").includes("allow-scripts"), "the book's local reading logic can run");
  assert.ok(!policy.get("sandbox").includes("allow-same-origin"), "it cannot inherit the account origin");
  for (const directive of ["connect-src", "form-action", "frame-src", "base-uri"])
    assert.deepEqual(policy.get(directive), ["'none'"], directive);
  assert.deepEqual(policy.get("img-src"), ["data:"], "an injected image cannot call account routes or exfiltrate data");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-book-revision"), revision);
  assert.match(await response.text(), /untrusted upstream/, "security does not rely on removing only known script tags");
});
test.after(() => { Module._load = load; });
