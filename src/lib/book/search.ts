import { entriesIn, type BookSection } from "./entries";
const ALIASES = [
  ["二次验证", "双重验证", "两步验证", "2fa"],
  ["拉肚子", "腹泻"],
  ["睡不着", "失眠"],
  ["止痛药", "镇痛药"],
];
/** Smallest literal window covering every term group, used only to break relevance ties. */
function coveringSpan(text: string, groups: string[][]) {
  const positions: { at: number; end: number; group: number }[] = [];
  groups.forEach((aliases,group)=>aliases.forEach(term=>{
    let from=0;for(;;){const at=text.indexOf(term,from);if(at<0)break;
      positions.push({at,end:at+term.length,group});from=at+term.length;}
  }));
  positions.sort((a,b)=>a.at-b.at||a.group-b.group);
  const counts=new Map<number,number>(),maxEnds:number[]=[];let left=0,best=Infinity,head=0;
  for(let right=0;right<positions.length;right++){
    while(maxEnds.length>head&&positions[maxEnds.at(-1)!].end<=positions[right].end)maxEnds.pop();maxEnds.push(right);
    const hit=positions[right];counts.set(hit.group,(counts.get(hit.group)??0)+1);
    while(counts.size===groups.length){
      best=Math.min(best,positions[maxEnds[head]].end-positions[left].at);
      const first=positions[left++],remaining=counts.get(first.group)!-1;
      if(remaining)counts.set(first.group,remaining);else counts.delete(first.group);
      if(maxEnds[head]<left)head++;
    }
  }
  return best;
}
export function searchBook(books: BookSection[], phrase: string) {
  const query = phrase.trim().toLowerCase();
  if (!query || query.length > 100) throw new Error("bad_search");
  const terms = [...new Set(query.split(/\s+/))];
  if (terms.length > 6) throw new Error("bad_search");
  const groups = terms.map(term => ALIASES.find(group => group.includes(term)) ?? [term]);
  const candidates = books.flatMap(book => entriesIn(book).flatMap(entry => {
    const body = entry.text.toLowerCase(), title = entry.title.toLowerCase();
    if (!groups.every(group => group.some(term => body.includes(term)))) return [];
    const titleScore = (title.includes(query) ? 100 : 0) + (body.includes(query) ? 20 : 0) + groups.reduce((sum, group, index) => sum + (title.includes(terms[index]) ? 10 : group.some(term => title.includes(term)) ? 6 : 1), 0);
    const proximity=groups.length>1?Math.max(0,1000-coveringSpan(body,groups)):0;
    const score=titleScore*1000+proximity;
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
