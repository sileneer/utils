import { entriesIn, type BookSection } from "./entries";
const ALIASES = [
  ["二次验证", "双重验证", "两步验证", "2fa"],
  ["拉肚子", "腹泻"],
  ["睡不着", "失眠"],
  ["止痛药", "镇痛药"],
];
export function searchBook(books: BookSection[], phrase: string) {
  const query = phrase.trim().toLowerCase();
  if (!query || query.length > 100) throw new Error("bad_search");
  const terms = [...new Set(query.split(/\s+/))];
  if (terms.length > 6) throw new Error("bad_search");
  const groups = terms.map(term => ALIASES.find(group => group.includes(term)) ?? [term]);
  const candidates = books.flatMap(book => entriesIn(book).flatMap(entry => {
    const body = entry.text.toLowerCase(), title = entry.title.toLowerCase();
    if (!groups.every(group => group.some(term => body.includes(term)))) return [];
    const score = (title.includes(query) ? 100 : 0) + (body.includes(query) ? 20 : 0) + groups.reduce((sum, group, index) => sum + (title.includes(terms[index]) ? 10 : group.some(term => title.includes(term)) ? 6 : 1), 0);
    const matches = groups.flatMap(group => group.map(term => body.indexOf(term)).filter(at => at >= 0));
    const offset = Math.max(entry.offset, entry.offset + Math.min(...matches) - 120);
    return [{ ...entry, score, offset, excerpt: book.text.slice(offset, Math.min(entry.end, offset + 480)) }];
  })).sort((a,b) => b.score-a.score || a.section-b.section || a.item-b.item);
  // First cover sections without hiding further matches when only one section fits.
  const chosen: typeof candidates = [], deferred: typeof candidates = [];
  const counts = new Map<number,number>();
  for (const entry of candidates) {
    const count = counts.get(entry.section) ?? 0;
    if (count < 2 && chosen.length < 6) { chosen.push(entry); counts.set(entry.section,count+1); }
    else deferred.push(entry);
  }
  return [...chosen, ...deferred].slice(0,6);
}
export function formatSearch(books: BookSection[], phrase: string) {
  const hits = searchBook(books, phrase);
  return (hits.map(hit => "第 " + hit.section + " 节第 " + hit.item + " 条 · " + hit.title + " [read_section section=" + hit.section + " offset=" + hit.offset + "]\n" + hit.excerpt).join("\n\n") || "No matching entries. Try shorter keywords or another synonym. Do not infer an answer from no matches.").slice(0,4000);
}
