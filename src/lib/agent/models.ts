export type AgentModel = { id: string; name: string };
export type AgentModelConfig = { defaultModel: string; models: AgentModel[] };

/** Historical metadata may describe a model removed from today's send allowlist. */
export function isAgentModelId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(id);
}
export function isAllowedAgentModel(id: unknown, models: readonly AgentModel[]): id is string {
  return typeof id === "string" && models.some((model) => model.id === id);
}
export function selectAgentModel(preference: unknown, config: AgentModelConfig): string {
  return isAllowedAgentModel(preference, config.models) ? preference : config.defaultModel;
}
export function agentModelName(id: string, models: readonly AgentModel[]): string {
  return models.find((model) => model.id === id)?.name ?? id;
}
