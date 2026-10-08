import { describe, expect, it } from "vitest";
import { ALLOWED_COOKIES, cookieNames, unlistedCookies } from "./consent";

describe("cookieNames", () => {
  it("reads names from document.cookie text", () => {
    expect(cookieNames("a=1; b=2;c=")).toEqual(["a", "b", "c"]);
    expect(cookieNames("")).toEqual([]);
    expect(cookieNames("  ")).toEqual([]);
  });
});

describe("unlistedCookies", () => {
  it("the allow list is empty today", () => expect(ALLOWED_COOKIES).toEqual([]));
  it("finds none when there are no cookies", () => expect(unlistedCookies("")).toEqual([]));
  it("finds every cookie that is not allowed", () => {
    expect(unlistedCookies("_ga=1; ok=2", ["ok"])).toEqual(["_ga"]);
    expect(unlistedCookies("x=1")).toEqual(["x"]);
  });
});
