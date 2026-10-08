import { parseMessageDetails, type MessageDetails } from "./details";
export type MessageStatus =
  "pending" | "streaming" | "complete" | "failed" | "stopped";
export type BookContext = {
  text: string;
  revision: string;
  section?: number;
  item?: number;
};
export type ChatMessage = {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  status: MessageStatus;
  error?: string;
  context?: BookContext;
  revision?: string;
  details?: MessageDetails;
};
export type ChatEvent =
  | { type: "start"; sessionId: string; revision: string }
  | { type: "status"; stage: "preparing" | "searching" | "answering" }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string }
  | { type: "details"; details: MessageDetails }
  | { type: "done" }
  | { type: "error"; code: string };

/** Parse complete SSE frames, preserving chunked UTF-8 and requiring a terminal event. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let event = JSON.parse(data) as ChatEvent;
        if (!event || typeof event !== "object")
          throw new Error("invalid_stream");
        if (
          ![
            "start",
            "status",
            "delta",
            "replace",
            "details",
            "done",
            "error",
          ].includes(event.type)
        )
          throw new Error("invalid_stream");
        if (
          (event.type === "delta" || event.type === "replace") &&
          typeof event.text !== "string"
        )
          throw new Error("invalid_stream");
        if (
          event.type === "start" &&
          (typeof event.sessionId !== "string" ||
            typeof event.revision !== "string")
        )
          throw new Error("invalid_stream");
        if (
          event.type === "status" &&
          !["preparing", "searching", "answering"].includes(event.stage)
        )
          throw new Error("invalid_stream");
        if (event.type === "error" && typeof event.code !== "string")
          throw new Error("invalid_stream");
        if (event.type === "details") {
          const details = parseMessageDetails(event.details);
          if (!details) throw new Error("invalid_stream");
          event = { type: "details", details };
        }
        onEvent(event);
        if (event.type === "done" || event.type === "error") {
          terminal = true;
          break;
        }
      }
      if (done) break;
    }
    if (!terminal) throw new Error("disconnected");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function completedHistory(messages: ChatMessage[]): string {
  const turns = messages
    .filter((m) => m.role === "assistant" && m.status === "complete")
    .map((m) => m.turnId);
  return JSON.stringify(
    messages
      .filter((m) => turns.includes(m.turnId))
      .map(({ role, content, context }) => ({
        role,
        content,
        ...(context ? { quotedBookText: context.text } : {}),
      })),
  );
}
