import { createHash, randomUUID } from "node:crypto";
import type { PersistedEvent } from "./domain.js";

/**
 * Framework-independent registration planning. This module builds reviewable
 * form specifications and the exact Tally block payloads derived from them.
 * It performs no network access and holds no credentials.
 */

export type RegistrationFieldKind =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "dropdown"
  | "multiple_choice";

export interface RegistrationFieldSpec {
  key: string;
  label: string;
  kind: RegistrationFieldKind;
  required: boolean;
  placeholder?: string;
  options?: string[];
  /** Why this field exists; sensitive fields must justify any required flag. */
  justification: string;
}

export interface RegistrationSpecOptions {
  includeStudentId?: boolean;
  includeDietary?: boolean;
  includeAccessibility?: boolean;
  includeConsent?: boolean;
  capacity?: number;
  deadline?: string;
}

export interface RegistrationSpec {
  eventId: string;
  title: string;
  description: string;
  capacity?: number;
  deadline?: string;
  fields: RegistrationFieldSpec[];
  /** Requirements still missing before a live form should be created. */
  missingRequirements: string[];
}

/** Block shapes follow the verified Tally create-form documentation. */
export interface TallyBlock {
  uuid: string;
  type:
    | "FORM_TITLE"
    | "TITLE"
    | "INPUT_TEXT"
    | "INPUT_EMAIL"
    | "INPUT_PHONE_NUMBER"
    | "TEXTAREA"
    | "DROPDOWN_OPTION"
    | "MULTIPLE_CHOICE_OPTION";
  groupUuid: string;
  groupType: string;
  payload: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set(["student_id", "dietary_requirements", "accessibility_needs", "consent"]);

/**
 * Builds a reviewable registration specification for a persisted event.
 * Sensitive fields are optional unless the caller justifies them; this
 * function never marks them required on its own.
 */
export function buildRegistrationSpec(event: PersistedEvent, options: RegistrationSpecOptions = {}): RegistrationSpec {
  const attendeeCount = event.workflow.request.attendeeCount;
  const capacity = options.capacity ?? attendeeCount;
  const fields: RegistrationFieldSpec[] = [
    { key: "full_name", label: "Full name", kind: "text", required: true, placeholder: "Enter your full name", justification: "Required to identify the registrant." },
    { key: "email", label: "Email", kind: "email", required: true, placeholder: "Enter your email", justification: "Required to confirm the registration." },
    { key: "phone", label: "Phone number", kind: "phone", required: false, placeholder: "Enter your phone number", justification: "Optional contact channel for event-day updates." }
  ];
  if (options.includeStudentId === true) {
    fields.push({ key: "student_id", label: "Student ID", kind: "text", required: false, placeholder: "Enter your student ID", justification: "Optional; include only when the organiser must verify enrolment." });
  }
  if (options.includeDietary === true) {
    fields.push({ key: "dietary_requirements", label: "Dietary requirements", kind: "textarea", required: false, placeholder: "Tell us about any dietary requirements", justification: "Optional; collected only to plan catering." });
  }
  if (options.includeAccessibility === true) {
    fields.push({ key: "accessibility_needs", label: "Accessibility needs", kind: "textarea", required: false, placeholder: "Tell us about any accessibility needs", justification: "Optional; collected only to arrange access." });
  }
  if (options.includeConsent === true) {
    fields.push({ key: "consent", label: "Photography and communications consent", kind: "multiple_choice", required: false, options: ["I consent", "I do not consent"], justification: "Optional; records an explicit choice without blocking registration." });
  }
  for (const field of fields) {
    if (SENSITIVE_KEYS.has(field.key) && field.required) {
      throw new Error(`Sensitive field ${field.key} must not be required without a justified requirement.`);
    }
  }
  const missingRequirements: string[] = [];
  if (capacity === undefined) missingRequirements.push("Registration capacity is unknown: confirm the attendee limit before publishing the form.");
  if (options.deadline === undefined) missingRequirements.push("Registration deadline is unknown: confirm the closing date before publishing the form.");
  const title = `${event.workflow.request.title} — Registration`;
  const description = capacity === undefined
    ? `Registration for ${event.workflow.request.title}.`
    : `Registration for ${event.workflow.request.title} (${capacity} places).`;
  return {
    eventId: event.id,
    title,
    description,
    ...(capacity === undefined ? {} : { capacity }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    fields,
    missingRequirements
  };
}

/** Derives the deterministic Tally block array for a reviewed specification. */
export function tallyBlocksFromSpec(spec: RegistrationSpec, uuid: () => string = randomUUID): TallyBlock[] {
  const titleUuid = uuid();
  const blocks: TallyBlock[] = [{
    uuid: titleUuid,
    type: "FORM_TITLE",
    groupUuid: titleUuid,
    groupType: "TEXT",
    payload: { title: spec.title, html: spec.title }
  }];
  for (const field of spec.fields) {
    const labelUuid = uuid();
    blocks.push({
      uuid: labelUuid,
      type: "TITLE",
      groupUuid: labelUuid,
      groupType: "QUESTION",
      payload: { html: field.label }
    });
    if (field.kind === "dropdown" || field.kind === "multiple_choice") {
      const groupUuid = uuid();
      const options = field.options ?? [];
      options.forEach((option, index) => {
        blocks.push({
          uuid: uuid(),
          type: field.kind === "dropdown" ? "DROPDOWN_OPTION" : "MULTIPLE_CHOICE_OPTION",
          groupUuid,
          groupType: field.kind === "dropdown" ? "DROPDOWN" : "MULTIPLE_CHOICE",
          payload: { index, isFirst: index === 0, isLast: index === options.length - 1, text: option }
        });
      });
    } else {
      const inputUuid = uuid();
      const type = field.kind === "text" ? "INPUT_TEXT" : field.kind === "email" ? "INPUT_EMAIL" : field.kind === "phone" ? "INPUT_PHONE_NUMBER" : "TEXTAREA";
      blocks.push({
        uuid: inputUuid,
        type,
        groupUuid: inputUuid,
        groupType: type,
        payload: field.placeholder === undefined
          ? { isRequired: field.required }
          : { isRequired: field.required, placeholder: field.placeholder }
      });
    }
  }
  return blocks;
}

/** Public form URL convention observed in the official Tally documentation. */
export function tallyFormUrl(formId: string): string {
  return `https://tally.so/r/${formId}`;
}

/** Stable hash of the reviewed content, used for duplicate detection. */
export function registrationSpecHash(spec: RegistrationSpec): string {
  return createHash("sha256")
    .update(JSON.stringify({ title: spec.title, capacity: spec.capacity ?? null, deadline: spec.deadline ?? null, fields: spec.fields }))
    .digest("hex");
}
