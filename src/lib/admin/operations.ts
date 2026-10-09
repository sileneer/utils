import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { databasePath } from "../database.cjs";
import { db } from "../db";
import { recordedDetails, totalTokens } from "../chat/details";
import { serviceBusy } from "../agent/active-query";
export type BackupStatus = {
    state: "fresh" | "stale" | "failed" | "running" | "unavailable";
    lastSuccessAt?: number;
    lastAttemptAt?: number;
    bytes?: number;
    integrityVerified?: boolean;
};
export type Samples = {
    count: number;
    missing: number;
    median: number | null;
    p95: number | null;
};
export type OperationsSnapshot = {
    checkedAt: number;
    hours: 24 | 168;
    attempts: number;
    truncated: boolean;
    outcomes: Record<"complete" | "failed" | "stopped" | "released" | "reserved" | "unknown", number>;
    tokens: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
        samples: number;
        missing: number;
        cacheReadSamples: number;
        cacheWriteSamples: number;
    };
    duration: Samples;
    firstText: Samples;
    service: {
        enabled: boolean;
        busy: boolean;
        userLimit: number;
        globalLimit: number;
    };
    backup: BackupStatus;
};
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export async function backupStatus(now = Date.now(), directory = path.join(path.dirname(databasePath()), "backups")): Promise<BackupStatus> {
    try {
        const file = path.join(directory, "status.json"), stat = await lstat(file);
        if (!stat.isFile() || stat.size > 4096)
            return { state: "unavailable" };
        const data = JSON.parse(await readFile(file, "utf8"));
        if (data?.version !== 1 || !["running", "complete", "failed"].includes(data.state) ||
            !integer(data.lastAttemptAt) || data.lastAttemptAt > now + 60000)
            return { state: "unavailable" };
        const success = data.lastSuccess;
        if (success && (!integer(success.at) || success.at > now + 60000 || !integer(success.bytes) || success.integrity !== "ok"))
            return { state: "unavailable" };
        const state: BackupStatus["state"] = data.state === "failed" ? "failed" :
            data.state === "running" ? now - data.lastAttemptAt > 30 * 60000 ? "failed" : "running" :
                !success || now - success.at > 36 * 60 * 60000 ? "stale" : "fresh";
        return { state, lastAttemptAt: data.lastAttemptAt, ...(success ? { lastSuccessAt: success.at, bytes: success.bytes, integrityVerified: true } : {}) };
    }
    catch {
        return { state: "unavailable" };
    }
}
function samples(values: number[], missing: number): Samples {
    values.sort((a, b) => a - b);
    return { count: values.length, missing, median: values.length ? values[Math.floor((values.length - 1) / 2)] + (values[Math.floor(values.length / 2)] - values[Math.floor((values.length - 1) / 2)]) / 2 : null,
        p95: values.length >= 20 ? values[Math.ceil(values.length * 0.95) - 1] : null };
}
export async function operationsSnapshot(hours: 24 | 168, now = Date.now()): Promise<OperationsSnapshot> {
    // Limit CPU/JSON work even on a self-deployment with higher configured quotas.
    const rows = db().prepare("SELECT status,usage_json FROM ai_usage WHERE created_at>=? AND created_at<=? ORDER BY created_at DESC,rowid DESC LIMIT 10001")
        .all(now - hours * 3600000, now) as {
        status: string;
        usage_json: string | null;
    }[];
    const truncated = rows.length > 10000;
    rows.length = Math.min(rows.length, 10000);
    const outcomes = { complete: 0, failed: 0, stopped: 0, released: 0, reserved: 0, unknown: 0 };
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, samples: 0, missing: 0, cacheReadSamples: 0, cacheWriteSamples: 0 };
    const durations: number[] = [], firsts: number[] = [];
    for (const row of rows) {
        const status = row.status as keyof typeof outcomes;
        outcomes[Object.hasOwn(outcomes, status) ? status : "unknown"]++;
        const detail = recordedDetails(row.usage_json);
        if (detail?.durationMs !== undefined && !detail.timingEstimated)
            durations.push(detail.durationMs);
        if (detail?.firstTextMs !== undefined && !detail.timingEstimated)
            firsts.push(detail.firstTextMs);
        if (detail?.tokens) {
            const t = detail.tokens;
            tokens.samples++;
            tokens.input += t.input;
            tokens.output += t.output;
            tokens.total += totalTokens(t)!;
            if (t.cacheRead !== undefined) {
                tokens.cacheRead += t.cacheRead;
                tokens.cacheReadSamples++;
            }
            if (t.cacheWrite !== undefined) {
                tokens.cacheWrite += t.cacheWrite;
                tokens.cacheWriteSamples++;
            }
        }
        else
            tokens.missing++;
    }
    // Reject overflowing aggregates rather than presenting imprecise totals.
    if (!Object.values(tokens).every(integer))
        throw Error("operations_unavailable");
    const userLimit = Number(process.env.AI_USER_DAILY_LIMIT ?? 0), globalLimit = Number(process.env.AI_GLOBAL_DAILY_LIMIT ?? 0);
    const enabled = process.env.AI_ENABLED === "1" && integer(userLimit) && userLimit > 0 && integer(globalLimit) && globalLimit > 0;
    return { checkedAt: now, hours, attempts: rows.length, truncated, outcomes, tokens,
        duration: samples(durations, rows.length - durations.length), firstText: samples(firsts, rows.length - firsts.length),
        service: { enabled, busy: serviceBusy(), userLimit: enabled ? userLimit : 0, globalLimit: enabled ? globalLimit : 0 },
        backup: await backupStatus(now) };
}
