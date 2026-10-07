/**
 * Where tracks come from on the Prepare page (PREP-11, DEC-105).
 *
 * Two tabs, remembered, over one pool picker and one insertion point:
 *
 * - **Suggestions**: what fits the gap after the selected entry, scored
 *   against the entries on either side (DEC-105), each side's reasons in words
 *   and a mark on a track already in the Set. A gap nothing bridges says how
 *   far apart its neighbours are and offers each side's own list; the gate is
 *   never loosened. An empty Set has nothing to fit against, and says so.
 * - **Library**: a search over the one browse query (DEC-023), in the pool.
 *
 * The pool is the whole library, a Rekordbox playlist or folder, a Collection,
 * a Smart Collection or a Set, as Clean's scope is; the page remembers it.
 * Every row inserts at the point, drags into the Set, and plays on a
 * double-click (`SourceTable`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CollectionNode,
  EntityKind,
  LibraryPlaylistNode,
  LibraryTrackRow,
  SetChapterPlan,
  SetRefusal,
  SetSuggestionSideName,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Tabs } from "../../components/Tabs";
import { inMemorySource, useColumnLayout } from "../../components/table";
import { parseScope, scopeOptions } from "../clean/cleanRules";
import { SIMILAR_INDEX_BUILDING } from "../discover/entityFormat";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "../library/libraryQuery";
import { queuedMessage, toQueueItem, useLibraryPlayback } from "../library/useLibraryPlayback";
import { useTrackWindow } from "../library/useTrackWindow";
import {
  emptyAnswerText,
  gapKey,
  insertLabel,
  noFitText,
  pointText,
  pointWords,
  poolName,
  poolOrLibrary,
  rangeNote,
  sideButtonLabel,
  sideOnlyText,
  suggestionsRequest,
  unusedNotes,
  type InsertionPoint,
  type PointWords,
  type PoolValue,
} from "./prepareSource";
import { SourceTable } from "./SourceTable";
import {
  SIDE_COLUMN,
  SOURCE_LIBRARY_COLUMNS,
  SOURCE_LIBRARY_TABLE_LAYOUT_KEY,
  SUGGESTION_COLUMNS,
  SUGGESTION_TABLE_LAYOUT_KEY,
  suggestionRow,
  type SuggestionRow,
} from "./sourceColumns";
import {
  loadSourcePool,
  loadSourceTab,
  saveSourcePool,
  saveSourceTab,
  type SourceTab,
} from "./sourcePanelState";
import { useSetSuggestions } from "./useSetSuggestions";

/** What Suggestions says in an empty Set (DEC-105). */
export const EMPTY_SET_SUGGESTIONS =
  "An empty Set has nothing to fit against. Add its first track from the Library tab, and Suggestions will fit the next one to it.";

/** How long the search box waits for typing to stop. */
const SEARCH_DELAY_MS = 200;

const TABS: { id: SourceTab; label: string }[] = [
  { id: "suggestions", label: "Suggestions" },
  { id: "library", label: "Library" },
];

interface SourcePanelProps {
  setId: number;
  chapters: readonly SetChapterPlan[];
  point: InsertionPoint;
  /** Changes with every re-read of the Set. */
  revision: unknown;
  /** Every node of CuePoint's tree, flat (folders' children included), for the pool picker. */
  collections: readonly CollectionNode[];
  /** Insert these tracks at the point, in this order. */
  onInsert: (tracks: LibraryTrackRow[]) => void;
  /** The Set changed under the view: re-read it. */
  onStale: (refusal: SetRefusal) => void;
  onGone: (refusal: SetRefusal) => void;
  onMessage: (message: string, tone: "info" | "warning") => void;
  onOpenSimilar: (trackId: number) => void;
  onOpenEntity: (kind: EntityKind, ref: string) => void;
}

/** Where an insert goes, in words, the titles set apart. */
function PointLine({ words, title }: { words: PointWords; title?: string }) {
  const where = (chapter: string | null) => (chapter ? `, in ${chapter}` : "");
  return (
    <p className="prepare-source__point" role="status" aria-label={`Insert: ${pointText(words)}`} title={title}>
      {words.kind === "empty" && "At the start of the empty Set"}
      {words.kind === "between" && (
        <>
          Between <em>{words.before}</em> and <em>{words.after}</em>
          {where(words.chapter)}
        </>
      )}
      {words.kind === "end" && (
        <>
          After <em>{words.before}</em>, at the end of the Set{where(words.chapter)}
        </>
      )}
    </p>
  );
}

export function SourcePanel(props: SourcePanelProps) {
  const { collections, chapters, point } = props;
  const [tab, setTab] = useState<SourceTab>(loadSourceTab);
  const [chosenPool, setChosenPool] = useState<PoolValue>(loadSourcePool);
  const [playlists, setPlaylists] = useState<LibraryPlaylistNode[]>([]);

  useEffect(() => {
    const read = window.cuepoint?.getLibraryPlaylists;
    if (!read) return;
    let current = true;
    read()
      .then((tree) => {
        if (current) setPlaylists(tree.playlists);
      })
      .catch(() => {
        // The CuePoint pools and the library are still offered.
      });
    return () => {
      current = false;
    };
  }, []);

  const options = useMemo(() => scopeOptions(playlists, collections), [collections, playlists]);
  // A pool that has gone (or not been read yet) is the library, without
  // forgetting the choice: the playlists arrive a moment after the page.
  const pool = poolOrLibrary(chosenPool, options);
  const poolWords = poolName(pool, options);

  const chooseTab = (next: string) => {
    const value = next === "library" ? "library" : "suggestions";
    setTab(value);
    saveSourceTab(value);
  };
  const choosePool = (next: PoolValue) => {
    setChosenPool(next);
    saveSourcePool(next);
  };

  const words = pointWords(point, chapters);
  // The rows selected in the tab open, for the one button beside the pool:
  // on the pool's own line, so the panel's height stays rows (DEC-112).
  const [picked, setPicked] = useState<LibraryTrackRow[]>([]);
  useEffect(() => setPicked([]), [tab]);

  return (
    <section className="prepare-source" aria-label="Add to the Set">
      <Tabs tabs={TABS} activeId={tab} onChange={chooseTab} />
      <div className="prepare-source__controls">
        <select
          className="prepare-source__select"
          value={pool}
          onChange={(event) => choosePool(event.target.value)}
          aria-label="From"
          title="Where Suggestions and the search look: the library, a playlist, a Collection or a Set"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="prepare-source__insert"
          disabled={picked.length === 0}
          onClick={() => props.onInsert(picked)}
          title={
            picked.length === 0
              ? "Select tracks below to insert them where the Set's selection points"
              : pointText(words)
          }
        >
          {insertLabel(picked.length)}
        </button>
      </div>
      <div
        className="prepare-source__body"
        role="tabpanel"
        aria-label={tab === "suggestions" ? "Suggestions" : "Library"}
      >
        {tab === "suggestions" ? (
          <SuggestionsTab
            {...props}
            pool={pool}
            poolWords={poolWords}
            words={words}
            onPicked={setPicked}
            onOpenLibrary={() => chooseTab("library")}
          />
        ) : (
          <LibraryTab {...props} pool={pool} poolWords={poolWords} words={words} onPicked={setPicked} />
        )}
      </div>
    </section>
  );
}

interface TabProps extends SourcePanelProps {
  pool: PoolValue;
  poolWords: string;
  words: PointWords;
  /** The rows selected in this tab, whenever they change. */
  onPicked: (rows: LibraryTrackRow[]) => void;
}

function useQueueActions(onMessage: SourcePanelProps["onMessage"]) {
  const report = useCallback(
    (result: { ok: boolean; error?: string } | void) => {
      if (result && !result.ok && result.error) onMessage(result.error, "warning");
    },
    [onMessage],
  );
  const play = useCallback(
    async (rows: LibraryTrackRow[], index: number) => {
      const player = window.cuepoint?.player;
      if (!player?.playQueue || rows.length === 0) return;
      report(await player.playQueue(rows.map(toQueueItem), index));
    },
    [report],
  );
  const queue = useCallback(
    async (rows: LibraryTrackRow[], where: "next" | "end") => {
      const player = window.cuepoint?.player;
      const send = where === "next" ? player?.playNext : player?.addToQueue;
      if (!send || rows.length === 0) return;
      await send(rows.map(toQueueItem));
      onMessage(queuedMessage(rows.length, where), "info");
    },
    [onMessage],
  );
  return { play, queue };
}

// ------------------------------------------------------------ Suggestions

function SuggestionsTab({
  setId,
  point,
  pool,
  poolWords,
  words,
  revision,
  onInsert,
  onStale,
  onGone,
  onMessage,
  onOpenSimilar,
  onOpenEntity,
  onPicked,
  onOpenLibrary,
}: TabProps & { onOpenLibrary: () => void }) {
  const gap = gapKey(point);
  // Each side's own list belongs to the gap it was asked for.
  const [side, setSide] = useState<{ gap: string; against: SetSuggestionSideName } | null>(null);
  const against = side && side.gap === gap ? side.against : null;

  const request = useMemo(
    () => suggestionsRequest(setId, point, pool, against),
    [against, point, pool, setId],
  );
  const suggestions = useSetSuggestions({ request, revision, onStale, onGone });
  const { answer } = suggestions;

  const rows = useMemo(
    () =>
      (answer?.suggestions ?? [])
        .map(suggestionRow)
        .filter((row): row is SuggestionRow => row !== null),
    [answer],
  );
  const source = useMemo(() => inMemorySource(rows), [rows]);
  const loadedRows = useCallback(() => rows.map((row, index) => ({ row, index })), [rows]);
  const layout = useColumnLayout<SuggestionRow>(SUGGESTION_TABLE_LAYOUT_KEY, SUGGESTION_COLUMNS);
  // A list fitted to one side has no reasons for the other.
  const columns = useMemo(() => {
    const sides = answer?.sides ?? ["before", "after"];
    return layout.visible.filter(
      (column) =>
        (column.id !== SIDE_COLUMN.before || sides.includes("before")) &&
        (column.id !== SIDE_COLUMN.after || sides.includes("after")),
    );
  }, [answer, layout.visible]);
  const { play, queue } = useQueueActions(onMessage);

  if (!point.before) {
    return (
      <div className="prepare-source__empty">
        <p className="prepare-note">{EMPTY_SET_SUGGESTIONS}</p>
        <Button variant="secondary" onClick={onOpenLibrary}>
          Open the Library tab
        </Button>
      </div>
    );
  }

  const beforeTitle = point.before.track.title;
  const afterTitle = point.after?.track.title ?? "";
  const unused = answer
    ? unusedNotes(answer, { before: beforeTitle, after: afterTitle })
    : { notes: [], detail: [] };
  const range = answer ? rangeNote(answer, point.chapter) : null;

  let empty: React.ReactNode;
  if (suggestions.problem) {
    empty = (
      <div className="prepare-source__empty">
        <p className="prepare-note">{suggestions.problem}</p>
        <Button variant="secondary" onClick={suggestions.retry}>
          Try again
        </Button>
      </div>
    );
  } else if (!answer) {
    empty = <p className="prepare-note">Finding what fits…</p>;
  } else if (answer.no_fit && point.after) {
    empty = (
      <div className="prepare-source__empty">
        <p className="prepare-note">{noFitText(answer.no_fit, beforeTitle, afterTitle)}</p>
        <div className="prepare-source__sides">
          <Button variant="secondary" onClick={() => setSide({ gap, against: "before" })}>
            {sideButtonLabel("before", beforeTitle)}
          </Button>
          <Button variant="secondary" onClick={() => setSide({ gap, against: "after" })}>
            {sideButtonLabel("after", afterTitle)}
          </Button>
        </div>
      </div>
    );
  } else {
    empty = <p className="prepare-note">{emptyAnswerText(answer, poolWords)}</p>;
  }

  return (
    <>
      <PointLine words={words} title={unused.detail.join("\n") || undefined} />
      {against && (
        <p className="prepare-source__note">
          {sideOnlyText(against, against === "before" ? beforeTitle : afterTitle)}
          {" · "}
          <button type="button" className="prepare-link prepare-link--inline" onClick={() => setSide(null)}>
            Fit both sides
          </button>
        </p>
      )}
      {range && <p className="prepare-source__note">{range}</p>}
      {unused.notes.map((note) => (
        <p key={note} className="prepare-source__note">
          {note}
        </p>
      ))}
      {answer && !answer.index_current && (
        <p className="prepare-source__note" aria-live="polite">
          {SIMILAR_INDEX_BUILDING}
        </p>
      )}
      <SourceTable<SuggestionRow>
        ariaLabel="Suggestions"
        columns={columns}
        widths={layout.widths}
        onWidthsChange={layout.setWidths}
        onColumnMove={layout.move}
        source={source}
        loadedRows={loadedRows}
        resetKey={`${gap}|${pool}|${against ?? ""}`}
        emptyState={empty}
        onInsert={onInsert}
        onSelectionChange={onPicked}
        onPlayFrom={(index) => void play(rows, index)}
        onPlayRows={(chosen) => void play(chosen, 0)}
        onQueue={(chosen, where) => void queue(chosen, where)}
        onOpenSimilar={onOpenSimilar}
        onOpenEntity={onOpenEntity}
      />
    </>
  );
}

// ------------------------------------------------------------ Library

function LibraryTab({
  pool,
  poolWords,
  words,
  onInsert,
  onPicked,
  onMessage,
  onOpenSimilar,
  onOpenEntity,
}: TabProps) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<{ sort: string; dir: "asc" | "desc" }>({
    sort: DEFAULT_LIBRARY_QUERY.sort,
    dir: DEFAULT_LIBRARY_QUERY.dir,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const query = useMemo<LibraryQuery>(
    () => ({ ...DEFAULT_LIBRARY_QUERY, ...parseScope(pool), q, sort: order.sort, dir: order.dir }),
    [order, pool, q],
  );
  const window_ = useTrackWindow(query);
  const layout = useColumnLayout<LibraryTrackRow>(SOURCE_LIBRARY_TABLE_LAYOUT_KEY, SOURCE_LIBRARY_COLUMNS);
  const say = useCallback((message: string) => onMessage(message, "info"), [onMessage]);
  const playback = useLibraryPlayback({ query, onMessage: say });
  const noRows = useCallback(() => [], []);

  let empty: React.ReactNode;
  if (window_.status === "error") {
    empty = (
      <div className="prepare-source__empty">
        <p className="prepare-note">{window_.error}</p>
        <Button variant="secondary" onClick={window_.retry}>
          Try again
        </Button>
      </div>
    );
  } else if (window_.loading) {
    empty = <p className="prepare-note">Reading your library…</p>;
  } else if (q) {
    empty = <p className="prepare-note">{`Nothing in ${poolWords} matches “${q}”.`}</p>;
  } else {
    empty = <p className="prepare-note">{`${poolWords.charAt(0).toUpperCase()}${poolWords.slice(1)} holds no tracks.`}</p>;
  }

  return (
    <>
      <label className="prepare-source__search">
        <span className="prepare-visually-hidden">Search</span>
        <input
          type="search"
          className="prepare-source__input"
          placeholder="Search title, artist, label…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Search"
        />
      </label>
      <PointLine words={words} />
      <SourceTable<LibraryTrackRow>
        ariaLabel="Library tracks to add"
        columns={layout.visible}
        widths={layout.widths}
        onWidthsChange={layout.setWidths}
        onColumnMove={layout.move}
        source={window_.source}
        loadedRows={noRows}
        resetKey={window_.identity}
        sort={{ key: order.sort, direction: order.dir }}
        onSortChange={(next) => setOrder({ sort: next.key, dir: next.direction })}
        emptyState={empty}
        onInsert={onInsert}
        onSelectionChange={onPicked}
        onPlayFrom={(index) => void playback.playRow(index)}
        onPlayRows={(chosen) => void playback.playRows(chosen)}
        onQueue={(chosen, where) =>
          void (where === "next" ? playback.playNext(chosen) : playback.addToQueue(chosen))
        }
        onOpenSimilar={onOpenSimilar}
        onOpenEntity={onOpenEntity}
      />
    </>
  );
}
