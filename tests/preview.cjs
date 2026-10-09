/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit local-only UI fixture. This is never imported by the application.
const http = require("node:http");
const sessions = new Map();
const upstream = "http://127.0.0.1:3000";
let revision,
  active,
  used = 0,
  modelCalls = 0;
let statusOffline = false;
const identity = {
  id: "qa-reader",
  name: "QA mock",
  email: "reader@example.test",
};
const availability = () => ({
  enabled: true,
  used,
  limit: 100,
  remaining: 100 - used,
  resetAt: new Date().setUTCHours(24, 0, 0, 0),
  service: active ? "busy" : "ready",
});
const answer =
  "## A small, practical comparison\n\nChoose one change you can keep doing. Check **the conditions** before applying it.\n\n- Read the original entry.\n- Compare cost, effort, and evidence.\n\n> A citation locates the source; it does not certify the conclusion.\n\n| Choice | Cost | Evidence |\n| --- | --- | --- |\n| First step | No purchase | See original |\n| Alternative | Depends on your situation | See original |\n\n```text\nquestion → source → tradeoffs → next step\n```\n\nSee 第 8 节第 18/45 条. Missing reference: 第 8 节第 999 条.\n\n" +
  "A long link: https://example.com/" +
  "long-path-".repeat(18) +
  "\n\n" +
  Array.from(
    { length: 14 },
    (_, i) =>
      `### Note ${i + 1}\n\nKeep the answer connected to the passage, its assumptions, and your own situation.`,
  ).join("\n\n");
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost:3001");
    if (url.pathname === "/__qa/offline" || url.pathname === "/__qa/online") {
      statusOffline = url.pathname.endsWith("offline");
      res.end("Explicit mock status changed.");
      return;
    }
    if (url.pathname === "/__qa/state") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          modelCalls,
          used,
          active: active?.turnId,
          sessions: sessions.size,
        }),
      );
      return;
    }
    if (url.pathname === "/api/agent/session") {
      if (statusOffline) {
        res.statusCode = 503;
        res.end("Explicit mock status failure.");
        return;
      }
      const id = url.searchParams.get("id"),
        session = id ? sessions.get(id) : null;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      if (id && !session) {
        res.statusCode = 404;
        res.end('{"error":"not_found"}');
        return;
      }
      res.end(
        JSON.stringify({
          authed: true,
          user: identity,
          availability: availability(),
          ...(active
            ? {
                active: {
                  sessionId: active.sessionId,
                  turnId: active.turnId,
                  startedAt: active.startedAt,
                  state: active.stopping ? "stopping" : "running",
                },
              }
            : {}),
          ...(id ? { session } : {}),
        }),
      );
      return;
    }
    if (url.pathname === "/api/agent/conversations") {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      if (req.method === "PATCH") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw),
          session = sessions.get(body.id);
        if (!session) {
          res.statusCode = 404;
          res.end('{"error":"not_found"}');
          return;
        }
        if (body.archived !== undefined && active?.sessionId === body.id) {
          res.statusCode = 409;
          res.end('{"error":"busy"}');
          return;
        }
        if (body.title !== undefined)
          session.title = body.title.trim().replace(/\s+/g, " ");
        if (body.archived !== undefined) session.archived = body.archived;
        res.end('{"ok":true}');
        return;
      }
      const q = (url.searchParams.get("q") || "").toLowerCase(),
        archived = url.searchParams.get("archived") === "1",
        offset = Number(url.searchParams.get("cursor") || 0);
      const all = [...sessions.values()]
        .filter(
          (s) => s.archived === archived && s.title.toLowerCase().includes(q),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
      res.end(
        JSON.stringify({
          items: all
            .slice(offset, offset + 20)
            .map(({ id, title, updatedAt, archived }) => ({
              id,
              title,
              updatedAt,
              archived,
            })),
          ...(all.length > offset + 20 ? { cursor: String(offset + 20) } : {}),
        }),
      );
      return;
    }
    if (url.pathname === "/api/agent/stop") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      res.setHeader("content-type", "application/json");
      if (active?.turnId === body.turnId) {
        if (active.failStop) {
          res.statusCode = 503;
          res.end('{"error":"mock_stop_failure"}');
          return;
        }
        active.stopping = true;
        const target = active;
        setTimeout(() => {
          if (active === target) target.finish("stopped");
        }, 1500);
        res.end('{"stopped":true}');
        return;
      }
      res.end('{"stopped":false}');
      return;
    }
    if (url.pathname === "/api/agent/chat") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (body.message.includes("[busy]")) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end('{"error":"busy"}');
        return;
      }
      if (body.message.includes("[401]")) {
        res.writeHead(401);
        res.end();
        return;
      }
      if (active) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end('{"error":"busy"}');
        return;
      }
      modelCalls++;
      used++;
      const session = sessions.get(body.sessionId) ?? {
        id: body.sessionId,
        messages: [],
        title: body.message.slice(0, 100),
        archived: false,
        updatedAt: Date.now(),
        revision,
      };
      session.messages = session.messages.filter(
        (m) => m.turnId !== body.turnId,
      );
      session.messages.push({
        id: body.turnId + "-user",
        turnId: body.turnId,
        role: "user",
        revision,
        content: body.message,
        status: "complete",
        at: Date.now(),
        context: body.context,
      });
      const assistant = {
        id: body.turnId + "-assistant",
        turnId: body.turnId,
        role: "assistant",
        revision,
        content: "",
        status: "streaming",
        at: Date.now(),
        details: {
          model: body.model,
          startedAt: Date.now(),
          searchCalls: 1,
          readCalls: 1,
        },
      };
      session.messages.push(assistant);
      sessions.set(body.sessionId, session);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const send = (event) => {
        if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      send({ type: "start", sessionId: body.sessionId, revision });
      send({ type: "status", stage: "searching" });
      send({ type: "details", details: assistant.details });
      let offset = 0,
        interval;
      const text = body.message.includes("[eof]")
        ? "An incomplete answer"
        : body.message.includes("[short]")
          ? "A short mock answer. See 第 8 节第 18 条."
          : answer;
      function finish(status) {
        clearInterval(interval);
        assistant.status = status;
        assistant.error =
          status === "complete"
            ? undefined
            : status === "stopped"
              ? "stopped"
              : body.message.includes("[timeout]")
                ? "timeout"
                : "disconnected";
        assistant.details.durationMs = Date.now() - assistant.at;
        if (status === "complete")
          assistant.details.tokens = {
            input: 1250,
            output: 320,
            cacheRead: 500,
            cacheWrite: 150,
          };
        session.updatedAt = Date.now();
        active = undefined;
        send({ type: "details", details: assistant.details });
        if (status === "complete") {
          send({ type: "replace", text });
          send({ type: "done" });
        } else if (!body.message.includes("[eof]"))
          send({ type: "error", code: assistant.error });
        res.end();
      }
      active = {
        sessionId: body.sessionId,
        turnId: body.turnId,
        startedAt: assistant.at,
        stopping: false,
        failStop: body.message.includes("[stop-fail]"),
        finish,
      };
      interval = setInterval(
        () => {
          if (offset < text.length) {
            const delta = text.slice(offset, offset + 120);
            offset += 120;
            if (assistant.details.firstTextMs === undefined)
              assistant.details.firstTextMs = Date.now() - assistant.at;
            assistant.content += delta;
            send({ type: "status", stage: "answering" });
            send({ type: "delta", text: delta });
            if (body.message.includes("[disconnect]") && offset === 120)
              res.end();
          } else
            finish(
              body.message.includes("[eof]") ||
                body.message.includes("[timeout]")
                ? "failed"
                : "complete",
            );
        },
        body.message.includes("[slow]") ? 300 : 30,
      );
      // A disconnected fixture transport does not fabricate termination. Its
      // explicit mock server continues to a persisted terminal snapshot.
      return;
    }
    const headers = { ...req.headers, host: "127.0.0.1:3000" };
    const proxy = http.request(
      upstream + req.url,
      { method: req.method, headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.writeHead(502);
      res.end("Start the application on port 3000 first.");
    });
    req.pipe(proxy);
  })
  .listen(3001, "127.0.0.1", async () => {
    const response = await fetch(upstream + "/htlb/book");
    revision = response.headers.get("x-book-revision");
    console.log(
      "Test-only UI fixture: http://localhost:3001/htlb (no paid calls)",
    );
  });
