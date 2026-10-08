/**
 * Reading GitHub's release list (DIST-05, DEC-169): a recorded response maps
 * to the rule's input, and anything that goes wrong is "could not check",
 * never "up to date".
 */
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { RELEASES_REPOSITORY, RELEASES_URL, fetchReleases, mapRelease } from "./releaseList";
import { pickUpdate } from "./updateRule";

const recorded: unknown[] = JSON.parse(
  readFileSync(new URL("./githubReleases.fixture.json", import.meta.url), "utf8"),
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => response());
}

describe("the repository", () => {
  it("is named once, and the list URL is built from it", () => {
    expect(RELEASES_REPOSITORY).toBe("stuchain/CuePoint");
    expect(RELEASES_URL).toBe(
      "https://api.github.com/repos/stuchain/CuePoint/releases?per_page=100",
    );
  });
});

describe("mapRelease", () => {
  it("maps the test pre-release with all its files", () => {
    const release = mapRelease(recorded[0]);
    expect(release).toMatchObject({
      tag: "v1.0.0-test.1",
      version: "1.0.0-test.1",
      draft: false,
      prerelease: true,
      publishedAt: "2026-10-08T09:00:00Z",
      htmlUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.0.0-test.1",
    });
    expect(release?.notes).toContain("Second test build");
    const names = release?.assets.map((a) => a.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining([
        "latest.yml",
        "latest-mac.yml",
        "latest-linux.yml",
        "CuePoint-1.0.0-test.1-win-x64-setup.exe",
        "CuePoint-1.0.0-test.1-mac-arm64.zip",
        "CuePoint-1.0.0-test.1-mac-arm64.zip.blockmap",
        "CuePoint-1.0.0-test.1-mac-x64.zip.blockmap",
        "CuePoint-1.0.0-test.1-linux-x86_64.AppImage.blockmap",
        "CuePoint-1.0.0-test.1-mac-x64.zip",
        "CuePoint-1.0.0-test.1-linux-x86_64.AppImage",
        "SHA256SUMS-win.txt",
      ]),
    );
    const exe = release?.assets.find((a) => a.name.endsWith("-setup.exe"));
    expect(exe?.url).toBe(
      "https://github.com/stuchain/CuePoint/releases/download/v1.0.0-test.1/CuePoint-1.0.0-test.1-win-x64-setup.exe",
    );
    expect(exe?.size).toBe(98000000);
  });

  it("keeps a draft and gives an out-of-scheme tag no version", () => {
    expect(mapRelease(recorded[1])).toMatchObject({
      tag: "v1.0.0-feb1-test1",
      version: null,
      draft: true,
      publishedAt: null,
    });
  });

  it("maps a normal release", () => {
    expect(mapRelease(recorded[2])).toMatchObject({
      tag: "v0.0.3",
      version: "0.0.3",
      draft: false,
      prerelease: false,
    });
  });

  it("skips malformed entries", () => {
    expect(mapRelease(null)).toBeNull();
    expect(mapRelease("v1.0.0")).toBeNull();
    expect(mapRelease([])).toBeNull();
    expect(mapRelease({})).toBeNull();
    expect(mapRelease({ tag_name: 7 })).toBeNull();
    expect(mapRelease({ tag_name: "v1.0.0", draft: "no", assets: [] })).toBeNull();
  });

  it("keeps html_url only when it is https", () => {
    const base = { tag_name: "v1.2.3", draft: false, assets: [] };
    expect(mapRelease({ ...base, html_url: "http://example.test/r" })?.htmlUrl).toBeNull();
    expect(mapRelease({ ...base, html_url: "javascript:alert(1)" })?.htmlUrl).toBeNull();
    expect(mapRelease({ ...base, html_url: 5 })?.htmlUrl).toBeNull();
    expect(mapRelease({ ...base, html_url: "https://example.test/r" })?.htmlUrl).toBe(
      "https://example.test/r",
    );
  });

  it("tolerates missing optional fields and drops malformed assets", () => {
    const release = mapRelease({
      tag_name: "v1.2.3",
      draft: false,
      prerelease: false,
      body: null,
      published_at: null,
      assets: [
        { name: "latest.yml", browser_download_url: "https://example.test/latest.yml" },
        { name: "no-url" },
        null,
        { browser_download_url: "https://example.test/x" },
      ],
    });
    expect(release).toEqual({
      tag: "v1.2.3",
      version: "1.2.3",
      draft: false,
      prerelease: false,
      notes: "",
      publishedAt: null,
      htmlUrl: null,
      assets: [{ name: "latest.yml", url: "https://example.test/latest.yml" }],
    });
  });
});

describe("fetchReleases", () => {
  it("returns the mapped list and asks politely", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(recorded));
    const result = await fetchReleases({ appVersion: "1.4.0", fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.releases.map((r) => r.tag)).toEqual([
      "v1.0.0-test.1",
      "v1.0.0-feb1-test1",
      "v0.0.3",
      "v0.0.2",
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(RELEASES_URL);
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("User-Agent")).toBe("CuePoint/1.4.0");
  });

  it("feeds the rule: only the test pre-release is a candidate", async () => {
    const result = await fetchReleases({
      appVersion: "0.0.2",
      fetchImpl: fakeFetch(() => jsonResponse(recorded)),
    });
    if (!result.ok) throw new Error("expected ok");
    // A normal build is offered no test release, and v0.0.3 has no manifest.
    expect(pickUpdate("0.0.2", result.releases, "win-x64")).toBeNull();
    // A test build is offered the test pre-release on every target.
    for (const target of ["win-x64", "mac-arm64", "mac-x64", "linux-x64"] as const) {
      expect(pickUpdate("0.0.3-test.1", result.releases, target)?.tag).toBe("v1.0.0-test.1");
    }
  });

  it("skips malformed entries but keeps the rest", async () => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => jsonResponse([null, recorded[2], { nope: true }])),
    });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.releases.map((r) => r.tag)).toEqual(["v0.0.3"]);
  });

  it("is could-not-check when a non-empty list has no readable release", async () => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => jsonResponse([null, { nope: true }])),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "could-not-check",
      detail: "None of GitHub's releases could be read.",
    });
  });

  it("accepts a genuinely empty list", async () => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => jsonResponse([])),
    });
    expect(result).toEqual({ ok: true, releases: [] });
  });

  describe("pagination", () => {
    const next = (url: string) => ({ Link: `<${url}>; rel="next", <${url}>; rel="last"` });
    const page = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status: 200, headers });

    it("follows the next link and joins the pages", async () => {
      const second = "https://api.github.com/repositories/1/releases?per_page=100&page=2";
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(page([recorded[0]], next(second)))
        .mockResolvedValueOnce(page([recorded[2]]));
      const result = await fetchReleases({ appVersion: "1.4.0", fetchImpl });
      expect(result.ok && result.releases.map((r) => r.tag)).toEqual(["v1.0.0-test.1", "v0.0.3"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[1][0]).toBe(second);
      const headers = new Headers(fetchImpl.mock.calls[1][1]?.headers);
      expect(headers.get("User-Agent")).toBe("CuePoint/1.4.0");
    });

    it("stops after 5 pages", async () => {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        page([recorded[0]], next("https://api.github.com/x?page=n")),
      );
      const result = await fetchReleases({ appVersion: "1.0.0", fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(5);
      expect(result.ok && result.releases).toHaveLength(5);
    });

    it("is could-not-check when a later page fails", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(page([recorded[0]], next("https://api.github.com/x?page=2")))
        .mockResolvedValueOnce(new Response("{}", { status: 403 }));
      expect(await fetchReleases({ appVersion: "1.0.0", fetchImpl })).toMatchObject({
        ok: false,
        reason: "could-not-check",
      });
    });

    it("refuses a next link that is not https", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(page([recorded[0]], next("http://api.github.com/x?page=2")));
      expect(await fetchReleases({ appVersion: "1.0.0", fetchImpl })).toMatchObject({
        ok: false,
        reason: "could-not-check",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  it.each([403, 429, 500, 404, 301])("is could-not-check on a %i", async (status) => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => jsonResponse({ message: "API rate limit exceeded" }, status)),
    });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
  });

  it("is could-not-check on a network error", async () => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => Promise.reject(new TypeError("fetch failed"))),
    });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
    if (!result.ok) expect(result.detail).toContain("fetch failed");
  });

  it.each([
    ["an object", { message: "Not Found" }],
    ["a string", "hello"],
    ["null", null],
  ])("is could-not-check when the body is %s, not an array", async (_name, body) => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => jsonResponse(body)),
    });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
  });

  it("is could-not-check when the body is not JSON", async () => {
    const result = await fetchReleases({
      appVersion: "1.0.0",
      fetchImpl: fakeFetch(() => new Response("<html>", { status: 200 })),
    });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
  });

  it("gives up after the timeout when the request never answers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const result = await fetchReleases({ appVersion: "1.0.0", fetchImpl, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
    if (!result.ok) expect(result.detail.toLowerCase()).toContain("timed out");
  });

  it("waits 15 seconds by default", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const pending = fetchReleases({ appVersion: "1.0.0", fetchImpl });
      await vi.advanceTimersByTimeAsync(14_999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({ ok: false, reason: "could-not-check" });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "http://api.github.com/repos/stuchain/CuePoint/releases",
    "ftp://example.test/releases",
    "file:///etc/passwd",
    "not a url",
    "",
  ])("refuses %j without making a request", async (url) => {
    const fetchImpl = fakeFetch(() => jsonResponse(recorded));
    const result = await fetchReleases({ appVersion: "1.0.0", url, fetchImpl });
    expect(result).toMatchObject({ ok: false, reason: "could-not-check" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
