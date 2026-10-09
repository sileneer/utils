import { aiConfiguration } from "./config";
import { isAllowedAgentModel } from "./models";
import { loadBookSections } from "../book/entries";
import { formatSearch } from "../book/search";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const SECTION_CHARACTERS = 3_000;
/** No arbitrary paths, glob, regex execution, shell or network exposed to model. */
export async function bookTools(workspace: string) {
  const books = await loadBookSections(workspace);
  const text = (value: string) => ({
    content: [{ type: "text" as const, text: value }],
  });
  return createSdkMcpServer({
    name: "book",
    version: "1.1.0",
    tools: [
      tool(
        "search",
        "Search verified numbered entries by literal keywords (up to six, separated by spaces). All keywords must match; a small explicit synonym list is supported. Returns ranked titles, section/item/offset locators and bounded excerpts.",
        { phrase: z.string().trim().min(1).max(100).refine(v => v.split(/\s+/).length <= 6) },
        async ({ phrase }) => text(formatSearch(books, phrase)),
      ),
      tool(
        "read_section",
        "Read one book section, numbered 1–34. Use offset to continue long sections.",
        {
          section: z.number().int().min(1).max(34),
          offset: z.number().int().min(0).max(500_000).default(0),
        },
        async ({ section, offset }) => {
          const book = books.find((b) =>
            b.name.startsWith(String(section).padStart(2, "0") + "-"),
          );
          return text(
            book
              ? `${book.name}\n${book.text.slice(offset, offset + SECTION_CHARACTERS)}\n[${offset + SECTION_CHARACTERS < book.text.length ? `Continue at offset ${offset + SECTION_CHARACTERS}` : "End"}]`
              : "Section unavailable.",
          );
        },
      ),
    ],
  });
}
export function agentEnvironment(model: string) {
  const config = aiConfiguration();
  if (!config || !isAllowedAgentModel(model, config.modelConfig.models)) throw new Error("ai_configuration_missing");
  const result: Record<string, string> = {};
  for (const key of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "PATHEXT",
    "COMSPEC",
    "NODE_EXTRA_CA_CERTS",
  ]) {
    if (process.env[key]) result[key] = process.env[key]!;
  }
  result.ANTHROPIC_AUTH_TOKEN = config.apiKey;
  result.ANTHROPIC_BASE_URL = config.baseUrl;
  result.ANTHROPIC_MODEL = model;
  for (const key of ["ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"]) result[key] = config.slots[key] ?? model;
  return result;
}
