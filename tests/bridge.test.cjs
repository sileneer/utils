/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { withBookBridge } = require("../src/lib/book/bridge.ts");
test("bridge requires same origin, exact parent, valid revision and existing entry; hidden entries clear all filters", () => {
  const listeners = {},
    sent = [],
    scroll = [];
  const parent = { postMessage: (data) => sent.push(data) };
  const target = { id: "e-8-45", offsetParent: null, scrollIntoView: () => {} };
  const state = { q: "hidden", sec: new Set(["1"]), dispute: true, todo: true };
  let pending;
  const node={nodeType:1,closest:()=>target};
  const context = {
    parent,
    getSelection:()=>({toString:()=>"x".repeat(2300),anchorNode:node,focusNode:node}),
    setTimeout:callback=>{pending=callback;return 1;},
    clearTimeout:()=>{pending=undefined;},
    location: { origin: "http://localhost" },
    document: {
      querySelectorAll: () => [target],
      getElementById: (id) => (id === target.id ? target : null),
      addEventListener: (event, listener) => (listeners[event] = listener),
      documentElement: { classList: { toggle: () => {} } },
    },
    addEventListener: (event, listener) => (listeners[event] = listener),
    state,
    DIMS: ["sec"],
    syncControls: () => {},
    apply: () => {
      target.offsetParent = {};
    },
    history: { replaceState: () => {} },
    scrollToEl: (el, options) => scroll.push({ el, options }),
  };
  const script = withBookBridge("<body></body>", "a".repeat(40)).match(
    /<script>([\s\S]*?)<\/script>/,
  )[1];
  vm.runInNewContext(script, context);
  const data = {
    channel: "utils-book",
    revision: "a".repeat(40),
    type: "navigate",
    anchor: target.id,
  };
  listeners.message({ origin: "http://evil", source: parent, data });
  listeners.message({ origin: "http://localhost", source: {}, data });
  listeners.message({
    origin: "http://localhost",
    source: parent,
    data: { ...data, revision: "b".repeat(40) },
  });
  listeners.message({
    origin: "http://localhost",
    source: parent,
    data: { ...data, anchor: "e-8-999" },
  });
  assert.equal(scroll.length, 0);
  listeners.message({ origin: "http://localhost", source: parent, data });
  assert.equal(scroll.length, 1);
  assert.equal(scroll[0].options.align, "start");
  assert.equal(state.q, "");
  assert.equal(state.sec.size, 0);
  assert.equal(state.dispute, false);
  assert.equal(state.todo, false);
  const count = sent.length;
  listeners.message({
    origin: "http://localhost",
    source: parent,
    data: { channel: "utils-book", type: "init" },
  });
  assert.equal(sent.length, count + 1);
  assert.equal(sent.at(-1).type, "ready");
  const beforeSelection=sent.length;
  listeners.pointerdown();listeners.selectionchange();assert.equal(pending,undefined);assert.equal(sent.length,beforeSelection);
  listeners.pointerup();pending();assert.equal(sent.at(-1).text.length,2000);assert.equal(sent.at(-1).truncated,true);assert.equal(sent.at(-1).anchor,target.id);
});
