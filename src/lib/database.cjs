/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
let connection;
function databasePath() {
  return (
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "utils.sqlite")
  );
}
function open(filename = databasePath()) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  if (process.platform !== "win32") fs.chmodSync(filename, 0o600);
  return db;
}
function getDatabase() {
  if (!connection) connection = open();
  if (
    !connection
      .prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'")
      .get()
  )
    throw new Error("database_not_migrated");
  return connection;
}
module.exports = { getDatabase, open, databasePath };
