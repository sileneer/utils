import { isAgentModelId } from "../agent/models";
export type TokenUsage = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};
export type MessageDetails = {
  model?: string;
  startedAt?: number;
  durationMs?: number;
  firstTextMs?: number;
  searchCalls?: number;
  readCalls?: number;
  tokens?: TokenUsage;
  timingEstimated?: boolean;
};
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function tokenUsage(value: unknown): TokenUsage | undefined {
  const usage = object(value);
  if (!usage || !count(usage.input_tokens) || !count(usage.output_tokens))
    return;
  const tokens: TokenUsage = {
    input: usage.input_tokens,
    output: usage.output_tokens,
  };
  for (const [source, target] of [
    ["cache_read_input_tokens", "cacheRead"],
    ["cache_creation_input_tokens", "cacheWrite"],
  ] as const) {
    if (usage[source] !== undefined && usage[source] !== null) {
      if (!count(usage[source])) return;
      tokens[target] = usage[source];
    }
  }
  return totalTokens(tokens) === undefined ? undefined : tokens;
}
export function totalTokens(tokens: TokenUsage): number | undefined {
  const sum =
    tokens.input +
    tokens.output +
    (tokens.cacheRead ?? 0) +
    (tokens.cacheWrite ?? 0);
  return count(sum) ? sum : undefined;
}
/** Public allowlist: never forward an SDK object or arbitrary stored JSON. */
export function parseMessageDetails(
  value: unknown,
): MessageDetails | undefined {
  const record = object(value);
  if (!record) return;
  const details: MessageDetails = {};
  if (record.model !== undefined) {
    if (!isAgentModelId(record.model)) return;
    details.model = record.model;
  }
  for (const key of [
    "startedAt",
    "durationMs",
    "firstTextMs",
    "searchCalls",
    "readCalls",
  ] as const) {
    if (record[key] !== undefined) {
      if (!count(record[key])) return;
      details[key] = record[key];
    }
  }
  if (record.timingEstimated !== undefined) {
    if (typeof record.timingEstimated !== "boolean") return;
    details.timingEstimated = record.timingEstimated;
  }
  if (record.tokens !== undefined) {
    const tokens = object(record.tokens);
    if (!tokens) return;
    details.tokens = tokenUsage({
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cache_read_input_tokens: tokens.cacheRead,
      cache_creation_input_tokens: tokens.cacheWrite,
    });
    if (!details.tokens) return;
  }
  return Object.keys(details).length ? details : undefined;
}
export function recordedDetails(
  json: string | null,
): MessageDetails | undefined {
  if (!json) return;
  try {
    const record = object(JSON.parse(json));
    if (!record) return;
    const details = parseMessageDetails(record.details);
    if (details) return details;
    const tokens = tokenUsage(record.usage);
    return tokens ? { tokens } : undefined;
  } catch {
    return;
  }
}
