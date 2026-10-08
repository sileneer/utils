import { readdir, readFile, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
/** No arbitrary paths, glob, regex execution, shell or network exposed to model. */
export async function bookTools(workspace: string) {
  const directory = await realpath(path.join(workspace, "book"));
  const names = (await readdir(directory))
    .filter((n) => /^\d{2}-[^/\\]+\.md$/.test(n))
    .sort();
  const books = await Promise.all(
    names.map(async (name) => {
      const filename = path.join(directory, name);
      if (
        (await lstat(filename)).isSymbolicLink() ||
        path.dirname(await realpath(filename)) !== directory
      )
        throw new Error("book_invalid_path");
      return { name, text: await readFile(filename, "utf8") };
    }),
  );
  const text = (value: string) => ({
    content: [{ type: "text" as const, text: value }],
  });
  return createSdkMcpServer({
    name: "book",
    version: "1.0.0",
    tools: [
      tool(
        "search",
        "Search verified book Markdown by literal phrase. Returns matching sections and bounded excerpts.",
        { phrase: z.string().min(1).max(100) },
        async ({ phrase }) => {
          const matches: string[] = [];
          for (const book of books) {
            const needle = phrase.toLowerCase(),
              haystack = book.text.toLowerCase();
            let from = 0;
            for (let i = 0; i < 3; i++) {
              const at = haystack.indexOf(needle, from);
              if (at < 0) break;
              matches.push(
                `${book.name}\n${book.text.slice(Math.max(0, at - 400), at + 800)}`,
              );
              from = at + needle.length;
            }
            if (matches.length >= 12) break;
          }
          return text(
            matches.join("\n\n").slice(0, 16_000) ||
              "No matching entries. Try a shorter phrase.",
          );
        },
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
              ? `${book.name}\n${book.text.slice(offset, offset + 12_000)}\n[${offset + 12_000 < book.text.length ? `Continue at offset ${offset + 12_000}` : "End"}]`
              : "Section unavailable.",
          );
        },
      ),
    ],
  });
}
export function agentEnvironment() {
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
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
  ]) {
    if (process.env[key]) result[key] = process.env[key]!;
  }
  result.ANTHROPIC_AUTH_TOKEN = process.env.SENSENOVA_API_KEY ?? "";
  return result;
}
