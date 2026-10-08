export type Citation = { section: number; item: number; anchor: string };
export function extractCitations(text: string): Citation[] {
  const found = new Map<string, Citation>();
  // Only explicit section/item references. Ambiguous ranges are left as text.
  const pattern =
    /第\s*(\d{1,2})\s*节\s*第\s*(\d{1,3}(?:\s*[、/,，]\s*\d{1,3})*)\s*条/g;
  for (const match of text.matchAll(pattern)) {
    const section = Number(match[1]);
    for (const number of match[2].split(/[、/,，]/)) {
      const item = Number(number.trim());
      if (section < 1 || section > 34 || item < 1) continue;
      const anchor = `e-${section}-${item}`;
      found.set(anchor, { section, item, anchor });
    }
  }
  return [...found.values()];
}

export function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{7,40}$/i.test(value);
}
export function isEntryAnchor(value: unknown): value is string {
  return typeof value === "string" && /^e-\d{1,2}-\d{1,3}$/.test(value);
}
