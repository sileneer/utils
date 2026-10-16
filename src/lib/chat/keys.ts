/**
 * The browser storage keys this site owns.
 *
 * They live in one module because a second definition is how leftovers survive the thing
 * that was supposed to remove them: account deletion has to clear exactly what chat writes,
 * and it must not clear what belongs to the browser or to another account.
 */
/** The conversation this browser last had open, per account. */
export const SESSION_KEY = "htlb_chat_session_id";
/** The model this browser picks for new turns, per account. */
export const MODEL_KEY = "htlb_chat_model";
/** Unsent text, per account and per conversation (or the not-yet-created one). */
export const DRAFT_PREFIX = "htlb_chat_draft";
/** The address the verify form should pre-fill after a registration. */
export const VERIFY_EMAIL_KEY = "utils_verify_email";

export const sessionKey = (owner: string) => `${SESSION_KEY}:${owner}`;
export const modelKey = (owner: string) => `${MODEL_KEY}:${owner}`;
export const draftPrefix = (owner: string) => `${DRAFT_PREFIX}:${owner}:`;
