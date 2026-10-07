/**
 * The wantlist (DISCOVER-10, DEC-093).
 *
 * Beatport tracks a person wants and does not have yet: the same table as a
 * run's, with a note, the date each was added, and a bought mark. Bought is
 * the person's word and owned is the library's (DEC-092): a track marked bought
 * reads as owned once the file is imported and matched, and the two filters
 * are independent, so "bought, not in the library yet" is one choice of each.
 */
import { useCallback, useMemo, useState } from "react";

import type {
  DiscoverAnswer,
  DiscoverOwnedFilter,
  DiscoverSortDirection,
  WantlistChange,
  WantlistPage,
  WantlistRow,
  WantlistSort,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import type { TrackTableSort } from "../../components/table";
import { formatCount, pluralize } from "../library/libraryFormat";
import { BeatportTable } from "./BeatportTable";
import { NoteDialog } from "./NoteDialog";
import { PushDialog } from "./PushDialog";
import { wantlistActions, type BeatportActionId } from "./beatportActions";
import { WANTLIST_COLUMNS, WANTLIST_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { beatportUsable, unusableReason } from "./beatportState";
import { refusalText, trackName } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";

interface WantlistViewProps {
  tools: DiscoverTools;
}

const WANTLIST_SORTS: readonly WantlistSort[] = ["added_at", "release_date", "artist", "title"];

const OWNED_CHOICES = [
  { value: "all", label: "Owned or not" },
  { value: "hide", label: "Not owned" },
  { value: "only", label: "Owned only" },
];

const BOUGHT_CHOICES = [
  { value: "all", label: "Bought or not" },
  { value: "hide", label: "Not bought" },
  { value: "only", label: "Bought only" },
];

const idOf = (row: WantlistRow) => row.beatport_track_id;

function isFilter(value: string): value is DiscoverOwnedFilter {
  return value === "all" || value === "hide" || value === "only";
}

export function WantlistView({ tools }: WantlistViewProps) {
  const [owned, setOwned] = useState<DiscoverOwnedFilter>("all");
  const [bought, setBought] = useState<DiscoverOwnedFilter>("all");
  const [order, setOrder] = useState<{ sort: WantlistSort; dir: DiscoverSortDirection }>({
    sort: "added_at",
    dir: "desc",
  });
  const [pushOpen, setPushOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<WantlistRow | null>(null);
  const [working, setWorking] = useState(false);
  const { notify } = tools;

  const windowKey = `${owned}|${bought}|${order.sort}|${order.dir}`;
  const fetchPage = useCallback(
    (offset: number, limit: number) => {
      const bridge = window.cuepoint?.getWantlist;
      if (!bridge) return Promise.reject(new Error(NO_ENGINE));
      return bridge({ owned, bought, sort: order.sort, dir: order.dir, offset, limit });
    },
    [bought, order.dir, order.sort, owned],
  );
  const answersWindow = useCallback(
    (page: WantlistPage) =>
      page.window.owned === owned &&
      page.window.bought === bought &&
      page.window.sort === order.sort &&
      page.window.dir === order.dir,
    [bought, order.dir, order.sort, owned],
  );
  const list = useBeatportWindow<WantlistRow, WantlistPage>({
    key: windowKey,
    fetch: fetchPage,
    answers: answersWindow,
  });
  const { reload } = list;

  const selection = useBeatportSelection<WantlistRow>({
    key: windowKey,
    idOf,
    getRow: list.source.getRow,
    loadedRows: list.loadedRows,
  });

  const actions = useMemo(
    () =>
      wantlistActions(selection.rows, {
        pushable: beatportUsable(tools.beatportState),
        pushReason: unusableReason(tools.beatportState),
        total: list.total,
      }),
    [list.total, selection.rows, tools.beatportState],
  );

  /** Run one wantlist change, say what it did, and read the list again. */
  const change = async (
    call: () => Promise<DiscoverAnswer<WantlistChange>>,
    clearAfter: boolean,
  ) => {
    setWorking(true);
    try {
      const answer = await call();
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else notify(answer.value.message, "success");
      // A change that can take rows out of this view leaves nothing sensible
      // selected: the rows it acted on may be gone.
      if (clearAfter) selection.clear();
      reload();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
    } finally {
      setWorking(false);
    }
  };

  const ids = () => selection.rows.map(idOf);

  const onAction = (id: BeatportActionId) => {
    const bridge = window.cuepoint;
    switch (id) {
      case "push":
        setPushOpen(true);
        return;
      case "open":
        void openOnBeatport(selection.rows.map((row) => row.url)).then((problem) => {
          if (problem) notify(problem, "warning");
        });
        return;
      case "note":
        setNoteFor(selection.rows[0] ?? null);
        return;
      case "bought":
      case "unbought":
        if (!bridge?.setWantlistBought) return notify(NO_ENGINE, "warning");
        void change(
          () => bridge.setWantlistBought!({ track_ids: ids(), bought: id === "bought" }),
          bought !== "all",
        );
        return;
      case "remove":
        if (!bridge?.removeFromWantlist) return notify(NO_ENGINE, "warning");
        void change(() => bridge.removeFromWantlist!({ track_ids: ids() }), true);
        return;
      case "add_to_wantlist":
        return;
    }
  };

  /**
   * Every id the list shows, in its order, for a push of the whole view.
   *
   * Read from the engine a window at a time rather than from the rows loaded,
   * so a push holds every track the table would show, not only those scrolled
   * past. Bounded by the engine's playlist limit: past it, the engine refuses
   * the push and says so.
   */
  const everyId = async (): Promise<number[]> => {
    const bridge = window.cuepoint?.getWantlist;
    if (!bridge) throw new Error(NO_ENGINE);
    const { max_run_window: limit, max_playlist_tracks: most } = tools.options.limits;
    const found: number[] = [];
    for (let offset = 0; offset <= most; offset += limit) {
      const answer = await bridge({ owned, bought, sort: order.sort, dir: order.dir, offset, limit });
      if (answer.refusal) throw new Error(refusalText(answer.refusal));
      found.push(...answer.value.rows.map(idOf));
      if (offset + limit >= answer.value.total) break;
    }
    return found;
  };

  const push = async (name: string, includeOwned: boolean) => {
    const trackIds = selection.count > 0 ? ids() : await everyId();
    const refused = await tools.push({ name, include_owned: includeOwned, track_ids: trackIds });
    if (!refused) setPushOpen(false);
    return refused;
  };

  const saveNote = async (note: string | null) => {
    const bridge = window.cuepoint?.setWantlistNote;
    if (!bridge || !noteFor) return null;
    const answer = await bridge({ track_id: noteFor.beatport_track_id, note });
    if (answer.refusal) return answer.refusal;
    notify(answer.value.message, "success");
    setNoteFor(null);
    reload();
    return null;
  };

  const page = list.page;
  const sort: TrackTableSort = { key: order.sort, direction: order.dir };
  const filtered = owned !== "all" || bought !== "all";

  const emptyState = (
    <div className="discover-empty">
      {list.status === "error" ? (
        <>
          <p className="discover-empty__headline">The wantlist could not be read.</p>
          <p className="discover-note">{list.error}</p>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </>
      ) : list.loading ? (
        <p className="discover-note">Reading your wantlist…</p>
      ) : (page?.entries ?? 0) === 0 ? (
        <>
          <p className="discover-empty__headline">Your wantlist is empty.</p>
          <p className="discover-note">
            Select tracks in a run and choose Add to wantlist to keep them here.
          </p>
        </>
      ) : (
        <>
          <p className="discover-empty__headline">No wanted track matches these filters.</p>
          {filtered && (
            <Button
              variant="secondary"
              onClick={() => {
                setOwned("all");
                setBought("all");
              }}
            >
              Show every wanted track
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <section className="discover-wantlist" aria-label="Wantlist">
      <div className="discover-toolbar" role="toolbar" aria-label="Wantlist filters">
        <Select
          label="Owned"
          id="discover-wantlist-owned"
          options={OWNED_CHOICES}
          value={owned}
          onChange={(event) => isFilter(event.target.value) && setOwned(event.target.value)}
        />
        <Select
          label="Bought"
          id="discover-wantlist-bought"
          options={BOUGHT_CHOICES}
          value={bought}
          onChange={(event) => isFilter(event.target.value) && setBought(event.target.value)}
        />
        {page && (
          <span className="discover-note" role="status">
            {pluralize(page.entries, "wanted track")}, {formatCount(page.bought)} bought,{" "}
            {formatCount(page.owned)} owned
          </span>
        )}
      </div>

      <BeatportTable<WantlistRow>
        columns={WANTLIST_COLUMNS}
        layoutKey={WANTLIST_TABLE_LAYOUT_KEY}
        source={list.source}
        selection={selection}
        idOf={idOf}
        sort={sort}
        onSortChange={(next) => {
          const key = WANTLIST_SORTS.find((candidate) => candidate === next.key);
          if (key) setOrder({ sort: key, dir: next.direction });
        }}
        actions={actions}
        onAction={onAction}
        label="Wantlist"
        summary={pluralize(list.total, "track")}
        emptyState={emptyState}
        resetKey={windowKey}
        busy={working}
      />

      <PushDialog
        open={pushOpen}
        what={
          selection.count > 0
            ? `the ${pluralize(selection.count, "selected track")}`
            : `the ${pluralize(list.total, "track")} this list shows`
        }
        defaultName={tools.options.defaults.playlist_name}
        maxNameLength={tools.options.limits.max_playlist_name_length}
        onPush={push}
        onClose={() => setPushOpen(false)}
      />

      <NoteDialog
        open={noteFor !== null}
        track={noteFor ? trackName(noteFor) : ""}
        note={noteFor?.note ?? null}
        maxLength={tools.options.limits.max_note_length}
        onSave={saveNote}
        onClose={() => setNoteFor(null)}
      />
    </section>
  );
}
