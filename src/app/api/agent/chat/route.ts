import { randomUUID } from "node:crypto";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/agent/auth";
import { ensureWorkspace } from "@/lib/agent/workspace";
import { loadSession, saveSession, type ChatMessage } from "@/lib/agent/sessions";

export const dynamic = "force-dynamic";

// Single concurrency: one 1GB VM runs one agent query at a time.
let busy = false;

function sse(controller: ReadableStreamDefaultController, payload: unknown) {
  controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (busy) {
    return NextResponse.json({ error: "busy" }, { status: 429 });
  }

  let body: { message?: unknown; sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId
      ? body.sessionId
      : randomUUID();
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  busy = true;
  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      try {
        const workspace = await ensureWorkspace();
        const existing = await loadSession(sessionId);
        const session = existing ?? { id: sessionId, messages: [] as ChatMessage[] };

        sse(controller, { type: "start", sessionId });

        const abortController = new AbortController();
        request.signal.addEventListener("abort", () => abortController.abort());

        const queryOptions = {
          cwd: workspace,
          model: process.env.ANTHROPIC_MODEL,
          // Custom (non-preset) system prompt: replaces the default one so the
          // upstream repo's maintainer-oriented CLAUDE.md is never loaded.
          systemPrompt:
            "你是《高性价比人生指南》的读书问答助手，面向书的读者。凡涉及人生决策的问题，" +
            "先使用 life-decision-guide 技能查书再回答，回答与用户同语言。书之外的问题正常聊，" +
            "但不要执行任何修改文件的操作。",
          // The SDK REPLACES the subprocess env — spread ours and map the key.
          env: {
            ...process.env,
            ANTHROPIC_AUTH_TOKEN: process.env.SENSENOVA_API_KEY ?? "",
          },
          // Book Q&A only: read/search tools, no writes, no network tools.
          tools: ["Read", "Grep", "Glob", "Bash"],
          allowedTools: ["Read", "Grep", "Glob", "Bash"],
          maxTurns: 40,
          abortController,
          includePartialMessages: true,
          ...(session.sdkSessionId ? { resume: session.sdkSessionId } : {}),
        };

        for await (const msg of query({ prompt: message, options: queryOptions })) {
          if (msg.type === "system" && msg.subtype === "init") {
            session.sdkSessionId = msg.session_id;
          } else if (msg.type === "stream_event") {
            const event = msg.event;
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              assistantText += event.delta.text;
              sse(controller, { type: "delta", text: event.delta.text });
            }
          } else if (msg.type === "assistant") {
            const text = (msg.message?.content ?? [])
              .filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("");
            if (text && text.length > assistantText.length) assistantText = text;
          } else if (msg.type === "result") {
            if (msg.subtype === "success" && msg.result && !assistantText) {
              assistantText = msg.result;
            }
            if (msg.subtype !== "success") {
              sse(controller, { type: "error", message: msg.subtype });
            }
          }
        }

        session.messages.push({ role: "user", content: message, at: Date.now() });
        if (assistantText) {
          session.messages.push({
            role: "assistant",
            content: assistantText,
            at: Date.now(),
          });
        }
        await saveSession(session);

        sse(controller, { type: "done" });
      } catch (err) {
        console.error("agent chat failed:", err);
        sse(controller, {
          type: "error",
          message: err instanceof Error ? err.message : "agent_failed",
        });
      } finally {
        busy = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
