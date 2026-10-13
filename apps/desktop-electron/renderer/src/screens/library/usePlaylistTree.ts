/**
 * The playlist pane's state (LIBUI-07, DEC-044).
 *
 * Fetches the mirrored tree once, remembers what is expanded and what is
 * selected, and hands the page a scope. Selection is by node; what the page
 * does with it — scoping the table, choosing the opening sort — is the page's.
 *
 * The tree is read through the shared cache (C19d): a page shown again has it at
 * once, and it is read again when the library announces a change or a job
 * ends. `reload` is what an import or a refresh calls to read it now.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { LIBRARY_PLAYLISTS, useReportReadError, useSharedRead } from "../../api/sharedReads";
import {
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
import { userMessage } from "../../api/userMessage";

type PlaylistTreeStatus = "loading" | "ready" | "error" | "unavailable";

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
  const read = useSharedRead(LIBRARY_PLAYLISTS);
  const [state, setState] = useState<PaneState>(() => loadPaneState(storageKey));
  const [selectionFellBack, setSelectionFellBack] = useState(false);

  useReportReadError(read.error);
  const nodes: LibraryPlaylistNode[] = useMemo(() => read.value?.playlists ?? [], [read.value]);
  // A failure behind an old tree keeps the tree.
  const status: PlaylistTreeStatus = read.unavailable
    ? "unavailable"
    : read.value
      ? "ready"
      : read.error !== undefined
        ? "error"
        : "loading";
  const error = !read.value && read.error !== undefined ? userMessage(read.error) : null;

  const tree = useMemo(() => buildTree(nodes), [nodes]);

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

  const reload = read.refresh;

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
