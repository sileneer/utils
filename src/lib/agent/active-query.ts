type ActiveQuery = {
  owner: string;
  sessionId?: string;
  startedAt?: number;
  turn: string;
  abort: AbortController;
  authorizationVersion?: number;
};
type QueryState = {
  active?: ActiveQuery;
  pendingStops: Map<string, number>;
  blocked: Set<string>;
  version: number;
  accountVersions: Map<string, number>;
  released: Set<() => void>;
};
// Route bundles must share the same single-process query slot and cancellation.
const shared = globalThis as typeof globalThis & {
  utilsAgentQueryState?: QueryState;
};
const state: QueryState = (shared.utilsAgentQueryState ??= {
  pendingStops: new Map<string, number>(),
  blocked: new Set<string>(), version: 0, accountVersions: new Map<string, number>(), released: new Set<() => void>(),
});
// Preserve existing development query state when a route is hot-reloaded.
state.blocked ??= new Set<string>();
state.version ??= 0;
state.accountVersions ??= new Map<string, number>();
state.released ??= new Set<() => void>();
const key = (owner: string, turn: string) => `${owner}:${turn}`;
export function reserveQuery(query: ActiveQuery) {
  if (state.active || state.blocked.has(query.owner) ||
    (query.authorizationVersion !== undefined && query.authorizationVersion < (state.accountVersions.get(query.owner) ?? 0))) return false;
  state.active = query;
  const expires = state.pendingStops.get(key(query.owner, query.turn));
  if (expires && expires > Date.now()) query.abort.abort();
  state.pendingStops.delete(key(query.owner, query.turn));
  return true;
}
export function releaseQuery(query: ActiveQuery) {
  if (state.active !== query) return;
  state.active = undefined;
  for (const done of state.released) done();
  state.released.clear();
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

export function activeTurn(owner: string, sessionId?: string) {
  const query = state.active;
  if (
    !query ||
    query.owner !== owner ||
    !query.sessionId ||
    (sessionId && query.sessionId !== sessionId)
  )
    return;
  return {
    sessionId: query.sessionId,
    turnId: query.turn,
    startedAt: query.startedAt ?? 0,
    state: query.abort.signal.aborted
      ? ("stopping" as const)
      : ("running" as const),
  };
}
export function isTurnActive(owner: string, turn: string, sessionId?: string) {
  return (
    state.active?.owner === owner &&
    state.active.turn === turn &&
    (!sessionId || state.active.sessionId === sessionId)
  );
}
export function serviceBusy() {
  return Boolean(state.active);
}

// A request that authenticated before revocation cannot register after the fence.
export function accountChangeVersion() { return state.version; }
export function blockOwnerQueries(owner: string) {
  if (state.blocked.has(owner)) throw new Error("account_busy");
  state.blocked.add(owner);
  state.accountVersions.set(owner, ++state.version);
  return () => { state.blocked.delete(owner); state.accountVersions.set(owner, ++state.version); };
}
export async function stopOwnerQuery(owner: string, timeoutMs = 30_000): Promise<boolean> {
  const query = state.active;
  if (!query || query.owner !== owner) return true;
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); state.released.delete(done); resolve(true); };
    const timer = setTimeout(() => { state.released.delete(done); resolve(false); }, timeoutMs);
    state.released.add(done);
    query.abort.abort();
  });
}
