/**
 * CuePoint's own tree, in the Library pane (ORG-09, DEC-059, DEC-062).
 *
 * The first organizational surface in the app that is *the user's* rather than
 * Rekordbox's: a Collection they made, in a folder they made, in an order they
 * arranged. DEC-062 put it here rather than behind a second browser, beside
 * the read-only mirror it is deliberately unlike.
 *
 * Everything it does, it does through :func:`PaneTree` — the same rows, the
 * same arrow keys, the same one tab stop — with the handlers the Rekordbox
 * section does not pass: rename in place, drag to re-file, drop tracks in, and
 * a delete that says what it is about to take before it takes it.
 *
 * **A drop is checked before it is offered.** ORG-04's rules — only a folder
 * may be a parent, nothing may move inside itself, a Smart Collection holds a
 * question rather than rows — are the engine's, and it still refuses anything
 * wrong. The pane asks the same questions first so it never draws a target
 * that can only fail, which is a cursor telling the truth rather than a rule
 * living in two places.
 *
 * **A broken Smart Collection is still a row.** ORG-06 reports a saved filter
 * whose tag or Collection has been deleted; showing the rule that broke is
 * more useful than hiding it, so the row is drawn, marked, and still opens.
 */
import { useCallback, useState } from "react";

import { Modal } from "../../components/Modal";
import { PixelIcon } from "../../components/PixelIcon";
import type { CollectionNode, CollectionSubtree } from "../../api/cuepointBridge.types";
import { PaneTree, type PaneTreeRow } from "./PaneTree";
import {
  canMoveInto,
  describeDeletion,
  findCollection,
  holdsTracks,
  iconForKind,
  type CollectionRow,
  type CollectionTreeNode,
} from "./collectionTree";
import {
  COLLECTION_NODE_MIME,
  draggedNodeId,
  draggedTracks,
  isCuePointDrag,
  isTrackDrag,
  setDraggedNodeId,
  type DraggedTracks,
} from "./collectionDrag";
import "./CollectionsPane.css";

export interface CollectionsPaneProps {
  tree: CollectionTreeNode[];
  rows: CollectionRow[];
  selected: CollectionTreeNode | null;
  status?: "loading" | "ready" | "error" | "unavailable";
  error?: string | null;
  collapsed?: boolean;
  onToggleSection?: (collapsed: boolean) => void;
  onSelect: (node: CollectionNode | null) => void;
  onExpand: (id: number, expanded: boolean) => void;
  onCreate: (
    kind: "folder" | "collection",
    name: string,
    parentId: number | null,
  ) => Promise<{ ok: boolean; error?: string; node?: CollectionNode }>;
  onRename: (id: number, name: string) => Promise<{ ok: boolean; error?: string }>;
  onMove: (id: number, parentId: number | null) => Promise<{ ok: boolean; error?: string }>;
  onPreviewDelete: (id: number) => Promise<CollectionSubtree | null>;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Tracks dropped on a Collection (ORG-09's target, ORG-11's source).
   *
   * Either the ids, or "everything the current query matches" — which is what
   * a 47,913-track selection is, and is never a list of ids (DEC-045). The
   * page resolves the second, because the query is the page's.
   */
  onDropTracks: (
    collectionId: number,
    tracks: DraggedTracks,
  ) => Promise<{
    ok: boolean;
    error?: string;
    added?: number;
    skipped?: number;
    /** The page already said what happened — do not say it twice. */
    silent?: boolean;
  }>;
  /** Said out loud: a toast, a status line — the page decides. */
  onNotify?: (message: string, tone: "info" | "warning") => void;
}

/** A new node's name before the user has typed one. */
const UNTITLED = { folder: "New folder", collection: "New Collection" } as const;

export function CollectionsPane({
  tree,
  rows,
  selected,
  status = "ready",
  error = null,
  collapsed = false,
  onToggleSection,
  onSelect,
  onExpand,
  onCreate,
  onRename,
  onMove,
  onPreviewDelete,
  onDelete,
  onDropTracks,
  onNotify,
}: CollectionsPaneProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [pending, setPending] = useState<{
    node: CollectionTreeNode;
    summary: CollectionSubtree | null;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const say = useCallback(
    (message: string, tone: "info" | "warning") => {
      setNote(message);
      onNotify?.(message, tone);
    },
    [onNotify],
  );

  const nodeFor = (key: string) => findCollection(tree, Number(key));

  const create = async (kind: "folder" | "collection") => {
    // Made inside the selected folder when one is selected, which is what a
    // user pressing "new" while looking at a folder means.
    const parentId = selected?.kind === "folder" ? selected.id : null;
    const result = await onCreate(kind, UNTITLED[kind], parentId);
    if (!result.ok) {
      say(result.error ?? "Could not create that.", "warning");
      return;
    }
    // Straight into the rename field: a row called "New Collection" that the
    // user has to find and rename is a worse gesture than one already waiting
    // for its name.
    if (result.node) setRenamingId(result.node.id);
  };

  const commitRename = async (id: number, name: string) => {
    setRenamingId(null);
    const result = await onRename(id, name);
    if (!result.ok) say(result.error ?? "Could not rename that.", "warning");
  };

  const askToDelete = async (node: CollectionTreeNode) => {
    setPending({ node, summary: await onPreviewDelete(node.id) });
  };

  const confirmDelete = async () => {
    if (!pending) return;
    setDeleting(true);
    const result = await onDelete(pending.node.id);
    setDeleting(false);
    setPending(null);
    if (!result.ok) say(result.error ?? "Could not delete that.", "warning");
    else say(`Deleted ${pending.node.name}.`, "info");
  };

  /**
   * What a drop on this row would do, or null when it would do nothing.
   *
   * Decided from the drag's *types*, because that is all a browser exposes
   * while a drag is in flight — `getData` answers only on the drop itself.
   * Which node is moving is therefore remembered from the drag start rather
   * than read, and the ids of dragged tracks are read on the drop.
   */
  const dropKind = (
    target: CollectionTreeNode | null,
    transfer: DataTransfer | null,
  ): "tracks" | "move" | null => {
    if (!transfer) return null;
    const types = Array.from(transfer.types ?? []);

    if (isTrackDrag(transfer)) {
      // Tracks go into a Collection. Not a folder, which holds nodes, and not
      // a Smart Collection, which holds a question (DEC-061).
      return target && holdsTracks(target) ? "tracks" : null;
    }

    if (types.includes(COLLECTION_NODE_MIME)) {
      const movingId = draggedNodeId(transfer) ?? dragging;
      const moving = movingId == null ? null : findCollection(tree, movingId);
      return moving && canMoveInto(moving, target) ? "move" : null;
    }

    return null;
  };

  const onDragOver = (key: string | null, event: React.DragEvent<HTMLElement>) => {
    const target = key === null ? null : nodeFor(key);
    if (!dropKind(target, event.dataTransfer)) {
      if (isCuePointDrag(event.dataTransfer)) {
        // Refused, and said so with the cursor rather than by doing nothing.
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
        setDropTarget(null);
      }
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target ? target.id : -1);
  };

  const onDrop = async (key: string | null, event: React.DragEvent<HTMLElement>) => {
    const target = key === null ? null : nodeFor(key);
    const kind = dropKind(target, event.dataTransfer);
    setDropTarget(null);
    if (!kind) return;
    event.preventDefault();

    if (kind === "tracks" && target) {
      const carried = draggedTracks(event.dataTransfer);
      if (!carried) return;
      const result = await onDropTracks(target.id, carried);
      if (!result.ok) {
        say(result.error ?? "Could not add those tracks.", "warning");
        return;
      }
      // A selection that is a query goes through the batch path, which
      // confirms, follows a job and reports its own counts. Announcing "added
      // 0 tracks" beside that would be the pane inventing an outcome.
      if (result.silent) return;
      const added = result.added ?? 0;
      const skipped = result.skipped ?? 0;
      const tracks = `${added} ${added === 1 ? "track" : "tracks"}`;
      say(
        skipped
          ? `Added ${tracks} to ${target.name} — ${skipped} already there.`
          : `Added ${tracks} to ${target.name}.`,
        "info",
      );
      return;
    }

    const movingId = draggedNodeId(event.dataTransfer) ?? dragging;
    if (movingId == null) return;
    const result = await onMove(movingId, target ? target.id : null);
    if (!result.ok) say(result.error ?? "Could not move that.", "warning");
  };

  const treeRows: PaneTreeRow[] = rows.map((row) => ({
    key: String(row.node.id),
    name: row.node.name,
    title: row.node.broken ? (row.node.problem ?? row.node.name) : row.node.name,
    icon: iconForKind(row.node.kind),
    depth: row.depth,
    expanded: row.expanded,
    hasChildren: row.hasChildren,
    kind: row.node.kind,
    draggable: renamingId !== row.node.id,
    count: row.node.kind === "collection" ? row.node.entry_count : null,
    badge: row.node.broken ? (
      <span
        className="cp-collections__broken"
        role="img"
        aria-label={`Broken: ${row.node.problem ?? "its rules cannot be run"}`}
        title={row.node.problem ?? "Its rules cannot be run"}
      >
        !
      </span>
    ) : null,
  }));

  return (
    <nav className="cp-playlist-pane cp-collections" aria-label="Collections">
      <div className="cp-playlist-pane__head">
        <button
          type="button"
          className="cp-collections__fold"
          aria-expanded={!collapsed}
          onClick={() => onToggleSection?.(!collapsed)}
        >
          <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
          <span className="cp-playlist-pane__title">Collections</span>
        </button>
        <span className="cp-collections__actions">
          <button
            type="button"
            className="cp-collections__action"
            aria-label="New Collection"
            title="New Collection"
            onClick={() => void create("collection")}
          >
            <PixelIcon name="collections" />
            <span aria-hidden>+</span>
          </button>
          <button
            type="button"
            className="cp-collections__action"
            aria-label="New folder"
            title="New folder"
            onClick={() => void create("folder")}
          >
            <PixelIcon name="folder" />
            <span aria-hidden>+</span>
          </button>
        </span>
      </div>

      {!collapsed && status === "error" && (
        <p className="cp-playlist-pane__note cp-playlist-pane__note--error" role="alert">
          {error ?? "Could not read your Collections"}
        </p>
      )}

      {!collapsed && note && (
        <p className="cp-playlist-pane__note" role="status">
          {note}
        </p>
      )}

      {!collapsed && (
        <PaneTree
          label="Collections"
          rows={treeRows}
          selectedKey={selected ? String(selected.id) : null}
          onSelect={(key) => onSelect(nodeFor(key))}
          onExpand={(key, expanded) => onExpand(Number(key), expanded)}
          renamingKey={renamingId === null ? null : String(renamingId)}
          onRenameCommit={(key, name) => void commitRename(Number(key), name)}
          onRenameCancel={() => setRenamingId(null)}
          dropTargetKey={dropTarget === null || dropTarget === -1 ? null : String(dropTarget)}
          onDragStart={(key, event) => {
            const id = Number(key);
            setDragging(id);
            setDraggedNodeId(event.dataTransfer, id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropTarget(null);
          }}
          onDragOver={onDragOver}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(key, event) => void onDrop(key, event)}
          onRowKeyDown={(key, event) => {
            const node = nodeFor(key);
            if (!node) return;
            if (event.key === "F2") {
              event.preventDefault();
              setRenamingId(node.id);
            } else if (event.key === "Delete") {
              event.preventDefault();
              void askToDelete(node);
            }
          }}
          actions={(row) => (
            <span className="cp-collections__row-actions">
              <button
                type="button"
                className="cp-collections__action"
                aria-label={`Rename ${row.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setRenamingId(Number(row.key));
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="cp-collections__action"
                aria-label={`Delete ${row.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const node = nodeFor(row.key);
                  if (node) void askToDelete(node);
                }}
              >
                ✕
              </button>
            </span>
          )}
        >
          {status === "ready" && rows.length === 0 && (
            <div className="cp-collections__empty">
              <p>
                A Collection is your own list of tracks — a set you are building, a
                shortlist, anything Rekordbox has no folder for. It lives in CuePoint
                and nothing outside it can change it.
              </p>
              <button type="button" onClick={() => void create("collection")}>
                Create your first Collection
              </button>
            </div>
          )}
        </PaneTree>
      )}

      {/* The whole section is a drop target for "move to the top level", so a
          node nested three deep can be pulled back out without a folder to
          aim at. */}
      {!collapsed && (
        <div
          className={`cp-collections__root-drop${dropTarget === -1 ? " cp-collections__root-drop--over" : ""}`}
          onDragOver={(event) => onDragOver(null, event)}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => void onDrop(null, event)}
          aria-hidden
        />
      )}

      <Modal
        open={pending !== null}
        title={`Delete ${pending?.node.name ?? ""}?`}
        onClose={() => setPending(null)}
        primaryAction={{
          label: "Delete",
          onClick: () => void confirmDelete(),
          loading: deleting,
        }}
        secondaryAction={{ label: "Keep it", onClick: () => setPending(null) }}
      >
        <p>
          {pending?.summary
            ? describeDeletion(pending.summary)
            : "This removes it and everything filed inside it. No tracks are deleted."}
        </p>
      </Modal>
    </nav>
  );
}
