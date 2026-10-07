/**
 * Chat models offered by the model picker. Source of truth mirrors the
 * SenseNova model list (https://platform.sensenova.cn/docs) minus the
 * image-generation models (U1.5 series). The allowlist is enforced
 * server-side; display names are product proper nouns (no i18n needed).
 */
export const AGENT_MODELS = [
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    hint: { en: "balanced default", zh: "均衡默认" },
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    hint: { en: "fast & economical", zh: "快而省" },
  },
  {
    id: "sensenova-6.8-flash-lite",
    name: "SenseNova 6.8 Flash Lite",
    hint: { en: "agentic multimodal", zh: "智能体多模态" },
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    hint: { en: "1M context, long coding", zh: "1M 上下文" },
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    hint: { en: "1M context, strong reasoning", zh: "1M 上下文强推理" },
  },
] as const;

export const DEFAULT_AGENT_MODEL: string = AGENT_MODELS[0].id;

export function isAllowedAgentModel(id: unknown): id is string {
  return typeof id === "string" && AGENT_MODELS.some((m) => m.id === id);
}

export function agentModelName(id: string): string {
  return AGENT_MODELS.find((m) => m.id === id)?.name ?? id;
}
