/**
 * Where tracks come from on the Prepare page (PREP-11, DEC-105).
 *
 * Two tabs, remembered, over one pool picker and one insertion point:
 *
 * - **Suggestions**: what fits the gap after the selected entry, scored
 *   against the entries on either side (DEC-105), each side's reasons in words
 *   and a mark on a track already in the Set. A gap nothing bridges says how
 *   far apart its neighbors are and offers each side's own list; the gate is
 *   never loosened. An empty Set has nothing to fit against, and says so.
 * - **Library**: a search over the one browse query (DEC-023), in the pool.
 *
 * The pool is the whole library, a Rekordbox playlist or folder, a Collection,
 * a Smart Collection or a Set, as Clean's scope is; the page remembers it.
 * Every row inserts at the point, drags into the Set, and plays on a
 * double-click (`SourceTable`).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type {
  CollectionNode,
  EntityKind,
  LibraryPlaylistNode,
  LibraryTrackRow,
  SetChapterPlan,
  SetRefusal,
  SetSuggestionSideName,
} from "../../api/cuepointBridge.types";
import { LIBRARY_PLAYLISTS, useSharedRead } from "../../api/sharedReads";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Hint } from "../../components/Hint";
import { LinkButton } from "../../components/LinkButton";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { SearchField } from "../../components/SearchField";
import { Select } from "../../components/Select";
import { Tabs } from "../../components/Tabs";
import { CLEAR_SEARCH, RETRY, nothingMatches } from "../../format/words";
import { ColumnPicker, inMemorySource, useColumnLayout } from "../../components/table";
import { parseScope, scopeOptions } from "../clean/cleanRules";
import { SIMILAR_INDEX_BUILDING } from "../discover/entityFormat";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "../library/libraryQuery";
import { queuedMessage, toQueueItem, useLibraryPlayback } from "../library/useLibraryPlayback";
import { useTrackWindow } from "../library/useTrackWindow";
import {
  emptyAnswerText,
  gapKey,
  insertLabel,
  insertingText,
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
import { headlineOf } from "./prepareFormat";
import { SourceTable } from "./SourceTable";
import {
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
export const EMPTY_SET_SUGGESTIONS_HEADLINE = "Suggestions need a track to fit against";
const EMPTY_SET_SUGGESTIONS_HELP = "Add the first one from the Library tab";
export const EMPTY_SET_SUGGESTIONS = `${EMPTY_SET_SUGGESTIONS_HEADLINE}. ${EMPTY_SET_SUGGESTIONS_HELP}.`;

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
  onMessage: (message: string, tone: "success" | "info" | "warning") => void;
  onOpenSimilar: (trackId: number) => void;
  onOpenEntity: (kind: EntityKind, ref: string) => void;
  /** The rows picked in the panel, whenever they change (the selected-track store). */
  onPickedChange?: (rows: LibraryTrackRow[]) => void;
}

/** Where an insert goes, in words, the titles set apart. */
function PointLine({ words, title }: { words: PointWords; title: string }) {
  const where = (chapter: string | null) => (chapter ? `, in ${chapter}` : "");
  return (
    <p className="prepare-source__point" role="status" aria-label={insertingText(words)} data-hint={title}>
      Inserting:{" "}
      {words.kind === "empty" && "at the start of the empty Set"}
      {words.kind === "between" && (
        <>
          between <em>{words.before}</em> and <em>{words.after}</em>
          {where(words.chapter)}
        </>
      )}
      {words.kind === "end" && (
        <>
          after <em>{words.before}</em>, at the end of the Set{where(words.chapter)}
        </>
      )}
    </p>
  );
}

const NO_PLAYLISTS: LibraryPlaylistNode[] = [];

export function SourcePanel(props: SourcePanelProps) {
  const selectId = useId();
  const { collections, chapters, point } = props;
  const [tab, setTab] = useState<SourceTab>(loadSourceTab);
  const [chosenPool, setChosenPool] = useState<PoolValue>(loadSourcePool);
  // The Rekordbox playlists, from the shared cache; a failure leaves the
  // CuePoint pools and the library on offer.
  const playlists: LibraryPlaylistNode[] = useSharedRead(LIBRARY_PLAYLISTS).value?.playlists ?? NO_PLAYLISTS;

  const options = useMemo(() => scopeOptions(playlists, collections), [collections, playlists]);
  // A pool that has gone (or not been read yet) is the library, without
  // forgetting the choice: the playlists arrive a moment after the page.
  const pool = poolOrLibrary(chosenPool, options);
  const poolWords = poolName(pool, options);

  // A tab is mounted the first time it is opened and kept after that, so coming back to it finds its
  // scroll, sort, search and selection as they were (area 42).
  const [visited, setVisited] = useState<Record<SourceTab, boolean>>(() => ({
    suggestions: tab === "suggestions",
    library: tab === "library",
  }));
  const chooseTab = (next: string) => {
    const value = next === "library" ? "library" : "suggestions";
    setTab(value);
    setVisited((was) => (was[value] ? was : { ...was, [value]: true }));
    saveSourceTab(value);
  };
  const choosePool = (next: PoolValue) => {
    setChosenPool(next);
    saveSourcePool(next);
  };

  const words = pointWords(point, chapters);
  // The rows selected in the tab open, for the one button beside the pool:
  // on the pool's own line, so the panel's height stays rows (DEC-112).
  const [pickedBy, setPickedBy] = useState<Record<SourceTab, LibraryTrackRow[]>>({ suggestions: [], library: [] });
  const pickSuggestions = useCallback(
    (rows: LibraryTrackRow[]) => setPickedBy((was) => ({ ...was, suggestions: rows })),
    [],
  );
  const pickLibrary = useCallback(
    (rows: LibraryTrackRow[]) => setPickedBy((was) => ({ ...was, library: rows })),
    [],
  );
  const picked = pickedBy[tab];
  const { onPickedChange } = props;
  useEffect(() => onPickedChange?.(picked), [onPickedChange, picked]);
  // What the neighbors could not be compared by, which Suggestions finds out
  // and the point line (now above the tabs) carries as its title.
  const [pointDetail, setPointDetail] = useState<string | undefined>(undefined);
  // The line above the tabs is one truncated line: its title holds the whole
  // sentence on both tabs, and the neighbors' detail on Suggestions.
  const pointTitle = [pointText(words), tab === "suggestions" ? pointDetail : undefined]
    .filter(Boolean)
    .join(" ");
  const body = useRef<HTMLDivElement>(null);
  const pickTracks = () => body.current?.querySelector<HTMLElement>('[data-active="true"] [role="table"]')?.focus();

  return (
    <section className="prepare-source" aria-label="Add to the Set">
      <PointLine words={words} title={pointTitle} />
      <Tabs tabs={TABS} activeId={tab} onChange={chooseTab} variant="sub" />
      <div className="cp-toolbar prepare-source__controls">
        <Hint text="Where Suggestions and the search look: the library, a playlist, a Collection or a Set">
          <Select
            id={`${selectId}-from`}
            label="From"
            hideLabel
            className="prepare-source__select"
            value={pool}
            onChange={(event) => choosePool(event.target.value)}
            options={options.map((option) => ({ value: option.value, label: option.label, disabled: option.disabled }))}
          />
        </Hint>
        <Hint
          text={
            picked.length === 0
              ? `Select tracks below, then insert them. ${insertingText(words)}`
              : pointText(words)
          }
        >
          <Button
            variant="secondary"
            onClick={() => (picked.length === 0 ? pickTracks() : props.onInsert(picked))}
          >
            {insertLabel(picked.length)}
          </Button>
        </Hint>
      </div>
      <div ref={body} className="prepare-source__body">
        {visited.suggestions && (
          <div
            className="prepare-source__pane"
            role="tabpanel"
            aria-label="Suggestions"
            aria-hidden={tab !== "suggestions"}
            data-active={tab === "suggestions"}
          >
            <SuggestionsTab
              {...props}
              pool={pool}
              poolWords={poolWords}
              onPicked={pickSuggestions}
              onPointDetail={setPointDetail}
              onOpenLibrary={() => chooseTab("library")}
            />
          </div>
        )}
        {visited.library && (
          <div
            className="prepare-source__pane"
            role="tabpanel"
            aria-label="Library"
            aria-hidden={tab !== "library"}
            data-active={tab === "library"}
          >
            <LibraryTab {...props} pool={pool} poolWords={poolWords} onPicked={pickLibrary} />
          </div>
        )}
      </div>
    </section>
  );
}

interface TabProps extends SourcePanelProps {
  pool: PoolValue;
  poolWords: string;
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
  revision,
  onInsert,
  onStale,
  onGone,
  onMessage,
  onOpenSimilar,
  onOpenEntity,
  onPicked,
  onPointDetail,
  onOpenLibrary,
}: TabProps & {
  onOpenLibrary: () => void;
  onPointDetail: (detail: string | undefined) => void;
}) {
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
  const columns = layout.visible;
  const { play, queue } = useQueueActions(onMessage);
  const [picking, setPicking] = useState(false);

  // What the neighbors could not be compared by: the notes are drawn here, the
  // rest rides the point line above the tabs as its title.
  const unused = answer
    ? unusedNotes(answer, { before: point.before?.track.title, after: point.after?.track.title })
    : { notes: [], detail: [] };
  const detail = unused.detail.join("\n") || undefined;
  useEffect(() => onPointDetail(detail), [detail, onPointDetail]);

  if (!point.before) {
    return (
      <EmptyState
        compact
        icon="prepare"
        headline={EMPTY_SET_SUGGESTIONS_HEADLINE}
        description={`${EMPTY_SET_SUGGESTIONS_HELP}.`}
        action={{ label: "Open the Library tab", onClick: onOpenLibrary }}
      />
    );
  }

  const beforeTitle = point.before.track.title;
  const afterTitle = point.after?.track.title ?? "";
  const range = answer ? rangeNote(answer, point.chapter) : null;

  let empty: React.ReactNode;
  if (suggestions.problem) {
    empty = (
      <Notice
        action={
          <Button variant="secondary" onClick={suggestions.retry}>
            {RETRY}
          </Button>
        }
      >
        {suggestions.problem}
      </Notice>
    );
  } else if (!answer) {
    empty = <Loading what="what fits" />;
  } else if (answer.no_fit && point.after) {
    empty = (
      <div className="prepare-source__empty">
        <EmptyState compact icon="prepare" headline="Nothing bridges this gap" description={noFitText(answer.no_fit, beforeTitle, afterTitle)} />
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
    empty = <EmptyState compact icon="prepare" headline={headlineOf(emptyAnswerText(answer, poolWords))} />;
  }

  return (
    <>
      {against && (
        <p className="prepare-source__note">
          {sideOnlyText(against, against === "before" ? beforeTitle : afterTitle)}
          {" · "}
          <LinkButton onClick={() => setSide(null)}>Fit both sides</LinkButton>
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
        sort={layout.sort ?? undefined}
        onSortChange={layout.setSort}
        resetKey={`${gap}|${pool}|${against ?? ""}`}
        emptyState={empty}
        onInsert={onInsert}
        onSelectionChange={onPicked}
        onPlayFrom={(index) => void play(rows, index)}
        onPlayRows={(chosen) => void play(chosen, 0)}
        onQueue={(chosen, where) => void queue(chosen, where)}
        onOpenSimilar={onOpenSimilar}
        onOpenEntity={onOpenEntity}
        onColumns={() => setPicking(true)}
        onMessage={onMessage}
      />
      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={SUGGESTION_COLUMNS}
        layout={layout.layout}
        onToggle={layout.toggle}
        onNudge={layout.nudge}
        onReset={layout.reset}
        onRestore={layout.restore}
      />
    </>
  );
}

// ------------------------------------------------------------ Library

function LibraryTab({
  pool,
  poolWords,
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
  const [picking, setPicking] = useState(false);

  let empty: React.ReactNode;
  if (window_.status === "error") {
    empty = (
      <Notice
        action={
          <Button variant="secondary" onClick={window_.retry}>
            {RETRY}
          </Button>
        }
      >
        {window_.error}
      </Notice>
    );
  } else if (window_.loading) {
    empty = <Loading what="tracks" />;
  } else if (q) {
    empty = (
      <EmptyState
        compact
        icon="search"
        headline={headlineOf(nothingMatches(q))}
        description={`Nothing in ${poolWords} fits that. Try another word.`}
        action={{ label: CLEAR_SEARCH, onClick: () => setText("") }}
      />
    );
  } else {
    empty = (
      <EmptyState compact icon="library" headline={`${poolWords.charAt(0).toUpperCase()}${poolWords.slice(1)} holds no tracks`} />
    );
  }

  return (
    <>
      <SearchField className="prepare-source__search" thing="tracks" value={text} onValueChange={setText} />
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
        onColumns={() => setPicking(true)}
        onMessage={onMessage}
      />
      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={SOURCE_LIBRARY_COLUMNS}
        layout={layout.layout}
        onToggle={layout.toggle}
        onNudge={layout.nudge}
        onReset={layout.reset}
        onRestore={layout.restore}
      />
    </>
  );
}
