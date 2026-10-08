import { describe, expect, it } from "vitest";
import {
  BUG_FIELDS,
  CONTACT_FIELDS,
  MIN_FILL_MS,
  isTooFast,
  isHoneypotFilled,
  isVersion,
  validateFields,
  type FieldValues,
} from "./forms";

const contact = (over: FieldValues = {}): FieldValues => ({ name: "", email: "dj@example.test", subject: "Question", message: "Hello there", ...over });
const bug = (over: FieldValues = {}): FieldValues => ({
  email: "dj@example.test",
  version: "1.0.0",
  system: "macos",
  chip: "arm64",
  happened: "It stopped",
  expected: "It should go on",
  steps: "Open it",
  ...over,
});

describe("isVersion", () => {
  it.each(["1.0.0", "0.9.12", "1.2.3-test.4", "10.20.30"])("accepts %s", (v) => expect(isVersion(v)).toBe(true));
  it.each(["1.0", "v1.0.0", "1.0.0-beta", "1.0.0-test", "1.0.0-test.", "1.0.0.0", " 1.0.0", ""])("rejects %j", (v) => expect(isVersion(v)).toBe(false));
});

describe("validateFields on the contact form", () => {
  it("passes a complete message, with the name left out", () => expect(validateFields(CONTACT_FIELDS, contact())).toEqual({}));
  it("asks for an email, and a valid one", () => {
    expect(validateFields(CONTACT_FIELDS, contact({ email: "" }))["email"]).toMatch(/email/i);
    expect(validateFields(CONTACT_FIELDS, contact({ email: "not an email" }))["email"]).toMatch(/email/i);
  });
  it("asks for a message, and treats spaces as nothing", () => {
    expect(validateFields(CONTACT_FIELDS, contact({ message: "   " }))["message"]).toMatch(/message/i);
  });
  it("accepts only the listed subjects (they become the email's subject line, so they read as words)", () => {
    expect(validateFields(CONTACT_FIELDS, contact({ subject: "spam" }))["subject"]).toBeDefined();
    for (const s of ["Feedback", "Question", "Other"]) expect(validateFields(CONTACT_FIELDS, contact({ subject: s }))).toEqual({});
  });
  it("reports fields in page order", () => {
    expect(Object.keys(validateFields(CONTACT_FIELDS, contact({ email: "", message: "" })))).toEqual(["email", "message"]);
  });
});

describe("validateFields on the bug form", () => {
  it("passes a complete report", () => expect(validateFields(BUG_FIELDS, bug())).toEqual({}));
  it("names the format of the version", () => {
    expect(validateFields(BUG_FIELDS, bug({ version: "one" }))["version"]).toMatch(/1\.0\.0/);
  });
  it("needs the system, chip and the three descriptions", () => {
    const errors = validateFields(BUG_FIELDS, bug({ system: "", chip: "", happened: "", expected: "", steps: "" }));
    expect(Object.keys(errors)).toEqual(["system", "chip", "happened", "expected", "steps"]);
  });
});

describe("spam checks", () => {
  it("a filled honeypot is spam; empty or off is not", () => {
    expect(isHoneypotFilled({ botcheck: "on" })).toBe(true);
    expect(isHoneypotFilled({ botcheck: "x" })).toBe(true);
    expect(isHoneypotFilled({ botcheck: "" })).toBe(false);
    expect(isHoneypotFilled({})).toBe(false);
  });
  it("a send sooner than the minimum fill time is too fast; at or after it is not", () => {
    expect(isTooFast(0, MIN_FILL_MS - 1)).toBe(true);
    expect(isTooFast(0, MIN_FILL_MS)).toBe(false);
    expect(isTooFast(1000, 1000 + MIN_FILL_MS + 9000)).toBe(false);
  });
});
