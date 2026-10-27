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
 *
 * **A row carries no controls of its own** (K14). Rename, Delete, Duplicate
 * and Freeze were icons that appeared on hover, which a keyboard or a touch
 * screen never sees; each is on the bar under the tree while the row is
 * selected (DEC-245), on the row's context menu (EXPORT-07) with "Export to
 * Rekordbox…" (DEC-087), and Rename and Delete on F2 and Delete as well.
 * Making something is one "+ New" menu over the tree rather than three buttons.
 *
 * **A Set is a node here too** (DEC-102, DEC-104). It is made beside a
 * Collection, filed in folders, takes dropped tracks and scopes the table —
 * everything a node that holds tracks does. What it is not is a crate: it
 * wears Prepare's flag, and its menu is a Set's — "Open in Prepare",
 * "Duplicate", the set list — while a Collection, a Smart Collection and a
 * Rekordbox playlist gain "New Set from…". Each of those is offered only when
 * the page passes its handler, so a build without them draws none.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Hint } from "../../components/Hint";
import {
  CANCEL,
  NO_COLLECTIONS,
  couldNot,
  freezeTitle,
  deleteLabel,
  deleteLead,
  deleteTitle,
} from "../../format/words";
import { countNoun } from "../../format/counts";
import { Modal } from "../../components/Modal";
import { PixelIcon } from "../../components/PixelIcon";
import {
  TrackContextMenu,
  useMenuButton,
  type TrackContextMenuItem,
} from "../../components/TrackContextMenu";
import type { CollectionNode, CollectionSubtree } from "../../api/cuepointBridge.types";
import { PaneTree, type PaneTreeRow } from "./PaneTree";
import {
  canMoveInto,
  describeDeletion,
  findCollection,
  holdsTracks,
  iconForKind,
  isSet,
  type CollectionRow,
  type CollectionTreeNode,
} from "./collectionTree";
import type { CreatableKind } from "./useCollectionTree";
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

interface CollectionsPaneProps {
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
    kind: CreatableKind,
    name: string,
    parentId: number | null,
  ) => Promise<{ ok: boolean; error?: string; node?: CollectionNode }>;
  onRename: (id: number, name: string) => Promise<{ ok: boolean; error?: string }>;
  onMove: (id: number, parentId: number | null) => Promise<{ ok: boolean; error?: string }>;
  onPreviewDelete: (id: number) => Promise<CollectionSubtree | null>;
  onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /**
   * A second saved question, starting out identical (DEC-061, ORG-13).
   *
   * Offered on a Smart Collection row and nowhere else: duplicating a folder
   * or a plain Collection is a different question with a different answer, and
   * the engine refuses both.
   */
  onDuplicateSmart?: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** Store what a Smart Collection matches right now, as a Collection. */
  onFreezeSmart?: (
    id: number,
  ) => Promise<{ ok: boolean; error?: string; frozen?: number }>;
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
  /**
   * Export this node to Rekordbox (EXPORT-07, DEC-087): opens the export with
   * it ticked. Offered on every kind — a folder stands for everything filed
   * under it, as the export reads it — and absent when the page cannot export.
   */
  onExport?: (node: CollectionNode) => void;
  /**
   * A Set's "Open in Prepare" (DEC-104). Absent until the page it opens is
   * enabled (PREP-10), so the menu never offers a destination that is not
   * there.
   */
  onOpenInPrepare?: (node: CollectionNode) => void;
  /** A Set's "Duplicate": chapters, times, notes and all (PREP-02). */
  onDuplicateSet?: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** A Set's "Save set list…" and "Copy set list" (DEC-110). */
  onSaveSetList?: (node: CollectionNode) => void;
  onCopySetList?: (node: CollectionNode) => void;
  /** "New Set from…" a Collection or a Smart Collection (DEC-104). */
  onNewSetFrom?: (node: CollectionNode) => void;
  /**
   * Whether "New Set" is offered (PREP-09): true when the shell can make one.
   * A shell without the Sets bridge still draws the Sets the engine sends, and
   * offers nothing it cannot do.
   */
  canMakeSets?: boolean;
}

/** A new node's name before the user has typed one. */
/** What a node is called in a delete dialog's title and button: "Set", "folder", "Collection". */
function kindWord(node: CollectionTreeNode): string {
  if (isSet(node)) return "Set";
  if (node.kind === "folder") return "folder";
  if (node.kind === "smart") return "Smart Collection";
  return "Collection";
}

/**
 * The selected row's own menu: a "more" (three dots) button at the right end of the row, opening the same list
 * the right-click menu shows (Rename, Duplicate, Delete, Export to Rekordbox…). It replaced the
 * bar at the foot of the pane, which was a screen away from the row it acted on (C15, C227).
 */
function RowMenu({ name, items }: { name: string; items: TrackContextMenuItem[] }) {
  const menu = useMenuButton();
  const box = menu.open ? menu.anchor.current?.getBoundingClientRect() : undefined;
  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        className="cp-collections__row-menu"
        iconOnly
        icon="more"
        aria-label={`Actions for ${name}`}
        {...menu.buttonProps}
      />
      {menu.open && box && (
        <TrackContextMenu
          x={box.left}
          y={box.bottom}
          items={items}
          anchor={menu.anchor}
          onClose={menu.close}
          label={`Actions for ${name}`}
        />
      )}
    </>
  );
}

const UNTITLED: Record<CreatableKind, string> = {
  folder: "New folder",
  collection: "New Collection",
  set: "New Set",
};

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
  onDuplicateSmart,
  onFreezeSmart,
  onDropTracks,
  onNotify,
  onExport,
  onOpenInPrepare,
  onDuplicateSet,
  onSaveSetList,
  onCopySetList,
  onNewSetFrom,
  canMakeSets = false,
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
  /** The Smart Collection a freeze is being confirmed for (DEC-061). */
  const [freezing, setFreezing] = useState<CollectionTreeNode | null>(null);
  const [frozenBusy, setFrozenBusy] = useState(false);
  /** The row a context menu is open on, and where. */
  const [menu, setMenu] = useState<{ node: CollectionTreeNode; x: number; y: number } | null>(
    null,
  );
  /** Where the "+ New" menu hangs, under its button (K14). */
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const say = useCallback(
    (message: string, tone: "info" | "warning") => {
      setNote(message);
      onNotify?.(message, tone);
    },
    [onNotify],
  );

  // The id of a node just deleted from here. The confirm dialog's return target (the bar's Delete
  // button) goes with the selection, so focus would fall to <body>; once the node is deselected
  // it moves to the tree instead.
  const [deletedId, setDeletedId] = useState<number | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (deletedId === null || selected?.id === deletedId) return;
    setDeletedId(null);
    const root = rootRef.current;
    const target =
      root?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]') ??
      root?.querySelector<HTMLElement>(".cp-playlist-pane__fold");
    target?.focus();
  }, [deletedId, selected]);

  const nodeFor = (key: string) => findCollection(tree, Number(key));

  // A folder is opened and closed, never selected (C197), so its Rename and Delete need another
  // home: the "•••" follows the folder last clicked or focused, while the selected look stays on
  // the Collection the table shows. It lapses when the selection changes.
  const [activeFolder, setActiveFolder] = useState<{ id: number; selectedId: number | null } | null>(
    null,
  );
  const activeNode =
    activeFolder && activeFolder.selectedId === (selected?.id ?? null)
      ? findCollection(tree, activeFolder.id)
      : null;
  const menuNode = activeNode ?? selected;
  const noteRow = (key: string) => {
    const node = nodeFor(key);
    setActiveFolder(
      node?.kind === "folder" ? { id: node.id, selectedId: selected?.id ?? null } : null,
    );
  };

  const create = async (kind: CreatableKind) => {
    // Made inside the folder in view when one is, which is what a user pressing "new" while
    // looking at a folder means.
    const parentId = menuNode?.kind === "folder" ? menuNode.id : null;
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
    else {
      say(`Deleted ${pending.node.name}.`, "info");
      setDeletedId(pending.node.id);
    }
  };

  const duplicate = async (node: CollectionTreeNode) => {
    // A Set's copy is its plan too; a Smart Collection's is its question.
    const run = isSet(node) ? onDuplicateSet : onDuplicateSmart;
    if (!run) return;
    const result = await run(node.id);
    if (!result.ok) say(result.error ?? "Could not duplicate that.", "warning");
    else say(`Duplicated ${node.name}. The two are separate from now on.`, "info");
  };

  const confirmFreeze = async () => {
    if (!freezing || !onFreezeSmart) return;
    setFrozenBusy(true);
    const result = await onFreezeSmart(freezing.id);
    setFrozenBusy(false);
    const node = freezing;
    setFreezing(null);
    if (!result.ok) {
      say(result.error ?? "Could not freeze that.", "warning");
      return;
    }
    const count = result.frozen ?? 0;
    say(
      `Froze ${countNoun(count, "track")} from ${node.name}.`,
      "info",
    );
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
      const tracks = countNoun(added, "track");
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
    if (!result.ok) say(result.error ?? couldNot("move", findCollection(tree, movingId)?.name), "warning");
  };

  /** One row's menu: what its buttons do, and what has no button (DEC-087). */
  const menuItems = (node: CollectionTreeNode): TrackContextMenuItem[] => {
    const items: TrackContextMenuItem[] = [];
    if (isSet(node) && onOpenInPrepare) {
      items.push({
        id: "open-in-prepare",
        label: "Open in Prepare",
        onSelect: () => onOpenInPrepare(node),
      });
    }
    if (isSet(node) && onDuplicateSet) {
      items.push({ id: "duplicate", label: "Duplicate", onSelect: () => void duplicate(node) });
    }
    if (node.kind === "smart" && onDuplicateSmart) {
      items.push({ id: "duplicate", label: "Duplicate", onSelect: () => void duplicate(node) });
    }
    if (node.kind === "smart" && onFreezeSmart) {
      items.push({
        id: "freeze",
        label: "Save as a Collection…",
        onSelect: () => setFreezing(node),
      });
    }
    if ((node.kind === "collection" || node.kind === "smart") && onNewSetFrom) {
      items.push({
        id: "new-set-from",
        label: "New Set from…",
        onSelect: () => onNewSetFrom(node),
      });
    }
    items.push(
      { id: "rename", label: "Rename", onSelect: () => setRenamingId(node.id) },
      { id: "delete", label: "Delete…", danger: true, onSelect: () => void askToDelete(node) },
    );
    if (isSet(node) && onSaveSetList) {
      items.push({
        id: "save-set-list",
        label: "Save set list…",
        onSelect: () => onSaveSetList(node),
        separatorBefore: true,
      });
    }
    if (isSet(node) && onCopySetList) {
      items.push({
        id: "copy-set-list",
        label: "Copy set list",
        onSelect: () => onCopySetList(node),
        separatorBefore: !onSaveSetList,
      });
    }
    if (onExport) {
      items.push({
        id: "export",
        label: "Export to Rekordbox…",
        onSelect: () => onExport(node),
        separatorBefore: true,
      });
    }
    return items;
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
    // Entries, repeats counted: a Set's count is how many it plays, which is
    // the number a running order is judged by (DEC-058, DEC-104).
    count: holdsTracks(row.node) ? row.node.entry_count : null,
    // The selected row carries its own actions, where the eye already is (C15, C227).
    trailing:
      menuNode?.id === row.node.id && renamingId !== row.node.id ? (
        <RowMenu name={row.node.name} items={menuItems(row.node)} />
      ) : null,
    badge: row.node.broken ? (
      <Hint text={row.node.problem ?? "Its rules cannot be run"} inline>
        <span
          className="cp-collections__broken"
          role="img"
          aria-label={`Broken: ${row.node.problem ?? "its rules cannot be run"}`}
        >
          !
        </span>
      </Hint>
    ) : null,
  }));

  return (
    <nav
      ref={rootRef}
      className="cp-playlist-pane cp-collections"
      aria-label="Collections"
    >
      <div className="cp-playlist-pane__head">
        <button
          type="button"
          className="cp-playlist-pane__fold"
          aria-expanded={!collapsed}
          onClick={() => onToggleSection?.(!collapsed)}
        >
          <span aria-hidden>{collapsed ? <PixelIcon name="chevron-right" className="cp-pixel-icon--text" /> : <PixelIcon name="chevron-down" className="cp-pixel-icon--text" />}</span>
          <span className="cp-playlist-pane__title">Collections</span>
        </button>

        {/* The three ways to make something, as one menu (FLW-10, K14). Made inside the
            selected folder when one is selected, straight into the new row's name. It sits in
            the heading: one small item on the right. */}
        {!collapsed && (
          <div className="cp-collections__create" role="group" aria-label="Make something new">
            <Button
              variant="secondary"
              size="sm"
              menu
              className="cp-collections__new"
              aria-expanded={newMenu !== null}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setNewMenu({ x: rect.left, y: rect.bottom });
              }}
            >
              +<span className="cp-collections__new-word"> New</span>
            </Button>
          </div>
        )}
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
          onSelect={(key) => {
            const node = nodeFor(key);
            // A folder only opens and closes (C197); the menu moves to it.
            if (node?.kind === "folder") {
              noteRow(key);
              const open = treeRows.find((row) => row.key === key)?.expanded ?? false;
              onExpand(node.id, !open);
              return;
            }
            setActiveFolder(null);
            onSelect(node);
          }}
          onRowFocus={noteRow}
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
          onRowContextMenu={(key, anchor) => {
            const node = nodeFor(key);
            if (node) setMenu({ node, ...anchor });
          }}
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
        >
          {status === "ready" && rows.length === 0 && (
            <EmptyState compact className="cp-collections__empty" headline={NO_COLLECTIONS} />
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

      {newMenu && (
        <TrackContextMenu
          x={newMenu.x}
          y={newMenu.y}
          label="New"
          onClose={() => setNewMenu(null)}
          items={[
            { id: "collection", label: "Collection", onSelect: () => void create("collection") },
            ...(canMakeSets
              ? [{ id: "set", label: "Set", onSelect: () => void create("set") }]
              : []),
            { id: "folder", label: "Folder", onSelect: () => void create("folder") },
          ]}
        />
      )}

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
          label={`Actions for ${menu.node.name}`}
        />
      )}

      <Modal
        open={freezing !== null}
        title={freezeTitle(freezing?.name)}
        closeDisabled={frozenBusy}
        onClose={() => setFreezing(null)}
        size="small"
        primaryAction={{
          label: "Freeze it",
          onClick: () => void confirmFreeze(),
          loading: frozenBusy,
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setFreezing(null) }}
      >
        <p>
          This makes a Collection holding the tracks {freezing?.name} matches
          right now. It is a copy: a track that starts matching tomorrow joins{" "}
          {freezing?.name} and not the frozen one.
        </p>
        <p>{freezing?.name} itself is left exactly as it is.</p>
      </Modal>

      <Modal
        open={pending !== null}
        title={deleteTitle(pending ? kindWord(pending.node) : "Collection", pending?.node.name)}
        variant="danger"
        size="small"
        closeDisabled={deleting}
        onClose={() => setPending(null)}
        primaryAction={{
          label: deleteLabel(pending ? kindWord(pending.node) : "Collection"),
          onClick: () => void confirmDelete(),
          loading: deleting,
        }}
        secondaryAction={{ label: CANCEL, onClick: () => setPending(null) }}
      >
        <p>{deleteLead}</p>
        <p>
          {pending?.summary
            ? describeDeletion(pending.summary)
            : "This removes it and everything filed inside it. No tracks are deleted."}
        </p>
      </Modal>
    </nav>
  );
}
