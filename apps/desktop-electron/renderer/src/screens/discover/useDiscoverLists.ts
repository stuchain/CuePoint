/**
 * The saved artist and label lists a dig can look for (New dig).
 *
 * The engine keeps them (one name per kind, members in order); this reads them
 * once when the form opens (a failed read is kept as `readError`) and answers each change with the list as saved, or
 * the engine's words for why not, so the editor can say what to fix. A bridge
 * without the methods reads as no lists, and a change says the desktop app is
 * needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { DiscoverList, DiscoverListKind } from "../../api/cuepointBridge.types";
import { userMessage } from "../../api/userMessage";
import { reportUnexpected } from "../../reporting/reporting";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE } from "./discoverTools";

/** A change's outcome: the list as saved, or what to tell the person. */
export type ListChange = { list: DiscoverList; error: null } | { list: null; error: string };

export interface DiscoverListsState {
  lists: readonly DiscoverList[];
  /** Why the lists could not be read, or null. Without them the field must not say "none yet". */
  readError: string | null;
  create: (kind: DiscoverListKind, name: string, members: string[]) => Promise<ListChange>;
  update: (id: number, changes: { name?: string; members?: string[] }) => Promise<ListChange>;
  /** Null when it was deleted, else what went wrong. */
  remove: (id: number) => Promise<string | null>;
}

const byName = (a: DiscoverList, b: DiscoverList) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function useDiscoverLists(): DiscoverListsState {
  const [lists, setLists] = useState<readonly DiscoverList[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const read = window.cuepoint?.getDiscoverLists;
    // No bridge (a plain browser) reads as no lists: the page says it needs the desktop app itself.
    if (typeof read !== "function") {
      return () => {
        alive.current = false;
      };
    }
    void (async () => {
      try {
        const answer = await read();
        if (!alive.current) return;
        if (answer.refusal) setReadError(refusalText(answer.refusal));
        else setLists(answer.value.lists);
      } catch (cause) {
        reportUnexpected(cause);
        if (alive.current) setReadError(userMessage(cause));
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  const keep = useCallback((saved: DiscoverList) => {
    setLists((previous) =>
      [...previous.filter((list) => list.id !== saved.id), saved].sort(byName),
    );
  }, []);

  const create = useCallback<DiscoverListsState["create"]>(
    async (kind, name, members) => {
      const bridge = window.cuepoint?.createDiscoverList;
      if (typeof bridge !== "function") return { list: null, error: NO_ENGINE };
      try {
        const answer = await bridge({ kind, name, members });
        if (answer.refusal) return { list: null, error: refusalText(answer.refusal) };
        keep(answer.value);
        return { list: answer.value, error: null };
      } catch (cause) {
        reportUnexpected(cause);
        return { list: null, error: userMessage(cause) };
      }
    },
    [keep],
  );

  const update = useCallback<DiscoverListsState["update"]>(
    async (id, changes) => {
      const bridge = window.cuepoint?.updateDiscoverList;
      if (typeof bridge !== "function") return { list: null, error: NO_ENGINE };
      try {
        const answer = await bridge({ list_id: id, ...changes });
        if (answer.refusal) return { list: null, error: refusalText(answer.refusal) };
        keep(answer.value);
        return { list: answer.value, error: null };
      } catch (cause) {
        reportUnexpected(cause);
        return { list: null, error: userMessage(cause) };
      }
    },
    [keep],
  );

  const remove = useCallback<DiscoverListsState["remove"]>(async (id) => {
    const bridge = window.cuepoint?.deleteDiscoverList;
    if (typeof bridge !== "function") return NO_ENGINE;
    try {
      const answer = await bridge({ list_id: id });
      // Gone already is as good as deleted: the list is not there to keep.
      if (answer.refusal && answer.refusal.code !== "DISCOVER_LIST_NOT_FOUND") {
        return refusalText(answer.refusal);
      }
      setLists((previous) => previous.filter((list) => list.id !== id));
      return null;
    } catch (cause) {
      reportUnexpected(cause);
      return userMessage(cause);
    }
  }, []);

  return { lists, readError, create, update, remove };
}
