import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isRevision } from "../chat/citations";

export const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), "data", "agent");
const BOOK_URL =
  "https://github.com/eternity4719/HowToLiveBetter/releases/download/epub-latest/HowToLiveBetter.html";
const REPO_URL = "https://github.com/eternity4719/HowToLiveBetter.git";
const versions = path.join(AGENT_DATA_DIR, "versions");
type Manifest = { revision: string; checkedAt: number };
export type BookBundle = Manifest & { html: string; workspace: string };

function git(args: string[]) {
  return new Promise<string>((resolve, reject) =>
    execFile("git", args, { timeout: 120_000 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim()),
    ),
  );
}
async function atomicJson(target: string, value: unknown) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, target);
}
export function htmlRevision(html: string): string {
  const revision = html.match(/正文提交\s+([a-f0-9]{7,40})/i)?.[1];
  if (!revision) throw new Error("book_revision_missing");
  return revision.toLowerCase();
}
async function readBundle(revision: string): Promise<BookBundle> {
  if (!isRevision(revision)) throw new Error("book_revision_missing");
  const directory = path.join(versions, revision);
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  ) as Manifest;
  if (manifest.revision !== revision) throw new Error("book_revision_missing");
  const html = await readFile(path.join(directory, "book.html"), "utf8");
  if (!revision.startsWith(htmlRevision(html)))
    throw new Error("book_revision_missing");
  const workspace = path.join(directory, "reader");
  await access(path.join(workspace, "README.md"));
  return { ...manifest, html, workspace };
}
async function current(): Promise<BookBundle | null> {
  try {
    const pointer = JSON.parse(
      await readFile(path.join(versions, "current.json"), "utf8"),
    ) as Manifest;
    return {
      ...(await readBundle(pointer.revision)),
      checkedAt: pointer.checkedAt,
    };
  } catch {
    return null;
  }
}
let refreshing: Promise<BookBundle> | undefined;
async function refresh(): Promise<BookBundle> {
  const previous = await current();
  try {
    const response = await fetch(BOOK_URL, {
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("book_unavailable");
    const html = await response.text();
    const short = htmlRevision(html);
    let bundle = previous;
    if (!bundle?.revision.startsWith(short)) {
      const commit = await fetch(
        `https://api.github.com/repos/eternity4719/HowToLiveBetter/commits/${short}`,
        { signal: AbortSignal.timeout(30_000), cache: "no-store" },
      );
      if (!commit.ok) throw new Error("book_revision_missing");
      const revision: unknown = (await commit.json()).sha;
      if (
        typeof revision !== "string" ||
        !/^[a-f0-9]{40}$/.test(revision) ||
        !revision.startsWith(short)
      )
        throw new Error("book_revision_missing");
      try {
        bundle = await readBundle(revision);
      } catch {
        await mkdir(versions, { recursive: true });
        const staging = path.join(versions, `.prepare-${randomUUID()}`);
        try {
          const checkout = path.join(staging, "checkout");
          await mkdir(checkout, { recursive: true });
          await git(["init", checkout]);
          await git([
            "-C",
            checkout,
            "fetch",
            "--depth",
            "1",
            REPO_URL,
            revision,
          ]);
          await git(["-C", checkout, "checkout", "--detach", "FETCH_HEAD"]);
          if ((await git(["-C", checkout, "rev-parse", "HEAD"])) !== revision)
            throw new Error("book_revision_missing");
          const reader = path.join(staging, "reader");
          await mkdir(
            path.join(reader, ".claude", "skills", "life-decision-guide"),
            { recursive: true },
          );
          await cp(path.join(checkout, "book"), path.join(reader, "book"), {
            recursive: true,
          });
          await cp(
            path.join(checkout, "README.md"),
            path.join(reader, "README.md"),
          );
          await cp(
            path.join(checkout, "skills", "life-decision-guide", "SKILL.md"),
            path.join(
              reader,
              ".claude",
              "skills",
              "life-decision-guide",
              "SKILL.md",
            ),
          );
          await writeFile(path.join(staging, "book.html"), html);
          await atomicJson(path.join(staging, "manifest.json"), {
            revision,
            checkedAt: Date.now(),
          });
          // Discard only our temporary checkout; retain the small immutable reader pair.
          if (
            path.dirname(checkout) !== staging ||
            path.dirname(staging) !== versions
          )
            throw new Error("invalid_staging_path");
          await rm(checkout, { recursive: true, force: true });
          try {
            await rename(staging, path.join(versions, revision));
          } catch (error) {
            try {
              await readBundle(revision);
            } catch {
              throw error;
            }
          }
          bundle = await readBundle(revision);
        } finally {
          if (path.dirname(staging) === versions)
            await rm(staging, { recursive: true, force: true });
        }
      }
    }
    if (!bundle) throw new Error("book_unavailable");
    const checkedAt = Date.now();
    await atomicJson(path.join(versions, "current.json"), {
      revision: bundle.revision,
      checkedAt,
    });
    return { ...bundle, checkedAt };
  } catch {
    if (previous) return previous;
    throw new Error("book_unavailable");
  }
}
export async function getBook(
  revision?: string,
  force = false,
): Promise<BookBundle> {
  if (revision) return readBundle(revision);
  const cached = await current();
  if (!force && cached && Date.now() - cached.checkedAt < 86_400_000)
    return cached;
  refreshing ??= refresh().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}
