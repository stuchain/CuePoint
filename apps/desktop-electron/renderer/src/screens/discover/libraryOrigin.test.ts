/**
 * Every opener that starts an Artist, Label or Similar page from a track of the Library says so (C221):
 * the crumb then names the Library and the sidebar keeps it lit. The openers sit in screens that are
 * costly to render for one click, so this reads the code that calls `navigate` for each.
 */
import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import cleanSource from "../clean/CleanScreen.tsx?raw";
import keysSource from "../keys/KeysScreen.tsx?raw";
import prepareSource from "../prepare/PrepareScreen.tsx?raw";
import { originState, pageOrigin } from "./discoverLinks";

describe("the Library as the origin of an Artist, Label or Similar page", () => {
  it("is carried by the route state and read back", () => {
    expect(originState("library")).toEqual({ from: "library" });
    expect(pageOrigin(originState("library"))).toBe("library");
  });

  it.each([
    ["Clean", cleanSource],
    ["Prepare", prepareSource],
    ["Keys", keysSource],
  ])("%s passes the origin when it opens a page", (_name, source) => {
    // No bare navigate to an Artist, Label or Similar path: each carries { state: originState(...) }.
    expect(source).not.toMatch(/navigate\((?:entityPath|similarPath)\([^()]*\)\)/);
    expect(source).toMatch(/originState\("library"\)/);
  });

  it("opens from the app shell with the origin of the page it is on", () => {
    expect(appSource).not.toMatch(/state:\s*\{\s*from:\s*originRef\.current\s*\}/);
    expect(appSource.match(/originState\(originRef\.current\)/g)).toHaveLength(2);
  });
});
