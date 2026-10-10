import { z } from "zod";
import type { TallyBlock } from "../../core/registration.js";
import type { TallyCreatedForm, TallyFailure, TallyFetchedForm, TallyFormProvider, TallyResult } from "../../core/ports/tally.js";

const TALLY_BASE_URL = "https://api.tally.so";
const DEFAULT_TIMEOUT_MS = 15000;

const createdFormSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.string(),
  workspaceId: z.string().optional(),
  organizationId: z.string().optional(),
  isClosed: z.boolean().optional(),
  numberOfSubmissions: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}).passthrough();

const fetchedFormSchema = createdFormSchema.extend({ blocks: z.array(z.unknown()).optional() });

const blockSchema = z.object({
  uuid: z.string().min(1),
  type: z.enum(["FORM_TITLE", "TITLE", "INPUT_TEXT", "INPUT_EMAIL", "INPUT_PHONE_NUMBER", "TEXTAREA", "DROPDOWN_OPTION", "MULTIPLE_CHOICE_OPTION"]),
  groupUuid: z.string().min(1),
  groupType: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export interface TallyClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Tally REST adapter. Holds the API key in memory only, sends it solely as
 * an Authorization header, and never includes it in failures, logs, or
 * returned values.
 */
export class TallyClient implements TallyFormProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TallyClientOptions) {
    if (options.apiKey.trim() === "") throw new Error("Tally API key is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? TALLY_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async createForm(blocks: TallyBlock[], submissionsLimit?: number): Promise<TallyResult<TallyCreatedForm>> {
    const parsed = z.array(blockSchema).safeParse(blocks);
    if (!parsed.success || parsed.data.length === 0 || parsed.data[0]?.type !== "FORM_TITLE") {
      return { ok: false, failure: { kind: "bad_request" } };
    }
    return this.request<TallyCreatedForm>("/forms", {
      method: "POST",
      body: {
        status: "PUBLISHED",
        blocks: parsed.data,
        ...(submissionsLimit === undefined ? {} : { settings: { submissionsLimit } })
      },
      schema: createdFormSchema
    });
  }

  async getForm(formId: string): Promise<TallyResult<TallyFetchedForm>> {
    if (formId.trim() === "") return { ok: false, failure: { kind: "bad_request" } };
    return this.request<TallyFetchedForm>(`/forms/${encodeURIComponent(formId)}`, {
      method: "GET",
      schema: fetchedFormSchema
    });
  }

  private async request<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; schema: z.ZodType<T> }): Promise<TallyResult<T>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          // The key travels only in this header; nothing below echoes it.
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      return { ok: false, failure: error instanceof DOMException && error.name === "TimeoutError" ? { kind: "timeout" } : { kind: "network" } };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, failure: { kind: "auth", status: response.status } };
    if (response.status === 404) return { ok: false, failure: { kind: "not_found", status: 404 } };
    if (response.status === 429) return { ok: false, failure: { kind: "rate_limited", status: 429, ...(parseRetryAfterMs(response.headers.get("retry-after")) ?? {}) } };
    if (response.status === 400 || response.status === 422) return { ok: false, failure: { kind: "bad_request", status: response.status } };
    if (response.status < 200 || response.status >= 300) return { ok: false, failure: { kind: "server", status: response.status } };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, failure: { kind: "malformed", status: response.status } };
    }
    const parsed = init.schema.safeParse(payload);
    if (!parsed.success) return { ok: false, failure: { kind: "malformed", status: response.status } };
    return { ok: true, form: parsed.data };
  }
}

/** Builds a client from server-side configuration; undefined when not configured. */
export function createTallyClientFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): TallyClient | undefined {
  const apiKey = env.TALLY_API_KEY?.trim();
  if (!apiKey) return undefined;
  return new TallyClient({ apiKey, fetchImpl });
}

function parseRetryAfterMs(header: string | null): { retryAfterMs: number } | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return { retryAfterMs: Math.round(seconds * 1000) };
}
