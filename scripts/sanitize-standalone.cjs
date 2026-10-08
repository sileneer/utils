/* eslint-disable @typescript-eslint/no-require-imports */
// Next explicitly copies local .env files even when tracing excludes them.
// Remove only env artifacts inside the build output; never read their contents.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve('.next/standalone');
let removed = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.resolve(directory, entry.name);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid artifact path');
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) visit(filename);
    else if (entry.name === '.env' || entry.name.startsWith('.env.')) { fs.unlinkSync(filename); removed++; }
  }
}
if (!fs.existsSync(root)) throw new Error('Standalone build missing');
visit(root);
if (fs.existsSync(path.join(root, 'data'))) throw new Error('Private data traced into standalone output');
console.log(`Standalone checked; removed ${removed} environment artifact(s).`);
