/**
 * The Collections section's state and its writes (ORG-09, DEC-062).
 *
 * Fetches CuePoint's own tree, remembers what is open and what is selected,
 * and turns every edit into one engine call followed by one reload. The
 * alternative — patching the local tree after each write — means two copies of
 * the rules about depth, sibling order and what a folder may hold, and the
 * copy in the renderer would be the one that is wrong.
 *
 * A reload after a write is one query over a few hundred rows; ORG-08 measured
 * the tree with its counts as one statement, not two per node.
 *
 * Every write returns the message it failed with rather than throwing, because
 * every caller here is a gesture — a drop, a rename, a menu item — and a
 * gesture that raises has nowhere to put the error.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CollectionNode,
  CollectionSubtree,
  FilterRuleSet,
  SetAnswer,
  SetSource,
} from "../../api/cuepointBridge.types";
import {
  COLLECTIONS_PANE_STORAGE_KEY,
  buildCollectionTree,
  collectionAncestors,
  collectionRows,
  findCollection,
  loadCollectionsState,
  pruneCollectionIds,
  saveCollectionsState,
  type CollectionRow,
  type CollectionTreeNode,
  type CollectionsPaneState,
} from "./collectionTree";

export type CollectionTreeStatus = "loading" | "ready" | "error" | "unavailable";

/** What a write answered: the node it produced, or why it could not. */
export interface WriteResult {
  ok: boolean;
  error?: string;
  node?: CollectionNode;
}

export interface CollectionTreeController {
  tree: CollectionTreeNode[];
  rows: CollectionRow[];
  selected: CollectionTreeNode | null;
  status: CollectionTreeStatus;
  error: string | null;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  select: (node: CollectionNode | null) => void;
  expand: (id: number, expanded: boolean) => void;
  reload: () => void;
  /** A folder, a Collection, or a Set with its one unnamed chapter (PREP-02). */
  create: (kind: CreatableKind, name: string, parentId: number | null) => Promise<WriteResult>;
  /**
   * "New Set from…" (DEC-104): a copy of a Collection's entries, a Smart
   * Collection's answer now, a Rekordbox playlist or a selection, in its
   * order. Nothing is converted in place, so the source is left as it was.
   */
  createSetFrom: (
    source: SetSource,
    name: string | null,
    parentId: number | null,
  ) => Promise<WriteResult & { trackCount?: number }>;
  /** A Set copied whole: chapters, times, notes and acknowledgements (PREP-02). */
  duplicateSet: (id: number, name?: string | null) => Promise<WriteResult>
  rename: (id: number, name: string) => Promise<WriteResult>;
  move: (id: number, parentId: number | null) => Promise<WriteResult>;
  previewDelete: (id: number) => Promise<CollectionSubtree | null>;
  remove: (id: number) => Promise<WriteResult>;
  addTracks: (
    collectionId: number,
    trackIds: number[],
  ) => Promise<WriteResult & { added?: number; skipped?: number }>;
  saveSmart: (
    name: string,
    rules: FilterRuleSet,
    parentId?: number | null,
    sort?: string,
    dir?: "asc" | "desc",
  ) => Promise<WriteResult>;
  /** Replace a Smart Collection's rules, never quietly (ORG-12). */
  updateSmart: (
    id: number,
    rules: FilterRuleSet,
    sort?: string,
    dir?: "asc" | "desc",
  ) => Promise<WriteResult>;
  /**
   * A second saved question that starts out identical (DEC-061, ORG-13).
   *
   * It links nothing: editing either leaves the other alone, which is the
   * whole reason to duplicate rather than to reference.
   */
  duplicateSmart: (id: number, name?: string | null) => Promise<WriteResult>;
  /**
   * Store a Smart Collection's answer as a Collection that never changes.
   *
   * The count comes back because it is the sentence worth saying: "frozen 412
   * tracks" is what happened, and the tree alone would only show a new row.
   */
  freezeSmart: (
    id: number,
    name?: string | null,
  ) => Promise<WriteResult & { frozen?: number }>;
}

/** What the pane's "new" buttons make. A Smart Collection is saved from rules. */
export type CreatableKind = "folder" | "collection" | "set";

/** Said when the shell has no `sets` namespace: a browser tab, an older shell. */
export const NO_SETS_BRIDGE = "This build cannot make Sets.";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * A Set's answer as a write's result (PREP-08, DISCOVER-09).
 *
 * A refusal is the engine's sentence, as every other write here reports. The
 * one worth more than a sentence is `SET_NOT_FOUND`: the node is gone, deleted
 * in another window, so the tree is re-read and stops drawing it.
 */
async function answerOf<T>(
  run: () => Promise<SetAnswer<T>>,
  reload: () => void,
  read: (value: T) => WriteResult & { trackCount?: number },
): Promise<WriteResult & { trackCount?: number }> {
  try {
    const answer = await run();
    if (answer.refusal) {
      if (answer.refusal.code === "SET_NOT_FOUND") reload();
      return { ok: false, error: answer.refusal.message };
    }
    reload();
    return read(answer.value);
  } catch (cause) {
    return { ok: false, error: messageOf(cause) };
  }
}

export function useCollectionTree(
  storageKey: string = COLLECTIONS_PANE_STORAGE_KEY,
): CollectionTreeController {
  const [nodes, setNodes] = useState<CollectionNode[]>([]);
  const [status, setStatus] = useState<CollectionTreeStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<CollectionsPaneState>(() =>
    loadCollectionsState(storageKey),
  );
  const [reloads, setReloads] = useState(0);

  const tree = useMemo(() => buildCollectionTree(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.cuepoint?.getCollections;
    if (!bridge) {
      setStatus("unavailable");
      return;
    }
    setStatus((previous) => (previous === "ready" ? previous : "loading"));
    void bridge()
      .then((payload) => {
        if (cancelled) return;
        setNodes(payload.collections);
        setStatus("ready");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(messageOf(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  // A node someone deleted takes its expansion and its selection with it. The
  // selection falls back silently here, unlike the Rekordbox tree's: a user
  // who just deleted a Collection knows why it is gone.
  useEffect(() => {
    if (status !== "ready") return;
    setState((previous) => {
      const expandedIds = pruneCollectionIds(tree, previous.expandedIds);
      const stillThere =
        previous.selectedId === null || findCollection(tree, previous.selectedId) !== null;
      const selectedId = stillThere ? previous.selectedId : null;
      if (
        selectedId === previous.selectedId &&
        expandedIds.length === previous.expandedIds.length
      ) {
        return previous;
      }
      return { ...previous, expandedIds, selectedId };
    });
  }, [status, tree]);

  useEffect(() => {
    saveCollectionsState(storageKey, state);
  }, [storageKey, state]);

  const selected = useMemo(
    () => findCollection(tree, state.selectedId),
    [tree, state.selectedId],
  );

  const rows = useMemo(
    () => collectionRows(tree, state.expandedIds),
    [tree, state.expandedIds],
  );

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const select = useCallback(
    (node: CollectionNode | null) => {
      setState((previous) => {
        if (!node) return { ...previous, selectedId: null };
        // Selecting something inside a closed folder reveals it, so the
        // selection is never somewhere the user cannot see.
        const reveal = collectionAncestors(tree, node.id);
        return {
          ...previous,
          expandedIds: [...new Set([...previous.expandedIds, ...reveal])],
          selectedId: node.id,
        };
      });
    },
    [tree],
  );

  const expand = useCallback((id: number, expanded: boolean) => {
    setState((previous) => {
      const set = new Set(previous.expandedIds);
      if (expanded) set.add(id);
      else set.delete(id);
      return { ...previous, expandedIds: [...set] };
    });
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((previous) => ({ ...previous, collapsed }));
  }, []);

  /** Run one write, reload the tree, and turn a failure into a message. */
  const write = useCallback(
    async <T>(
      run: (() => Promise<T>) | undefined,
      read: (payload: T) => WriteResult,
    ): Promise<WriteResult> => {
      if (!run) return { ok: false, error: "This build cannot edit Collections." };
      try {
        const payload = await run();
        reload();
        return read(payload);
      } catch (cause) {
        return { ok: false, error: messageOf(cause) };
      }
    },
    [reload],
  );

  const create = useCallback(
    (kind: CreatableKind, name: string, parentId: number | null) => {
      if (kind === "set") {
        // Through the Sets route rather than the Collection one with a kind:
        // it answers a refusal as a value, and it is the route PREP-10's empty
        // state calls too, so there is one way a Set comes into being.
        const sets = window.cuepoint?.sets;
        if (!sets) return Promise.resolve({ ok: false, error: NO_SETS_BRIDGE });
        return answerOf(
          () => sets.create({ name, parent_id: parentId }),
          reload,
          (value) => ({ ok: true, node: value.set }),
        );
      }
      const bridge = window.cuepoint?.createCollection;
      return write(
        bridge ? () => bridge({ kind, name, parent_id: parentId }) : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [reload, write],
  );

  const createSetFrom = useCallback(
    (source: SetSource, name: string | null, parentId: number | null) => {
      const sets = window.cuepoint?.sets;
      if (!sets) return Promise.resolve({ ok: false, error: NO_SETS_BRIDGE });
      return answerOf(
        () => sets.createFrom({ source, name, parent_id: parentId }),
        reload,
        (value) => ({ ok: true, node: value.set, trackCount: value.track_count }),
      );
    },
    [reload],
  );

  const duplicateSet = useCallback(
    (id: number, name?: string | null) => {
      const sets = window.cuepoint?.sets;
      if (!sets) return Promise.resolve({ ok: false, error: NO_SETS_BRIDGE });
      return answerOf(
        () => sets.duplicate({ set_id: id, name: name ?? null }),
        reload,
        (value) => ({ ok: true, node: value.set }),
      );
    },
    [reload],
  );

  const rename = useCallback(
    (id: number, name: string) => {
      const bridge = window.cuepoint?.renameCollection;
      return write(
        bridge ? () => bridge({ id, name }) : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [write],
  );

  const move = useCallback(
    (id: number, parentId: number | null) => {
      const bridge = window.cuepoint?.moveCollection;
      return write(
        bridge ? () => bridge({ id, parent_id: parentId }) : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [write],
  );

  const previewDelete = useCallback(async (id: number) => {
    const bridge = window.cuepoint?.previewCollectionDelete;
    if (!bridge) return null;
    try {
      return (await bridge({ id })).removes;
    } catch {
      // The confirmation asks anyway, without the numbers. Refusing to let a
      // user delete something because the *preview* failed would be a worse
      // answer than a question with less detail in it.
      return null;
    }
  }, []);

  const remove = useCallback(
    (id: number) => {
      const bridge = window.cuepoint?.deleteCollection;
      return write(bridge ? () => bridge({ id }) : undefined, () => ({ ok: true }));
    },
    [write],
  );

  const addTracks = useCallback(
    async (collectionId: number, trackIds: number[]) => {
      const bridge = window.cuepoint?.addTracksToCollection;
      if (!bridge) return { ok: false, error: "This build cannot edit Collections." };
      try {
        const payload = await bridge({
          collection_id: collectionId,
          track_ids: trackIds,
        });
        reload();
        return { ok: true, added: payload.added, skipped: payload.skipped };
      } catch (cause) {
        return { ok: false, error: messageOf(cause) };
      }
    },
    [reload],
  );

  const saveSmart = useCallback(
    (
      name: string,
      rules: FilterRuleSet,
      parentId?: number | null,
      sort?: string,
      dir?: "asc" | "desc",
    ) => {
      const bridge = window.cuepoint?.saveSmartCollection;
      return write(
        bridge
          ? () => bridge({ name, rules, parent_id: parentId ?? null, sort, dir })
          : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [write],
  );

  const duplicateSmart = useCallback(
    (id: number, name?: string | null) => {
      const bridge = window.cuepoint?.duplicateSmartCollection;
      return write(
        bridge ? () => bridge({ id, name: name ?? null }) : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [write],
  );

  const freezeSmart = useCallback(
    (id: number, name?: string | null) => {
      const bridge = window.cuepoint?.freezeSmartCollection;
      return write(
        bridge ? () => bridge({ id, name: name ?? null }) : undefined,
        (payload) => ({
          ok: true,
          node: payload.collection,
          frozen: payload.track_count,
        }),
      );
    },
    [write],
  );

  const updateSmart = useCallback(
    (id: number, rules: FilterRuleSet, sort?: string, dir?: "asc" | "desc") => {
      const bridge = window.cuepoint?.updateSmartCollection;
      return write(
        bridge ? () => bridge({ id, rules, sort, dir }) : undefined,
        (payload) => ({ ok: true, node: payload.collection }),
      );
    },
    [write],
  );

  return {
    tree,
    rows,
    selected,
    status,
    error,
    collapsed: state.collapsed,
    setCollapsed,
    select,
    expand,
    reload,
    create,
    createSetFrom,
    duplicateSet,
    rename,
    move,
    previewDelete,
    remove,
    addTracks,
    saveSmart,
    updateSmart,
    duplicateSmart,
    freezeSmart,
  };
}
