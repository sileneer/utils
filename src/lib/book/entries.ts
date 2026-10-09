import { readdir, readFile, realpath, lstat } from "node:fs/promises";
import path from "node:path";

export type BookSection = { name: string; text: string; section: number };
export type BookEntry = {
  section: number;
  item: number;
  anchor: string;
  title: string;
  text: string;
  offset: number;
  end: number;
};

/** Read only numbered regular Markdown files inside the verified book directory. */
export async function loadBookSections(
  workspace: string,
  section?: number,
): Promise<BookSection[]> {
  const directory = await realpath(path.join(workspace, "book"));
  const names = (await readdir(directory))
    .filter((name) =>
      /^\d{2}-[^/\\]+\.md$/.test(name) &&
      (section === undefined || Number(name.slice(0, 2)) === section),
    )
    .sort();
  return Promise.all(names.map(async (name) => {
    const filename = path.join(directory, name);
    const stat = await lstat(filename);
    if (
      !stat.isFile() || stat.isSymbolicLink() ||
      path.dirname(await realpath(filename)) !== directory
    ) throw new Error("book_invalid_path");
    return {
      name,
      section: Number(name.slice(0, 2)),
      text: await readFile(filename, "utf8"),
    };
  }));
}

export function entriesIn(book: BookSection): BookEntry[] {
  const headings = [...book.text.matchAll(/^###\s+(\d{1,3})\.\s+([^\r\n]+)\r?$/gm)];
  const seen = new Set<number>();
  return headings.map((match, index) => {
    const item = Number(match[1]);
    if (!item || seen.has(item)) throw new Error("book_invalid_entries");
    seen.add(item);
    const offset = match.index!;
    const boundary = headings[index + 1]?.index ?? book.text.length;
    // A section footer or license is not part of the last numbered entry.
    const trailingHeading = /^#{1,2}\s+/m.exec(book.text.slice(offset, boundary));
    const end = trailingHeading ? offset + trailingHeading.index : boundary;
    return {
      section: book.section, item, anchor: "e-" + book.section + "-" + item,
      title: match[2].trim(), offset, end, text: book.text.slice(offset, end),
    };
  });
}

export function entryPreview(book: BookSection, item: number) {
  const entry = entriesIn(book).find((value) => value.item === item);
  if (!entry) return null;
  const body = entry.text
    .replace(/^###[^\r\n]+\r?\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return {
    anchor: entry.anchor, section: entry.section, item, title: entry.title,
    excerpt: body.slice(0, 700), truncated: body.length > 700,
  };
}
