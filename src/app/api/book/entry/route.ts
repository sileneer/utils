import { getBook } from "@/lib/book/source";
import { loadBookSections, entryPreview } from "@/lib/book/entries";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

/** Public book text only; exact cached revision, no agent or account operation. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const revision = params.get("revision") ?? "";
  const sectionValue = params.get("section") ?? "";
  const itemValue = params.get("item") ?? "";
  const section = Number(sectionValue), item = Number(itemValue);
  if (
    !/^[a-f0-9]{40}$/i.test(revision) ||
    !/^\d{1,2}$/.test(sectionValue) || !/^\d{1,3}$/.test(itemValue) ||
    section < 1 || section > 34 || item < 1
  ) return Response.json({ error: "bad_request" }, { status: 400, headers });
  try {
    const bundle = await getBook(revision.toLowerCase());
    const books = await loadBookSections(bundle.workspace, section);
    if (books.length !== 1) throw new Error("book_invalid_entries");
    const entry = entryPreview(books[0], item);
    if (!entry)
      return Response.json({ error: "not_found" }, { status: 404, headers });
    return Response.json({ ...entry, revision: bundle.revision }, { headers });
  } catch {
    return Response.json({ error: "source_unavailable" }, { status: 502, headers });
  }
}
