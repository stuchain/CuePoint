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
    saving,
    testing,
    testMessage,
    refresh,
    save,
    test,
  };
}
