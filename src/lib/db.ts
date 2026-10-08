import { getDatabase } from "./database.cjs";
import type Database from "better-sqlite3";
export function db(): Database.Database {
  return getDatabase();
}
