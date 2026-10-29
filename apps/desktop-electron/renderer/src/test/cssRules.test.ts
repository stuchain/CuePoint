import { describe, expect, it } from "vitest";
import { parseRules, stripComments } from "./cssRules";

describe("reading CSS as text", () => {
  // A Windows checkout has CRLF line ends: a selector list split over lines must read the same there.
  it("reads a CRLF selector list as the LF one", () => {
    const [rule] = parseRules(stripComments(".a th,\r\n.a td {\r\n  height: 1px;\r\n}\r\n"));
    expect(rule!.selector).toBe(".a th,\n.a td");
  });
});
