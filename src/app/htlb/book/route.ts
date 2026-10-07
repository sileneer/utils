import { mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BOOK_URL =
  "https://github.com/eternity4719/HowToLiveBetter/releases/download/epub-latest/HowToLiveBetter.html";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // revalidate once a day

function cachePath(): string {
  const dataDir =
    process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), "data", "agent");
  return path.join(dataDir, "cache", "htlb-book.html");
}

async function fetchAndCache(): Promise<void> {
  const response = await fetch(BOOK_URL, { redirect: "follow" });
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  const html = await response.text();
  const target = cachePath();
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, html, "utf8");
  await rename(tmp, target);
}

async function readCache(): Promise<string | null> {
  try {
    return await readFile(cachePath(), "utf8");
  } catch {
    return null;
  }
}

async function cacheAge(): Promise<number> {
  try {
    const info = await stat(cachePath());
    return Date.now() - info.mtimeMs;
  } catch {
    return Infinity;
  }
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

/**
 * Serves the HowToLiveBetter single-file book (CC BY 4.0), cached on the data
 * volume and revalidated daily so book updates on the upstream repo flow
 * through automatically.
 */
export async function GET() {
  let stale: string | null = null;
  if ((await cacheAge()) < MAX_AGE_MS) {
    const cached = await readCache();
    if (cached) return htmlResponse(cached);
  } else {
    stale = await readCache();
  }

  try {
    await fetchAndCache();
    const fresh = await readCache();
    return fresh
      ? htmlResponse(fresh)
      : NextResponse.json({ error: "book_unavailable" }, { status: 502 });
  } catch (err) {
    if (stale) {
      console.error("book refresh failed, serving stale:", err);
      return htmlResponse(stale);
    }
    console.error("book fetch failed:", err);
    return NextResponse.json({ error: "book_unavailable" }, { status: 502 });
  }
}

export async function POST() {
  // manual refresh
  try {
    await fetchAndCache();
    return NextResponse.json({ ok: true, bytes: (await stat(cachePath())).size });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "refresh_failed" },
      { status: 502 }
    );
  }
}
