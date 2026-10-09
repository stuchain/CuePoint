import { describe, expect, it } from "vitest";
import { HERO } from "../data/home";
import { flatShadow, splitWords } from "./headline";

/** The headline build's pure parts (SITE-06); e2e/home.spec.ts checks it in a browser. */
describe("the headline build", () => {
  it("splits the headline into its words and the spaces between, losing nothing", () => {
    const parts = splitWords(HERO.heading);
    expect(parts.join("")).toBe(HERO.heading);
    expect(parts.filter((p) => p.trim() !== "")).toEqual(HERO.heading.split(/\s+/));
  });

  it("presses a letter flat: the same shadows, in the same colors, with no offset", () => {
    const depth = "rgb(109, 40, 217) 2px 2px 0px, rgb(109, 40, 217) 4px 4px 0px, rgb(0, 0, 0) 6px 6px 0px";
    expect(flatShadow(depth)).toBe("rgb(109, 40, 217) 0px 0px 0px, rgb(109, 40, 217) 0px 0px 0px, rgb(0, 0, 0) 0px 0px 0px");
    expect(flatShadow("rgb(0, 0, 0) -3px 1.5px 0px")).toBe("rgb(0, 0, 0) 0px 0px 0px");
  });
});
