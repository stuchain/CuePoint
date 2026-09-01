import { useCallback, useState } from "react";
import type { SyncTagsOptions, SyncTagsResponse } from "../api/syncTagsUtils";
import type { TrackResult } from "../mocks/types";
import { buildSyncRequest } from "../api/syncTagsUtils";
import { hasEngineBridge } from "../api/cuepointBridge.types";

interface RunSyncParams {
  options: SyncTagsOptions;
  meta: import("../api/syncTagsUtils").MatchMeta;
  mode: "single" | "batch";
  results?: TrackResult[];
  batchResults?: Record<string, TrackResult[]>;
  playlistName?: string;
}

export function useSyncTags({ onError }: { onError?: (message: string) => void } = {}) {
  const [syncing, setSyncing] = useState(false);

  const resolveXmlPath = useCallback(async (current?: string) => {
    if (current?.trim()) return current.trim();
    if (!window.cuepoint?.openXmlFileDialog) {
      throw new Error("Select a Rekordbox XML file for collection sync.");
    }
    const picked = await window.cuepoint.openXmlFileDialog();
    if (picked.canceled) {
      throw new Error("XML selection cancelled.");
    }
    return picked.filePath;
  }, []);

  const runSync = useCallback(
    async (params: RunSyncParams): Promise<SyncTagsResponse | null> => {
      if (!hasEngineBridge() || !window.cuepoint?.syncTags) {
        onError?.("Sync with Rekordbox requires the Electron engine.");
        return null;
      }

      let meta = params.meta;
      const pathBased =
        meta.source === "playlist_file" ||
        (params.results ?? []).some((row) => typeof row.file_path === "string" && row.file_path.trim());

      if (!pathBased && !meta.xmlPath?.trim()) {
        try {
          const xmlPath = await resolveXmlPath();
          meta = { ...meta, xmlPath };
        } catch (error) {
          onError?.(error instanceof Error ? error.message : "XML selection failed");
          return null;
        }
      }

      setSyncing(true);
      try {
        const body = buildSyncRequest({ ...params, meta });
        return await window.cuepoint.syncTags(body);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Sync failed");
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [onError, resolveXmlPath],
  );

  return { syncing, runSync };
}
