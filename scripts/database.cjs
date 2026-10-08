/* eslint-disable @typescript-eslint/no-require-imports */
const { getDatabase, open, databasePath } = require("../src/lib/database.cjs");
const fs = require("node:fs");
const path = require("node:path");
async function migrate(db = open()) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const directory = path.join(__dirname, "../migrations");
  for (const file of fs
    .readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(file))
      continue;
    // A coherent backup includes outstanding WAL pages. Never rewind on app rollback.
    if (db.prepare("SELECT count(*) n FROM schema_migrations").get().n) {
      const backup = databasePath() + ".before-" + file + ".bak";
      await db.backup(backup);
      if (process.platform !== "win32") fs.chmodSync(backup, 0o600);
    }
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(directory, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
        file,
        Date.now(),
      );
    }).immediate();
  }
  return db;
}
async function main() {
  const command = process.argv[2];
  if (command === "migrate") {
    const db = await migrate();
    db.close();
    console.log("Database migrations applied.");
  } else if (command === "backup") {
    const target = process.argv[3];
    if (!target || path.resolve(target) === path.resolve(databasePath()))
      throw new Error("Separate backup path required");
    fs.mkdirSync(path.dirname(path.resolve(target)), {
      recursive: true,
      mode: 0o700,
    });
    await getDatabase().backup(target);
    if (process.platform !== "win32") fs.chmodSync(target, 0o600);
    console.log("Consistent backup created.");
    getDatabase().close();
  } else if (command === "admin") {
    const email = (process.argv[3] || "").trim().toLowerCase();
    const result = getDatabase()
      .prepare(
        "UPDATE user SET role=? WHERE email=? AND emailVerified=1 AND status=?",
      )
      .run("admin", email, "active");
    if (result.changes !== 1)
      throw new Error("Verified active account required");
    console.log("Verified owner account promoted.");
    getDatabase().close();
  } else
    throw new Error(
      "Usage: database.cjs migrate | backup <path> | admin <email>",
    );
}
module.exports = { getDatabase, open, migrate, databasePath };
if (require.main === module)
  main().catch(() => {
    console.error(
      "Database operation failed. Check configuration and file permissions.",
    );
    process.exitCode = 1;
  });
