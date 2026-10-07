import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_DATA_DIR } from "./workspace";

const SESSIONS_DIR = path.join(AGENT_DATA_DIR, "sessions");

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: number;
};

export type ChatSession = {
  id: string;
  /** Claude Code SDK session id — set after the first query, used to resume context. */
  sdkSessionId?: string;
  messages: ChatMessage[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return UUID_RE.test(id);
}

export async function loadSession(id: string): Promise<ChatSession | null> {
  if (!isValidSessionId(id)) return null;
  try {
    const raw = await readFile(path.join(SESSIONS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as ChatSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: ChatSession): Promise<void> {
  if (!isValidSessionId(session.id)) throw new Error("invalid session id");
  await mkdir(SESSIONS_DIR, { recursive: true });
  await writeFile(
    path.join(SESSIONS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2)
  );
}
