/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const fs = require("node:fs/promises"), path = require("node:path");
const {loadBookSections,entriesIn}=require("../src/lib/book/entries.ts");
const {searchBook}=require("../src/lib/book/search.ts");
const cases=require("./fixtures/retrieval-cases.json");
const revision="a994b6a0c90598b0fe15cb837343f438dbf7b95d";
/** Frozen pre-C search: first 3 literal occurrences per sorted section, first 6 total. */
function baseline(books,phrase) {
 const found=[];
 for(const book of books) {
  const needle=phrase.toLowerCase(),haystack=book.text.toLowerCase();let from=0;
  for(let i=0;i<3;i++) {
   const at=haystack.indexOf(needle,from);if(at<0)break;
   const entry=entriesIn(book).find(e=>e.offset<=at&&e.end>at);
   if(entry)found.push(entry.anchor);else found.push("section-introduction");
   from=at+needle.length;if(found.length>=6)break;
  }
  if(found.length>=6)break;
 }
 return found;
}
async function main() {
 const directory=process.argv[2];if(!directory)throw Error("Provide an already-prepared version directory; no network fetch is performed.");
 const manifest=JSON.parse(await fs.readFile(path.join(directory,"manifest.json"),"utf8"));
 if(manifest.revision!==revision)throw Error("Benchmark requires the fixed source revision "+revision);
 const html=await fs.readFile(path.join(directory,"book.html"),"utf8");
 const declared=html.match(/正文提交\s+([a-f0-9]{7,40})/i)?.[1];
 if(!declared||!revision.startsWith(declared))throw Error("Source pair revision mismatch");
 const books=await loadBookSections(path.join(directory,"reader"));
 const passes=(actual,expected)=>expected.length?expected.every(a=>actual.includes(a)):actual.length===0;
 const rows=cases.map(c=>{const old=baseline(books,c.phrase),next=searchBook(books,c.phrase).map(e=>e.anchor);return {...c,baseline:old,improved:next,baselinePass:passes(old,c.expected),improvedPass:passes(next,c.expected)};});
 console.log(JSON.stringify({revision,cases:rows.length,entries:books.flatMap(entriesIn).length,baselinePass:rows.filter(r=>r.baselinePass).length,improvedPass:rows.filter(r=>r.improvedPass).length,rows,scope:"Offline retrieval coverage only, not model faithfulness, medical/legal correctness or latency."},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
