/**
 * Registry of forms holding edits that exist only in memory. Changing language
 * reloads the document (messages are server-rendered), so every control that can
 * trigger a reload checks here first and confirms before discarding work.
 */
const pending = new Set<string>();

export function markUnsaved(id: string): () => void {
  pending.add(id);
  return () => pending.delete(id);
}

/** `except` lets a form ignore its own pending edits when it is the one saving. */
export function hasUnsaved(except?: string): boolean {
  if (except) return [...pending].some((id) => id !== except);
  return pending.size > 0;
}
