/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises"), path = require("node:path"), { randomUUID } = require("node:crypto"), DB = require("better-sqlite3");
const { getDatabase, databasePath } = require("../src/lib/database.cjs");
async function performBackup(directory = path.join(path.dirname(databasePath()), "backups"), database) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const statusPath = path.join(directory, "status.json");
    let previous;
    try {
        const stat = await fs.lstat(statusPath);
        if (stat.isFile() && stat.size <= 4096)
            previous = JSON.parse(await fs.readFile(statusPath, "utf8"));
    }
    catch { }
    const state = { version: 1, state: "running", lastAttemptAt: Date.now(), ...(previous?.version === 1 && previous.lastSuccess ? { lastSuccess: previous.lastSuccess } : {}) };
    async function save() { const temp = path.join(directory, ".status-" + randomUUID() + ".tmp"); try {
        await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
        await fs.rename(temp, statusPath);
    }
    finally {
        await fs.rm(temp, { force: true });
    } }
    await save();
    try {
        const file = "utils-" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z") + "-" + randomUUID().slice(0, 8) + ".sqlite";
        const target = path.join(directory, file);
        await (database ?? getDatabase()).backup(target);
        if (process.platform !== "win32")
            await fs.chmod(target, 0o600);
        const restored = new DB(target, { readonly: true });
        try {
            if (restored.pragma("integrity_check", { simple: true }) !== "ok" || restored.pragma("foreign_key_check").length)
                throw Error("backup_invalid");
        }
        finally {
            restored.close();
        }
        state.state = "complete";
        state.lastSuccess = { at: Date.now(), file, bytes: (await fs.stat(target)).size, integrity: "ok" };
        await save();
        return { file, at: state.lastSuccess.at };
    }
    catch (error) {
        state.state = "failed";
        await save();
        throw error;
    }
}
module.exports = { performBackup };
if (require.main === module)
    performBackup().then(() => { getDatabase().close(); console.log("Verified consistent backup completed."); }).catch(() => { console.error("Backup failed; inspect private status and service configuration."); process.exitCode = 1; });
