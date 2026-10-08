import { createHmac } from "node:crypto";
import { db } from "../db";
export function privateKey(value: string) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(value)
    .digest("hex");
}
/** All buckets succeed together; no transaction crosses a network await. */
export function consumeLimits(
  buckets: { key: string; max: number; window: number }[],
) {
  const database = db(),
    now = Date.now();
  return database
    .transaction(() => {
      database.prepare("DELETE FROM limits WHERE expires_at<=?").run(now);
      for (const bucket of buckets) {
        const row = database
          .prepare("SELECT count FROM limits WHERE key=?")
          .get(bucket.key) as { count: number } | undefined;
        if ((row?.count ?? 0) >= bucket.max) return false;
      }
      for (const bucket of buckets)
        database
          .prepare(
            "INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
          )
          .run(bucket.key, now + bucket.window);
      return true;
    })
    .immediate();
}
