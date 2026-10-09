/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { randomUUID } = require("node:crypto");
const { entriesIn, entryPreview, loadBookSections } = require("../src/lib/book/entries.ts");
const { searchBook, formatSearch } = require("../src/lib/book/search.ts");
const { parsePreview } = require("../src/lib/chat/source-preview.ts");
const section = (number, text) => ({ section: number, name: String(number).padStart(2,"0")+"-test.md", text });
test("entry previews use numbered boundaries, omit comments and cap source text", () => {
  const book = section(8, "# Section\n### 18. Sleep\n<!-- hidden -->\n" + "body ".repeat(200) + "\n### 45. Second\nDifferent text\n## License\nNot entry content");
  const entries = entriesIn(book);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].anchor, "e-8-18");
  assert.equal(entryPreview(book,18).excerpt.length,700);
  assert.equal(entryPreview(book,18).truncated,true);
  assert.doesNotMatch(entryPreview(book,18).excerpt,/hidden|Different/);
  assert.equal(entryPreview(book,45).excerpt,"Different text");
  assert.equal(entryPreview(book,19),null);
  assert.throws(() => entriesIn(section(1,"### 1. A\n### 1. B")),/invalid_entries/);
});
test("search ranks later titles, covers sections and returns reproducible bounded literal matches", () => {
  const books = [section(1,Array.from({length:8},(_,i)=>"### "+(i+1)+". Item\nBody with sleep").join("\n")),
    section(32,"### 7. Sleep\nLate title"), section(8,"### 18. Sleep\nEarlier title")];
  const hits = searchBook(books,"sleep");
  assert.equal(hits[0].anchor,"e-8-18");
  assert.equal(hits[1].anchor,"e-32-7");
  assert.equal(hits.length,6);
  assert.equal(new Set(hits.map(v=>v.anchor)).size,6);
  assert.deepEqual(searchBook(books,"sleep").map(v=>v.anchor),hits.map(v=>v.anchor));
  assert.ok(formatSearch(books,"sleep").length<=4000);
  const combined = [section(2,"### 1. Insurance\nmedical abroad\n### 2. Medical\nNo cover"),
    section(32,"### 7. OSHC\nmedical insurance")];
  assert.deepEqual(searchBook(combined,"medical insurance").map(v=>v.anchor),["e-32-7","e-2-1"]);
  assert.equal(searchBook(combined,"[.*").length,0);
  for (const query of ["", "  ", "a".repeat(101), "a b c d e f g"]) assert.throws(()=>searchBook(books,query),/bad_search/);
});
test("explicit aliases resolve real alternate terms and late offsets let read_section reach the match", () => {
  const book = section(8,"### 18. 失眠\n症状\n### 45. 腹泻\n"+"x".repeat(8000)+"marker 镇痛药");
  assert.equal(searchBook([book],"睡不着")[0].anchor,"e-8-18");
  assert.equal(searchBook([book],"拉肚子 止痛药")[0].anchor,"e-8-45");
  const hit = searchBook([book],"marker")[0];
  assert.ok(hit.offset>7000);
  assert.match(book.text.slice(hit.offset,hit.offset+3000),/marker/);
  assert.doesNotMatch(hit.excerpt,/症状/);
});
test("preview parser rejects another version/location and oversized responses", () => {
  const rev="a".repeat(40), citation={section:8,item:18,anchor:"e-8-18"};
  const value={...citation,revision:rev,title:"Title",excerpt:"text",truncated:false,private:"ignore"};
  assert.equal("private" in parsePreview(value,rev,citation),false);
  for(const patch of [{revision:"b".repeat(40)},{anchor:"e-8-45"},{section:7},{title:""},{title:"a".repeat(501)},{excerpt:"a".repeat(701)},{truncated:"false"}])
    assert.throws(()=>parsePreview({...value,...patch},rev,citation),/source_unavailable/);
});
test("section loader reads only numbered regular files, not sibling private files or directories", async () => {
  const root=path.join(process.cwd(),"data","source-test-"+randomUUID());
  try {
    await fs.mkdir(path.join(root,"book"),{recursive:true});
    await fs.writeFile(path.join(root,"book","08-test.md"),"### 18. Title\nbody");
    await fs.writeFile(path.join(root,"book","private.md"),"private");
    await fs.writeFile(path.join(root,"private.txt"),"private");
    assert.equal((await loadBookSections(root,8)).length,1);
    assert.equal((await loadBookSections(root,7)).length,0);
    await fs.mkdir(path.join(root,"book","09-directory.md"));
    await assert.rejects(loadBookSections(root),/invalid_path/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
