import { NextResponse } from "next/server";
import { getBook } from "@/lib/book/source";
import { withBookBridge } from "@/lib/book/bridge";
import { BOOK_CSP } from "@/lib/book/isolation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const book = await getBook(
      new URL(request.url).searchParams.get("revision") ?? undefined,
    );
    const parentOrigin = new URL(process.env.APP_URL || request.url).origin;
    return new Response(withBookBridge(book.html, book.revision, parentOrigin), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-book-revision": book.revision,
        "content-security-policy": BOOK_CSP,
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "book_unavailable" }, { status: 502 });
  }
}
export async function POST() {
  try {
    const book = await getBook(undefined, true);
    return NextResponse.json({ ok: true, revision: book.revision });
  } catch {
    return NextResponse.json(
      { ok: false, error: "book_unavailable" },
      { status: 502 },
    );
  }
}
