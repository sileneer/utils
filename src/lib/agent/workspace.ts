import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export const AGENT_DATA_DIR =
  process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), "data", "agent");

export const BOOK_REPO_URL = "https://github.com/eternity4719/HowToLiveBetter.git";

function cloneDir(): string {
  return path.join(AGENT_DATA_DIR, "HowToLiveBetter");
}

/**
 * Clean READER workspace for the chat agent. Deliberately NOT the repo
 * checkout itself: the repo's 82KB CLAUDE.md frames the agent as the book's
 * maintainer (edit/verify workflows), which hijacks reader Q&A. The reader
 * workspace carries only what the life-decision-guide skill needs in local
 * mode — book/*.md, README.md (section index), and the canonical SKILL.md
 * installed under .claude/skills for discovery.
 */
export function readerWorkspaceDir(): string {
  return path.join(AGENT_DATA_DIR, "reader");
}

function execGit(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { timeout: 120_000 }, (err) =>
      err ? reject(err) : resolve()
    );
  });
}

let initPromise: Promise<string> | null = null;

/** Idempotently prepare the reader workspace. */
export function ensureWorkspace(): Promise<string> {
  initPromise ??= initWorkspace();
  return initPromise;
}

async function initWorkspace(): Promise<string> {
  await mkdir(AGENT_DATA_DIR, { recursive: true });
  await mkdir(path.join(AGENT_DATA_DIR, "sessions"), { recursive: true });
  await mkdir(path.join(AGENT_DATA_DIR, "cache"), { recursive: true });

  // Skip Claude Code's first-run Anthropic connectivity check (third-party API).
  try {
    await mkdir(path.join(homedir(), ".claude"), { recursive: true });
    await writeFile(
      path.join(homedir(), ".claude.json"),
      JSON.stringify({ hasCompletedOnboarding: true }),
      { flag: "wx" }
    );
  } catch {
    // exists already
  }

  const reader = readerWorkspaceDir();
  const readyMarker = path.join(reader, "book", "01-不要早死.md");
  try {
    await access(readyMarker);
    return reader;
  } catch {
    // assemble below
  }

  // 1. shallow-clone the upstream repo (book source of truth)
  const clone = cloneDir();
  try {
    await access(path.join(clone, "README.md"));
  } catch {
    await mkdir(clone, { recursive: true });
    await execGit(["clone", "--depth", "1", BOOK_REPO_URL, clone]);
  }

  // 2. assemble the reader workspace from the clone
  await mkdir(path.join(reader, ".claude", "skills", "life-decision-guide"), {
    recursive: true,
  });
  await cp(path.join(clone, "book"), path.join(reader, "book"), {
    recursive: true,
  });
  await cp(path.join(clone, "README.md"), path.join(reader, "README.md"));
  await cp(
    path.join(clone, "skills", "life-decision-guide", "SKILL.md"),
    path.join(reader, ".claude", "skills", "life-decision-guide", "SKILL.md")
  );
  return reader;
}
