/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { keyboardViewport } = require("../src/lib/chat/viewport.ts"), { searchBook } = require("../src/lib/book/search.ts");
test("visible viewport adjusts only for a focused mobile keyboard, not pinch zoom or desktop resize", () => {
    const value = { height: 430, top: 20, scale: 1, layoutHeight: 800, mobile: true, textFocused: true };
    assert.deepEqual(keyboardViewport(value), { height: 430, top: 20 });
    for (const patch of [{ mobile: false }, { textFocused: false }, { scale: 1.5 }, { height: 780 }, { height: NaN }, { top: -1 }, { height: 20 }])
        assert.equal(keyboardViewport({ ...value, ...patch }), undefined);
});
test("multi-term proximity breaks equal title scores without overriding full title matches or section coverage", () => {
    const books = [{ section: 1, name: "01-test.md", text: "### 1. insurance\nmedical " + "x".repeat(1800) + " insurance" },
        { section: 32, name: "32-test.md", text: "### 7. insurance\nmedical insurance" },
        { section: 21, name: "21-test.md", text: "### 4. medical insurance\nrelated details" }];
    assert.deepEqual(searchBook(books, "medical insurance").map(x => x.anchor), ["e-21-4", "e-32-7", "e-1-1"]);
    // Repeated terms must keep a linear covering-window scan rather than quadratic copies.
    const repeated = { section: 2, name: "02-test.md", text: "### 1. letters\n" + "a ".repeat(12000) + " b" };
    assert.equal(searchBook([repeated], "a b")[0].anchor, "e-2-1");
});
