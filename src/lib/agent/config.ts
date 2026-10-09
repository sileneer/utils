import "server-only";
import { isAgentModelId, type AgentModelConfig } from "./models";

type AIConfiguration = {
  apiKey: string;
  baseUrl: string;
  modelConfig: AgentModelConfig;
  slots: Record<string, string>;
};
/** Runtime-only configuration. No provider, token or model fallback is baked in. */
export function aiConfiguration(): AIConfiguration | undefined {
  const apiKey = process.env.AI_API_KEY?.trim()
    || process.env.ANTHROPIC_AUTH_TOKEN?.trim()
    || process.env.SENSENOVA_API_KEY?.trim();
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, "");
  const defaultModel = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey || !baseUrl || !isAgentModelId(defaultModel)) return;
  try {
    const url = new URL(baseUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || /\/v1$/i.test(url.pathname)) return;
    const raw = process.env.AI_MODELS?.trim();
    if (raw && raw.length > 8192) return;
    const models = raw ? JSON.parse(raw) : [{ id: defaultModel, name: defaultModel }];
    if (!Array.isArray(models) || !models.length || models.length > 20) return;
    const ids = new Set<string>();
    const catalog = [];
    for (const model of models) {
      if (!model || !isAgentModelId(model.id) || typeof model.name !== "string" || !model.name.trim() || model.name.length > 80 || /[\u0000-\u001f\u007f]/.test(model.name) || ids.has(model.id)) return;
      ids.add(model.id);
      catalog.push({ id: model.id, name: model.name.trim() });
    }
    if (!ids.has(defaultModel)) return;
    const slots: Record<string, string> = {};
    for (const key of ["ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"]) {
      const value = process.env[key]?.trim();
      if (value && !isAgentModelId(value)) return;
      if (value) slots[key] = value;
    }
    return { apiKey, baseUrl, modelConfig: { defaultModel, models: catalog }, slots };
  } catch {
    return;
  }
}
/** Only this projection may enter browser/session JSON; no secrets or endpoint. */
export function publicModelConfig(): AgentModelConfig {
  return aiConfiguration()?.modelConfig ?? { defaultModel: "", models: [] };
}
