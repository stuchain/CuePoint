import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_EVENT_NAME, FORM_SENT_EVENT_NAME } from "./analytics-client";

const read = (name: string) => readFileSync(join(import.meta.dirname, name), "utf8");

describe("the event names analytics-client listens for", () => {
  it("are the ones download-client and form-client dispatch", () => {
    expect(read("download-client.ts")).toContain(`DOWNLOAD_EVENT = "${DOWNLOAD_EVENT_NAME}"`);
    expect(read("form-client.ts")).toContain(`FORM_SENT_EVENT = "${FORM_SENT_EVENT_NAME}"`);
  });
});
