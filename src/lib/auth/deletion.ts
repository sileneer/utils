import { db } from "../db";
import {
  administratorCount,
  COMPLETION_WINDOW_MS,
  COOLING_OFF_MS,
  executeDeletion,
  isAdministrator,
  readDeletion,
  requestDeletion,
  stampExport,
  withdrawDeletion,
} from "./deletion.cjs";

/**
 * The typed surface the request handlers and the account centre use. The removal order
 * itself lives in `deletion.cjs`, because the reconciliation that runs from `migrate()`
 * has to reach it before this runtime exists — ARCHITECTURE §5 "Account deletion".
 */
export type DeletionView =
  | { status: "none" }
  | {
    status: "pending";
    requestedAt: number;
    eligibleAt: number;
    expiresAt: number;
    exportedAt: number | null;
    eligible: boolean;
  };

/** Each one is a different fact, so each one needs its own sentence in the UI. */
export const DELETION_ERRORS: Record<string, number> = {
  already_requested: 409,
  not_requested: 409,
  cooling_off: 409,
  export_required: 409,
  last_admin: 409,
  confirm_mismatch: 400,
  not_found: 404,
};

export const DELETION_WINDOWS = { coolingOffMs: COOLING_OFF_MS, completionWindowMs: COMPLETION_WINDOW_MS };

/** Re-read on every visit so eligibility and lapse are always computed against now. */
export function deletionView(userId: string): DeletionView {
  const state = readDeletion(db(), userId);
  if (state.status !== "pending") return { status: "none" };
  return {
    status: "pending",
    requestedAt: state.requestedAt,
    eligibleAt: state.eligibleAt,
    expiresAt: state.expiresAt,
    exportedAt: state.exportedAt ?? null,
    eligible: Boolean(state.eligible),
  };
}

/**
 * Only a whole-account export counts. A narrowed one is a subset of the data, and the
 * default precondition offers a complete copy first. Proceeding without that copy
 * requires the separate, explicit acknowledgement on the final deletion request.
 */
export function markExportDelivered(userId: string, scope: { conversation?: string; from?: number; to?: number }) {
  if (scope.conversation !== undefined || scope.from !== undefined || scope.to !== undefined) return;
  stampExport(db(), userId);
}

/** True when deleting this account would leave `/admin` unreachable. */
export function lastAdministratorStanding(userId: string) {
  return isAdministrator(db(), userId) && administratorCount(db()) <= 1;
}

export type DeletionOutcome =
  | { deleted: true; transcripts: string[]; outstanding: string[] }
  | { deleted: false; error: "last_admin" }
  | { deleted: false; alreadyGone: true };

/**
 * The engine speaks CommonJS, so its result is narrowed here rather than at every call
 * site. `outstanding` is the list of transcript files the next start will finish removing;
 * an empty one means the deletion is complete in every place this site can reach.
 */
export function deleteAccount(userId: string): DeletionOutcome {
  const result = executeDeletion(db(), userId) as {
    deleted?: unknown; error?: unknown; transcripts?: unknown; outstanding?: unknown;
  };
  if (result.error === "last_admin") return { deleted: false, error: "last_admin" };
  if (result.deleted !== true) return { deleted: false, alreadyGone: true };
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  return { deleted: true, transcripts: list(result.transcripts), outstanding: list(result.outstanding) };
}

export { requestDeletion, withdrawDeletion };
