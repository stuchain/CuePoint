import { detect, fileFor, noteFor, otherMacFile, type Detection } from "./detect";
import type { ReleaseFile } from "./releases";

/**
 * The browser side of SITE-07, one small script for the whole site. The header includes it only when
 * the release data holds a release, with that data (the files, nothing else) in
 * `<script type="application/json" id="cp-releases">`.
 *
 * Every page renders a neutral "Download" first. After the page is shown this names the system on
 * each `a.js-download` and points it at that system's file. Nothing here changes a size: the button
 * already holds room for its longest label, and the download page's notes sit in a reserved box and
 * are only unhidden, so detection never shifts the layout.
 *
 * Each click on a link to a listed file dispatches `cuepoint:download` on document, with
 * `{ system, chip }` in `detail` (SITE-12 forwards it to the analytics). Nothing is sent from here.
 */
export const DOWNLOAD_EVENT = "cuepoint:download";

export interface DownloadEventDetail {
  system: ReleaseFile["system"];
  chip: ReleaseFile["chip"];
}

function readFiles(): ReleaseFile[] {
  const el = document.getElementById("cp-releases");
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent) as { files?: ReleaseFile[] };
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

function setShareStatus(text: string) {
  const status = document.querySelector<HTMLElement>("[data-share-status]");
  if (status) status.textContent = text;
}

async function share() {
  const url = location.href.split("#")[0] ?? location.href;
  const data = { title: "CuePoint", text: "CuePoint is a free desktop app for DJs that cleans up a Rekordbox library. It runs on Windows, macOS and Linux.", url };
  try {
    if (typeof navigator.share === "function") {
      await navigator.share(data);
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setShareStatus("Link copied. Open it on your computer.");
  } catch {
    setShareStatus(`Copy this address: ${url}`);
  }
}

function apply(d: Detection, files: readonly ReleaseFile[]) {
  const file = fileFor(files, d);
  if (file) {
    for (const button of document.querySelectorAll<HTMLAnchorElement>("a.js-download")) {
      button.dataset["system"] = file.system;
      if (button.closest("[data-hero]")) {
        // only the download page's own button is the file...
        button.href = file.url;
        button.rel = "noopener noreferrer";
      } else {
        // ...every other Download button names the system and opens that system's "What happens next"
        button.href = `${(button.getAttribute("href") ?? "").split("#")[0]}#${file.system}`;
      }
    }
  }

  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;
  if (d.kind === "mobile") {
    // the mobile layer shares the desktop layer's grid cell, so swapping them moves nothing
    hero.querySelector("[data-layer=desktop]")?.setAttribute("data-off", "");
    hero.querySelector("[data-layer=mobile]")?.setAttribute("data-on", "");
    return void hero.querySelector<HTMLButtonElement>("[data-share]")?.addEventListener("click", () => void share());
  }
  const note = hero.querySelector<HTMLElement>(`[data-note="${noteFor(d, file !== undefined)}"]`);
  note?.setAttribute("data-on", "");
  const alt = note?.querySelector<HTMLAnchorElement>("[data-alt]");
  if (alt && d.kind === "desktop" && d.system === "macos") {
    const other = otherMacFile(files, d.chip);
    if (other) {
      alt.href = other.url;
      alt.rel = "noopener noreferrer";
    }
  }
}

export function initDownloads() {
  const files = readFiles();
  if (files.length === 0) return;

  const onDownload = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const file = files.find((f) => f.url === link.href);
    if (!file) return;
    const detail: DownloadEventDetail = { system: file.system, chip: file.chip };
    document.dispatchEvent(new CustomEvent<DownloadEventDetail>(DOWNLOAD_EVENT, { detail }));
    // after a click in the page's main box, show what to expect first (the section is already laid out)
    if (link.closest("[data-hero]")) location.hash = file.system;
  };
  document.addEventListener("click", onDownload);
  // a middle click opens the file in a new tab and is a download too
  document.addEventListener("auxclick", (event) => {
    if (event.button === 1) onDownload(event);
  });

  void detect().then((d) => apply(d, files));
}

initDownloads();
