export type ActiveTurn = {
  sessionId: string;
  turnId: string;
  startedAt: number;
  state: "running" | "stopping";
};
export type Availability = {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
  service: "ready" | "busy" | "quota" | "disabled";
};
export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: number;
  archived: boolean;
};
export type ConversationPage = {
  items: ConversationSummary[];
  cursor?: string;
};
