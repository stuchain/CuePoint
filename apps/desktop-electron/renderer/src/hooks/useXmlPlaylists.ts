import { useCallback, useEffect, useState } from "react";
import type { XmlPlaylistEntry } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { mockXmlPlaylists } from "../mocks/fixtures";

export function useXmlPlaylists(xmlPath: string, fileSource: "none" | "mock" | "native") {
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState<XmlPlaylistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const engineAvailable = hasEngineBridge();

  const loadPlaylists = useCallback(async () => {
    if (!xmlPath || fileSource === "none") {
      setPlaylists([]);
      setError(null);
      return;
    }

    if (!engineAvailable || fileSource === "mock") {
      setPlaylists(mockXmlPlaylists);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await window.cuepoint!.getXmlPlaylists(xmlPath);
      setPlaylists(payload.playlists);
    } catch (err) {
      setPlaylists([]);
      setError(err instanceof Error ? err.message : "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, [engineAvailable, fileSource, xmlPath]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  return { loading, playlists, error, reload: loadPlaylists, engineAvailable };
}
