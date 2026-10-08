import { describe, expect, it } from "vitest";
import { CSP, CSP_DIRECTIVES, buildCsp, directivesFor } from "./csp";

describe("the Content-Security-Policy", () => {
  it("lets the forms reach Web3Forms, by submit and by fetch, in every build", () => {
    for (const isPublic of [false, true]) {
      const d = directivesFor(isPublic);
      expect(d["form-action"]).toContain("https://api.web3forms.com");
      expect(d["connect-src"]).toContain("https://api.web3forms.com");
    }
  });
  it("names Umami's hosts only in a public build, the only one that loads its script", () => {
    const preview = buildCsp(directivesFor(false));
    expect(preview).not.toContain("umami");
    const pub = directivesFor(true);
    expect(pub["script-src"]).toContain("https://cloud.umami.is");
    expect(pub["connect-src"]).toContain("https://cloud.umami.is");
    expect(pub["connect-src"]).toContain("https://api-gateway.umami.dev");
  });
  it("this build's policy is the preview one while PUBLIC is false", () => {
    expect(CSP).toBe(buildCsp(CSP_DIRECTIVES));
  });
  it("keeps the site's own origin first and allows no wildcard or blanket https:", () => {
    for (const isPublic of [false, true]) {
      for (const [name, sources] of Object.entries(directivesFor(isPublic))) {
        expect(sources[0], name).toBe("'self'");
        for (const s of sources) expect(s, `${name} ${s}`).not.toMatch(/^\*|^https?:$|\*$/);
      }
      expect(buildCsp(directivesFor(isPublic))).not.toContain("unsafe-eval");
    }
  });
  it("frames and embeds nothing from other sites", () => {
    expect(CSP_DIRECTIVES["default-src"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["img-src"]).not.toContain("https:");
  });
});
