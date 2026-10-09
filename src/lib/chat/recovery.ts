/** Read-only bounded reconciliation. Never resubmit a model request. */
export async function confirmTerminal(
  read: () => Promise<boolean>,
  alive: () => boolean,
  wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
): Promise<boolean> {
  const started = now();
  for (
    let attempt = 0;
    attempt < 15 && alive() && now() - started < 30_000;
    attempt++
  ) {
    try {
      if (await read()) return alive();
    } catch {
      /* Retain unknown state and offer manual refresh. */
    }
    if (!alive()) return false;
    if (attempt < 14) await wait(2000);
  }
  return false;
}
export function draftKey(owner: string, session: string | null) {
  return "htlb_chat_draft:" + owner + ":" + (session ?? "new");
}
