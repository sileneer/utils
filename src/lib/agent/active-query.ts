type ActiveQuery = {
  owner: string;
  turn: string;
  abort: AbortController;
};
type QueryState = {
  active?: ActiveQuery;
  pendingStops: Map<string, number>;
};
// Route bundles must share the same single-process query slot and cancellation.
const shared = globalThis as typeof globalThis & {
  utilsAgentQueryState?: QueryState;
};
const state: QueryState = (shared.utilsAgentQueryState ??= {
  pendingStops: new Map<string, number>(),
});
const key = (owner: string, turn: string) => `${owner}:${turn}`;
export function reserveQuery(query: ActiveQuery) {
  if (state.active) return false;
  state.active = query;
  const expires = state.pendingStops.get(key(query.owner, query.turn));
  if (expires && expires > Date.now()) query.abort.abort();
  state.pendingStops.delete(key(query.owner, query.turn));
  return true;
}
export function releaseQuery(query: ActiveQuery) {
  if (state.active === query) state.active = undefined;
}
export function stopQuery(owner: string, turn: string) {
  if (state.active?.owner === owner && state.active.turn === turn) {
    state.active.abort.abort();
    return true;
  }
  // A fast Stop request can reach its handler before the chat request registers.
  const now = Date.now();
  for (const [id, expires] of state.pendingStops) {
    if (expires <= now) state.pendingStops.delete(id);
  }
  if (state.pendingStops.size >= 256)
    state.pendingStops.delete(state.pendingStops.keys().next().value!);
  state.pendingStops.set(key(owner, turn), now + 30_000);
  return false;
}
