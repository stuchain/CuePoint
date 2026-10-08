/**
 * What the contact and bug-report forms accept (SITE-12, DEC-143). Pure: the page's script
 * (form-client.ts) and the tests use the same rules, and the server-side service repeats the
 * basics for a visitor with no script.
 */
export type FieldValues = Readonly<Record<string, string | undefined>>;

export type FieldKind = "text" | "email" | "version" | "choice";

export interface FieldSpec {
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  /** For a choice: the values the form offers. */
  readonly choices?: readonly string[];
  /** The message under the field when it is empty. */
  readonly missing: string;
  /** The message under the field when it is filled but wrong (email, version, choice). */
  readonly invalid?: string;
}

/** Where a visitor finds the version (the bug form says so above the field). */
export const VERSION_HELP = "Open Settings › About & updates in the app. It looks like 1.0.0.";

export const SUBJECTS = ["Feedback", "Question", "Other"] as const;
export const SYSTEMS = ["windows", "macos", "linux"] as const;
export const CHIPS = ["x64", "arm64"] as const;

export const CONTACT_FIELDS: readonly FieldSpec[] = [
  { name: "name", kind: "text", required: false, missing: "" },
  { name: "email", kind: "email", required: true, missing: "Enter your email address, so we can reply.", invalid: "That does not look like an email address. Check it and try again." },
  { name: "subject", kind: "choice", required: true, choices: SUBJECTS, missing: "Choose what this is about.", invalid: "Choose one of the subjects in the list." },
  { name: "message", kind: "text", required: true, missing: "Write a message." },
];

export const BUG_FIELDS: readonly FieldSpec[] = [
  { name: "email", kind: "email", required: true, missing: "Enter your email address, so we can reply.", invalid: "That does not look like an email address. Check it and try again." },
  {
    name: "version",
    kind: "version",
    required: true,
    missing: "Enter the app's version, for example 1.0.0.",
    invalid: "Write the version as numbers with dots, for example 1.0.0 or 1.0.0-test.2.",
  },
  { name: "system", kind: "choice", required: true, choices: SYSTEMS, missing: "Choose your system.", invalid: "Choose one of the systems in the list." },
  { name: "chip", kind: "choice", required: true, choices: CHIPS, missing: "Choose your chip.", invalid: "Choose one of the chips in the list." },
  { name: "happened", kind: "text", required: true, missing: "Say what happened." },
  { name: "expected", kind: "text", required: true, missing: "Say what you expected to happen." },
  { name: "steps", kind: "text", required: true, missing: "List the steps that lead to it." },
];

/** `X.Y.Z` or `X.Y.Z-test.N`, the two shapes of the app's version. */
export const VERSION_PATTERN = "\\d+\\.\\d+\\.\\d+(-test\\.\\d+)?";

export function isVersion(value: string): boolean {
  return new RegExp(`^${VERSION_PATTERN}$`).test(value);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The message for each field that is wrong, keyed by field name, in the order of the specs. */
export function validateFields(specs: readonly FieldSpec[], values: FieldValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const value = (values[spec.name] ?? "").trim();
    if (value === "") {
      if (spec.required) errors[spec.name] = spec.missing;
      continue;
    }
    if (spec.kind === "email" && !isEmail(value)) errors[spec.name] = spec.invalid ?? spec.missing;
    else if (spec.kind === "version" && !isVersion(value)) errors[spec.name] = spec.invalid ?? spec.missing;
    else if (spec.kind === "choice" && !(spec.choices ?? []).includes(value)) errors[spec.name] = spec.invalid ?? spec.missing;
  }
  return errors;
}

/** The hidden field a person never sees (Web3Forms calls it `botcheck`): a robot fills it in. */
export const HONEYPOT = "botcheck";

export function isHoneypotFilled(values: FieldValues): boolean {
  return (values[HONEYPOT] ?? "").trim() !== "";
}

/** A form sent sooner than this after it appeared was not typed by a person: it is treated like a filled honeypot. */
export const MIN_FILL_MS = 3000;

/** Whether a send comes sooner than the minimum fill time after the form appeared. */
export function isTooFast(shownAt: number, now: number): boolean {
  return now - shownAt < MIN_FILL_MS;
}
