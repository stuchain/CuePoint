/**
 * The playlist pane's state (LIBUI-07, DEC-044).
 *
 * Fetches the mirrored tree once, remembers what is expanded and what is
 * selected, and hands the page a scope. Selection is by node; what the page
 * does with it — scoping the table, choosing the opening sort — is the page's.
 *
 * The tree is fetched once per mount rather than watched: it changes only when
 * an import or a refresh replaces it, and `reload` is what those call.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import {
  EMPTY_PANE_STATE,
  PLAYLIST_PANE_STORAGE_KEY,
  ancestorPaths,
  buildTree,
  loadPaneState,
  pruneExpanded,
  resolveSelection,
  savePaneState,
  visibleRows,
  type PaneState,
  type PlaylistTreeNode,
  type VisibleRow,
} from "./playlistTree";

export type PlaylistTreeStatus = "loading" | "ready" | "error" | "unavailable";

export interface PlaylistTreeController {
  /** The roots, each with its children. */
  tree: PlaylistTreeNode[];
  /** The rows to draw, given what is expanded. */
  rows: VisibleRow[];
  /** The selected node, or null for "All tracks". */
  selected: PlaylistTreeNode | null;
  status: PlaylistTreeStatus;
  error: string | null;
  /**
   * True when a remembered selection no longer exists — a playlist a refresh
   * removed. Cleared by the next selection.
   */
  selectionFellBack: boolean;
  select: (node: PlaylistTreeNode | null) => void;
  toggle: (path: string) => void;
  expand: (path: string, expanded: boolean) => void;
  isExpanded: (path: string) => boolean;
  reload: () => void;
}

export function usePlaylistTree(
  storageKey: string = PLAYLIST_PANE_STORAGE_KEY,
): PlaylistTreeController {
  const [nodes, setNodes] = useState<LibraryPlaylistNode[]>([]);
  const [status, setStatus] = useState<PlaylistTreeStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PaneState>(() => loadPaneState(storageKey));
  const [selectionFellBack, setSelectionFellBack] = useState(false);
  const [reloads, setReloads] = useState(0);

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.cuepoint?.getLibraryPlaylists;
    if (!bridge) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    void bridge()
      .then((payload) => {
        if (cancelled) return;
        setNodes(payload.playlists);
        setStatus("ready");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  // What was remembered, checked against the collection as it is now. A
  // playlist a refresh removed falls back to All tracks and says so.
  useEffect(() => {
    if (status !== "ready") return;
    setState((previous) => {
      const resolved = resolveSelection(tree, previous.selectedPath);
      const expandedPaths = pruneExpanded(tree, previous.expandedPaths);
      if (resolved.fellBack) setSelectionFellBack(true);
      const selectedPath = resolved.fellBack ? null : previous.selectedPath;
      if (
        selectedPath === previous.selectedPath &&
        expandedPaths.length === previous.expandedPaths.length
      ) {
        return previous;
      }
      return { expandedPaths, selectedPath };
    });
  }, [status, tree]);

  useEffect(() => {
    savePaneState(storageKey, state);
  }, [storageKey, state]);

  const selected = useMemo(
    () => resolveSelection(tree, state.selectedPath).node,
    [tree, state.selectedPath],
  );

  const rows = useMemo(
    () => visibleRows(tree, state.expandedPaths),
    [tree, state.expandedPaths],
  );

  const select = useCallback(
    (node: PlaylistTreeNode | null) => {
      setSelectionFellBack(false);
      setState((previous) => {
        if (!node) return { ...previous, selectedPath: null };
        // Selecting something inside a collapsed folder reveals it, so the
        // selection is never somewhere the user cannot see.
        const reveal = ancestorPaths(tree, node.path);
        const expandedPaths = [...new Set([...previous.expandedPaths, ...reveal])];
        return { expandedPaths, selectedPath: node.path };
      });
    },
    [tree],
  );

  const expand = useCallback((path: string, expanded: boolean) => {
    setState((previous) => {
      const set = new Set(previous.expandedPaths);
      if (expanded) set.add(path);
      else set.delete(path);
      return { ...previous, expandedPaths: [...set] };
    });
  }, []);

  const toggle = useCallback(
    (path: string) => {
      setState((previous) => {
        const set = new Set(previous.expandedPaths);
        if (set.has(path)) set.delete(path);
        else set.add(path);
        return { ...previous, expandedPaths: [...set] };
      });
    },
    [],
  );

  const isExpanded = useCallback(
    (path: string) => state.expandedPaths.includes(path),
    [state.expandedPaths],
  );

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return {
    tree,
    rows,
    selected,
    status,
    error,
    selectionFellBack,
    select,
    toggle,
    expand,
    isExpanded,
    reload,
  };
}

export { EMPTY_PANE_STATE };
