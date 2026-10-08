/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit local-only UI fixture. This is never imported by the application.
const http = require("node:http");
const sessions = new Map();
const upstream = "http://127.0.0.1:3000";
let revision;
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
    if (url.pathname === "/api/agent/session") {
      const id = url.searchParams.get("id");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          authed: true,
          ...(id ? { session: sessions.get(id) ?? null } : {}),
        }),
      );
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
      const session = sessions.get(body.sessionId) ?? {
        id: body.sessionId,
        messages: [],
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
      };
      session.messages.push(assistant);
      sessions.set(body.sessionId, session);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      send({ type: "start", sessionId: body.sessionId, revision });
      send({ type: "status", stage: "searching" });
      let offset = 0;
      const text = body.message.includes("[eof]")
        ? "An incomplete answer"
        : answer;
      const interval = setInterval(
        () => {
          if (offset < text.length) {
            const delta = text.slice(offset, offset + 120);
            offset += 120;
            assistant.content += delta;
            send({ type: "status", stage: "answering" });
            send({ type: "delta", text: delta });
          } else {
            clearInterval(interval);
            if (body.message.includes("[eof]")) {
              assistant.status = "failed";
              assistant.error = "disconnected";
            } else if (body.message.includes("[timeout]")) {
              assistant.status = "failed";
              assistant.error = "timeout";
              send({ type: "error", code: "timeout" });
            } else {
              assistant.status = "complete";
              send({ type: "replace", text });
              send({ type: "done" });
            }
            res.end();
          }
        },
        body.message.includes("[slow]") ? 600 : 30,
      );
      res.on("close", () => {
        clearInterval(interval);
        if (assistant.status === "streaming") {
          assistant.status = "stopped";
          assistant.error = "stopped";
        }
      });
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
