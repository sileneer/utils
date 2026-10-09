import type { Citation } from "./citations";

export type EntryPreview = Citation & {
  revision: string;
  title: string;
  excerpt: string;
  truncated: boolean;
};

export function parsePreview(
  value: unknown,
  revision: string,
  citation: Citation,
): EntryPreview {
  const v = value as Partial<EntryPreview> | null;
  if (
    !v || v.revision !== revision || v.anchor !== citation.anchor ||
    v.section !== citation.section || v.item !== citation.item ||
    typeof v.title !== "string" || !v.title || v.title.length > 500 ||
    typeof v.excerpt !== "string" || v.excerpt.length > 700 ||
    typeof v.truncated !== "boolean"
  ) throw new Error("source_unavailable");
  return {
    revision, ...citation, title: v.title,
    excerpt: v.excerpt, truncated: v.truncated,
  };
}
