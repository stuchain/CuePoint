import { useCallback, useEffect, useState } from "react";
import type { BeatportTokenStatus } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";

export function useBeatportToken() {
  const engineAvailable = hasEngineBridge();
  const [status, setStatus] = useState<BeatportTokenStatus>({
    configured: false,
    masked: null,
  });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  // Whether the status has been read once: until then the field is about to
  // be disabled for the read, and anything that focuses it would lose focus.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.cuepoint?.getBeatportTokenStatus) {
      setStatus({ configured: false, masked: null });
      return;
    }
    setLoading(true);
    try {
      const next = await window.cuepoint.getBeatportTokenStatus();
      setStatus(next);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (engineAvailable) {
      void refresh();
    }
  }, [engineAvailable, refresh]);

  const save = useCallback(async () => {
    if (!window.cuepoint?.setBeatportToken) {
      throw new Error("Beatport token storage requires the Electron app with engine connected.");
    }
    const token = draft.trim();
    if (!token) {
      return status;
    }
    setSaving(true);
    try {
      const next = await window.cuepoint.setBeatportToken(token);
      setStatus(next);
      setDraft("");
      setTestMessage(null);
      return next;
    } finally {
      setSaving(false);
    }
  }, [draft, status]);

  const test = useCallback(async () => {
    if (!window.cuepoint?.testBeatportToken) {
      throw new Error("Beatport token test requires the Electron app with engine connected.");
    }
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await window.cuepoint.testBeatportToken(
        draft.trim() ? { token: draft.trim() } : undefined,
      );
      setTestMessage(result.message);
      return result;
    } finally {
      setTesting(false);
    }
  }, [draft]);

  return {
    engineAvailable,
    status,
    draft,
    setDraft,
    loading,
    loaded,
    saving,
    testing,
    testMessage,
    refresh,
    save,
    test,
  };
}
