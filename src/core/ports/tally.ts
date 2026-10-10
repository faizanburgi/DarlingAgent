import type { TallyBlock } from "../registration.js";

/**
 * Framework-independent boundary for the Tally integration. The core owns
 * this contract; only adapters perform HTTP or hold credentials.
 */

export interface TallyCreatedForm {
  id: string;
  name: string;
  status: string;
  workspaceId?: string;
  isClosed?: boolean;
}

export interface TallyFetchedForm extends TallyCreatedForm {
  blocks?: unknown;
}

export type TallyFailureKind =
  | "auth"
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network"
  | "server"
  | "malformed";

export interface TallyFailure {
  kind: TallyFailureKind;
  /** HTTP status when one was received. Never carries credentials. */
  status?: number;
  /** Milliseconds hinted by Retry-After on 429 responses. */
  retryAfterMs?: number;
}

export type TallyResult<T> = { ok: true; form: T } | { ok: false; failure: TallyFailure };

/** Minimal connectivity outcome. Carries no form data, headers, or credentials. */
export type TallyConnectionResult = { ok: true; connected: true } | { ok: false; failure: TallyFailure };

export interface TallyFormProvider {
  createForm(blocks: TallyBlock[], submissionsLimit?: number): Promise<TallyResult<TallyCreatedForm>>;
  getForm(formId: string): Promise<TallyResult<TallyFetchedForm>>;
  /** Authenticated read-only probe. Must never create, modify, or return form data. */
  verifyConnection(): Promise<TallyConnectionResult>;
}
