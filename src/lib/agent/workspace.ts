import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { getBook } from "../book/source";
export { AGENT_DATA_DIR } from "../book/source";

/** A clean reader workspace pinned to exactly the HTML's source commit. */
export async function ensureWorkspace(revision?: string) {
  try {
    await mkdir(path.join(homedir(), ".claude"), { recursive: true });
    await writeFile(
      path.join(homedir(), ".claude.json"),
      JSON.stringify({ hasCompletedOnboarding: true }),
      { flag: "wx" },
    );
  } catch {
    /* Existing onboarding file is preserved. */
  }
  return (await getBook(revision)).workspace;
}
