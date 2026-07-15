export type FileDropKind = "xml" | "m3u";

export function extensionMatchesFileName(name: string, kind: FileDropKind): boolean {
  const lower = name.trim().toLowerCase();
  if (kind === "xml") return lower.endsWith(".xml");
  return lower.endsWith(".m3u") || lower.endsWith(".m3u8");
}

export function expectedDropLabel(kind: FileDropKind): string {
  return kind === "xml" ? "XML" : "M3U/M3U8";
}

export async function resolveDroppedFilePath(file: File): Promise<string | null> {
  if (window.cuepoint?.resolveDroppedFilePath) {
    try {
      const path = window.cuepoint.resolveDroppedFilePath(file);
      if (path?.trim()) return path.trim();
    } catch {
      // fall through to mock path
    }
  }
  if (file.name.trim()) {
    return `C:\\Music\\${file.name.trim()}`;
  }
  return null;
}

export async function pickFirstDroppedPath(
  files: FileList | null | undefined,
  kind: FileDropKind,
): Promise<{ path: string } | { error: string }> {
  const file = files?.[0];
  if (!file) {
    return { error: "No file dropped." };
  }
  if (!extensionMatchesFileName(file.name, kind)) {
    return { error: `Drop a ${expectedDropLabel(kind)} file.` };
  }
  const path = await resolveDroppedFilePath(file);
  if (!path) {
    return { error: "Could not resolve file path." };
  }
  return { path };
}
