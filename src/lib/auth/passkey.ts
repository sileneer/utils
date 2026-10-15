import { db } from "../db";
import { getAuthenticatorName } from "@better-auth/passkey";

/** A person with ten credentials already has more ways in than this site should let
 * them lose track of, and an unbounded list is a free way to grow the account's data. */
export const MAX_PASSKEYS = 10;
export const PASSKEY_NAME_MAX = 40;

export type PasskeyView = {
  id: string;
  /** The name the owner chose, or empty when they chose none. */
  name: string;
  /** Best-effort provider label from the AAGUID; empty when it is unknown or zeroed. */
  label: string;
  createdAt: number;
  /** True when the credential is synced to the account's other devices rather than
   * held on one — it changes what "I lost that phone" means. */
  synced: boolean;
};

type PasskeyRow = {
  id: string;
  name: string | null;
  aaguid: string | null;
  createdAt: string | null;
  deviceType: string;
  backedUp: number;
};

/**
 * The account's own credentials, projected. `publicKey`, `credentialID` and `aaguid`
 * stay in the database: they identify a credential to the server, and rendering them
 * would let the list be read as if it were a secret while helping no one recognise it.
 */
export function listPasskeys(userId: string): PasskeyView[] {
  const rows = db()
    .prepare("SELECT id, name, aaguid, createdAt, deviceType, backedUp FROM passkey WHERE userId=? ORDER BY createdAt")
    .all(userId) as PasskeyRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name?.trim() ?? "",
    label: getAuthenticatorName(row.aaguid ?? "") ?? "",
    createdAt: row.createdAt ? Date.parse(row.createdAt) : 0,
    synced: row.backedUp === 1 || row.deviceType === "multiDevice",
  }));
}

export function passkeyCount(userId: string): number {
  return (db().prepare("SELECT count(*) n FROM passkey WHERE userId=?").get(userId) as { n: number }).n;
}

/** A credential id is base64url and machine-generated; a name is what the person typed. */
export function normalizePasskeyName(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= PASSKEY_NAME_MAX ? name : null;
}

/**
 * The plugin's own failure names, translated once so the passkey surfaces answer in the
 * same vocabulary as the rest of the account wrapper and no raw library response —
 * including one carrying a credential id or public key — ever reaches a browser.
 */
export const PASSKEY_ERRORS: Record<string, { error: string; status: number }> = {
  CHALLENGE_NOT_FOUND: { error: "challenge_gone", status: 401 },
  AUTHENTICATION_FAILED: { error: "assertion_failed", status: 401 },
  PASSKEY_NOT_FOUND: { error: "not_found", status: 404 },
  PASSKEY_NOT_USER_VERIFIED: { error: "not_user_verified", status: 403 },
  FAILED_TO_VERIFY_REGISTRATION: { error: "registration_failed", status: 400 },
  SESSION_REQUIRED: { error: "unauthorized", status: 401 },
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: { error: "unauthorized", status: 401 },
  RESOLVE_USER_REQUIRED: { error: "bad_request", status: 400 },
  RESOLVED_USER_INVALID: { error: "bad_request", status: 400 },
  FAILED_TO_UPDATE_PASSKEY: { error: "service_unavailable", status: 503 },
};

export function translatePasskeyError(error: unknown): { error: string; status: number } {
  const source = error as { body?: { code?: unknown }; code?: unknown; status?: unknown };
  const name = String(source?.body?.code ?? source?.code ?? "");
  if (PASSKEY_ERRORS[name]) return PASSKEY_ERRORS[name];
  const status = Number(source?.status ?? 0);
  if (status >= 500) return { error: "service_unavailable", status: 503 };
  // A name this version does not use is still a refused ceremony, never a crash to hide.
  if (status > 0) return { error: "assertion_failed", status: 401 };
  throw error;
}

/** The `id` a browser returns is the same base64url credential id the server stores. */
export function credentialIdOf(response: unknown): string {
  const id = (response as { id?: unknown; rawId?: unknown })?.id;
  const rawId = (response as { rawId?: unknown })?.rawId;
  const value = typeof id === "string" && id ? id : typeof rawId === "string" ? rawId : "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : "";
}
