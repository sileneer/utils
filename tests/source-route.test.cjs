/* eslint-disable @typescript-eslint/no-require-imports */
require("./register.cjs");
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs/promises"), path=require("node:path"), {randomUUID}=require("node:crypto");
const Module=require("node:module"), original=Module._load;
const root=path.join(process.cwd(),"data","source-route-"+randomUUID());
const revisions=["a".repeat(40),"b".repeat(40)], calls=[];
Module._load=function(name,...args) {
  if(name==="@/lib/book/source") return {getBook:async revision=>{
    calls.push(revision);
    if(!revisions.includes(revision)) throw Error("not cached");
    return {revision, workspace:path.join(root,revision)};
  }};
  return original.call(this,name,...args);
};
const {GET}=require("../src/app/api/book/entry/route.ts");
const request=async(revision,section="8",item="18")=>GET(new Request("http://localhost/api/book/entry?"+new URLSearchParams({revision,section,item})));
test.before(async()=>{for(const revision of revisions) {
  await fs.mkdir(path.join(root,revision,"book"),{recursive:true});
  await fs.writeFile(path.join(root,revision,"book","08-test.md"),"### 18. "+(revision===revisions[0]?"Original":"Updated")+"\nPinned "+revision[0]+" text");
}});
test("source route serves exact old/new revision without current-source substitution", async()=>{
  for(const revision of revisions) {
    const response=await request(revision);
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    const body=await response.json();
    assert.equal(body.revision,revision);
    assert.equal(body.excerpt,"Pinned "+revision[0]+" text");
    assert.equal(body.anchor,"e-8-18");
    assert.equal("workspace" in body,false);
  }
  assert.deepEqual(calls.slice(-2),revisions);
});
test("bad locators fail before source access; missing item/version explicitly fail", async()=>{
  const count=calls.length;
  for(const args of [["latest"],["../private"],[revisions[0],"35"],[revisions[0],"0"],[revisions[0],"8","0"],[revisions[0],"8","1000"],[revisions[0],"../8"]])
    assert.equal((await request(...args)).status,400);
  assert.equal(calls.length,count);
  assert.equal((await request(revisions[0],"8","99")).status,404);
  assert.equal((await request("c".repeat(40))).status,502);
  assert.equal(calls.at(-1),"c".repeat(40));
});
test.after(async()=>{Module._load=original; await fs.rm(root,{recursive:true,force:true});});
