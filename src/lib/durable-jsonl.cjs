/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

/** Only a missing initial file or an unfinished final JSON fragment is recoverable. */
function readLedger(file, valid) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { records: [], raw: "" }; throw error; }
  const records = [], lines = raw.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch {
      if (index === lines.length - 1 && !raw.endsWith("\n"))
        return { records, raw: raw.slice(0, raw.lastIndexOf("\n") + 1), torn: true };
      throw new Error("invalid_ledger_record");
    }
    if (!valid(record)) throw new Error("invalid_ledger_record");
    records.push(record);
  }
  return { records, raw };
}

/** Repair only the uncommitted crash fragment before the next fsynced append. */
function appendLedger(file, record, valid) {
  if (!valid(record)) throw new Error("invalid_ledger_record");
  const ledger = readLedger(file, valid);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // Windows append handles cannot truncate. Startup/request ledger writes are
  // synchronous in the supported single process, so repair before opening for append.
  if (ledger.torn) fs.truncateSync(file, Buffer.byteLength(ledger.raw));
  const handle = fs.openSync(file, "a", 0o600);
  try {
    fs.writeFileSync(handle, (ledger.raw && !ledger.raw.endsWith("\n") ? "\n" : "") + JSON.stringify(record) + "\n");
    fs.fsyncSync(handle);
  } finally { fs.closeSync(handle); }
}

module.exports = { readLedger, appendLedger };
