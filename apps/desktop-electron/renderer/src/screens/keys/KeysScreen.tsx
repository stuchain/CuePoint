/**
 * The Keys page (PAGES-16, FLW-21, DEC-200).
 *
 * Which keys the playlists, Collections and Sets you pick hold, and the tracks in the keys you
 * click (D12). Two panes. On the left, the sources and beside them the Camelot wheel, with each
 * key's count on its segment (and in its name) and darker where there are more, or the same
 * counts as a list with a bar each, in Camelot order and "— no key" as one more row. On the
 * right, the track list in the Library's table: with no key picked it shows every track in the
 * sources and the wheel's caption asks to "Pick a key"; clicking keys (Ctrl or Command for
 * several, Shift for a run) narrows it at once. The list's own toolbar holds the count, the link
 * to the Library and the Wheel | List switch, which picks the view in the middle one at a time
 * and is remembered (K15). Every count is written on the page: the list is the reading of the
 * wheel for anyone who cannot see its colors, and nothing here waits on a hover.
 *
 * The counts are the engine's (`POST /api/v1/library/keys/population`) and the keys are
 * Beatport's (DEC-201); the page keeps no rule about either. The tracks are asked for with an
 * ordinary rule set, so **Open in Library** and **Save as Smart Collection…** carry exactly the
 * choice on.
 */
import { ScreenHeader, factsLine } from "../../components/shell/ScreenHeader";
import { KeyChip } from "../../components/wheel";
import { keyName } from "../../components/wheel/camelot";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EntityKind, FilterRuleSet, LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Tabs } from "../../components/Tabs";
import { EmptyState, IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { Hint } from "../../components/Hint";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { useToast } from "../../components/Toast";
import { CamelotWheel, type PickModifiers } from "../../components/wheel/CamelotWheel";
import { CAMELOT_CODES } from "../../components/wheel/camelot";
import { useCompatibleKeys } from "../../components/wheel/useWheelSubject";
import { needsDesktopApp } from "../../api/userMessage";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { LIBRARY_PLAYLISTS, LIBRARY_SUMMARY, useReportReadError, useSharedRead } from "../../api/sharedReads";
import { countNoun, formatCount } from "../../format/counts";
import { MATCH_ON_BEATPORT, RETRY, couldNot, opensDialog } from "../../format/words";
import { cleanMatchState, cleanTrackState } from "../clean/cleanLink";
import type { CleanTracks } from "../clean/cleanTracks";
import { entityPath, originState, similarPath } from "../discover/discoverLinks";
import { flattenCollections, holdsTracks } from "../library/collectionTree";
import { sourceKey } from "../library/filterText";
import { libraryImportState, libraryRulesState } from "../library/libraryLink";
import { buildTree, flatten } from "../library/playlistTree";
import { SaveSmartDialog, type FolderOption } from "../library/SaveSmartDialog";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { useCollectionTree } from "../library/useCollectionTree";
import { useFilterVocabulary } from "../library/useFilterVocabulary";
import { useTrackDetail } from "../library/useTrackDetail";
import "../screens.css";
import "./keys.css";
import { KeysCountsList, KeysNoKeyRow } from "./KeysCountsList";
import { KeysSourcePicker } from "./KeysSourcePicker";
import { KeysTracks } from "./KeysTracks";
import {
  EMPTY_CHOICE,
  chooseKey,
  chooseNone,
  choiceRules,
  choiceWords,
  hasChoice,
  listRules,
  modeFromEvent,
  type KeyChoice,
} from "./keysChoice";
import { countsByCode } from "./keysCounts";
import type { KeysOpening } from "./keysLink";
import {
  goneSource,
  keepExisting,
  loadSources,
  requestSources,
  sameSource,
  saveSources,
  setSources,
  sourcesWords,
  toggleSource,
  type PickedSource,
} from "./keysSources";
import { loadView, saveView, type KeysView } from "./keysView";
import { useKeysPopulation } from "./useKeysPopulation";

const SELECT_A_KEY = "Select a key first";

const VIEWS: { id: KeysView; label: string }[] = [
  { id: "wheel", label: "Wheel" },
  { id: "list", label: "List" },
];

interface KeysScreenProps {
  /** Sources to open on, from the Library's Key list; replaces what was remembered. */
  openWith?: KeysOpening | null;
  /** Called once the opening is applied, so it is not replayed when the user comes back. */
  onOpeningApplied?: () => void;
}

/** The Rekordbox playlists, through the shared cache (C19d): the tree the picker draws and the pruning checks. */
function usePlaylists(): { nodes: LibraryPlaylistNode[]; ready: boolean; settled: boolean } {
  const read = useSharedRead(LIBRARY_PLAYLISTS);
  useReportReadError(read.error);
  const value = read.value;
  return useMemo(
    () => ({
      nodes: value?.playlists ?? [],
      ready: value !== undefined,
      settled: value !== undefined || read.unavailable || read.error !== undefined,
    }),
    [value, read.unavailable, read.error],
  );
}

export function KeysScreen({ openWith = null, onOpeningApplied }: KeysScreenProps) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [picked, setPicked] = useState<PickedSource[]>(() => openWith?.sources ?? loadSources());
  const [choice, setChoice] = useState<KeyChoice>(EMPTY_CHOICE);
  const [showMix, setShowMix] = useState(false);
  const [view, setView] = useState<KeysView>(loadView);
  const [inspected, setInspected] = useState<{ id: number | null; count: number }>({
    id: null,
    count: 0,
  });
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState<"closed" | "open" | "busy">("closed");
  const [saveError, setSaveError] = useState<string | null>(null);

  // ----------------------------------------------------------- the sources

  const playlists = usePlaylists();
  const collections = useCollectionTree();
  const playlistTree = useMemo(() => buildTree(playlists.nodes), [playlists.nodes]);

  const update = useCallback((next: PickedSource[]) => {
    setPicked(next);
    saveSources(next);
    setChoice(EMPTY_CHOICE);
    setShowMix(false);
  }, []);

  // A source a refresh removed is dropped, once both trees have been read.
  const treesReady = playlists.ready && collections.status === "ready";
  const treesSettled = playlists.settled && collections.status !== "loading";
  const [pruned, setPruned] = useState(false);
  useEffect(() => {
    if (!treesSettled) return;
    // Counting waits for this: the batch below sets the pruned sources and `pruned` together.
    setPruned(true);
    if (!treesReady) return;
    const available: PickedSource[] = [
      ...flatten(playlistTree).map((node): PickedSource => ({ kind: "playlist", id: node.id })),
      ...flattenCollections(collections.tree)
        .filter(holdsTracks)
        .map((node): PickedSource => ({
          kind: node.kind === "set" ? "set" : "collection",
          id: node.id,
        })),
    ];
    // The playlist list as the engine sends it holds Rekordbox's own root, which the picker
    // hides; a remembered playlist is still real, so the flat list is what is checked.
    for (const node of playlists.nodes) {
      if (!available.some((item) => item.kind === "playlist" && item.id === node.id)) {
        available.push({ kind: "playlist", id: node.id });
      }
    }
    setPicked((current) => {
      const kept = keepExisting(current, available);
      if (kept.length === current.length) return current;
      saveSources(kept);
      return kept;
    });
  }, [collections.tree, playlistTree, playlists.nodes, treesReady, treesSettled]);

  // Sources sent by another page win over what was remembered, once per navigation.
  const token = openWith?.token ?? null;
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (token === null || openWith === null || applied.current === token) return;
    applied.current = token;
    update(openWith.sources);
    onOpeningApplied?.();
  }, [onOpeningApplied, openWith, token, update]);

  // ------------------------------------------------------------ the counts

  // Nothing is asked before the trees are read and the sources pruned, so a source a refresh
  // removed is never sent. A tree that could not be read does not hold the counts back: the
  // sources are then kept as they were, and the engine is the one to say if one is gone.
  const pickedNow = useRef(picked);
  useEffect(() => {
    pickedNow.current = picked;
  });
  const dropGone = useCallback((message: string) => {
    const source = goneSource(message);
    if (!source) return false;
    const kept = pickedNow.current.filter((item) => !sameSource(item, source));
    if (kept.length === pickedNow.current.length) return false;
    saveSources(kept);
    setPicked(kept);
    return true;
  }, []);
  const population = useKeysPopulation(requestSources(picked), reloadToken, pruned, dropGone);
  const data = population.data;

  const summaryRead = useSharedRead(LIBRARY_SUMMARY);
  useReportReadError(summaryRead.error);
  const libraryEmpty = Boolean(summaryRead.value?.library_empty);

  const keys = useMemo(() => data?.keys ?? [], [data]);
  const order = useMemo(() => keys.map((entry) => entry.code), [keys]);
  const counts = useMemo(() => countsByCode(keys), [keys]);

  // A key the new sources do not hold cannot stay chosen.
  useEffect(() => {
    if (!data) return;
    setChoice((current) => {
      const stillThere = current.keys.filter((code) => order.includes(code));
      const noneStays = current.none && data.no_key > 0;
      if (stillThere.length === current.keys.length && noneStays === current.none) return current;
      if (stillThere.length === 0 && !noneStays) return EMPTY_CHOICE;
      return { keys: stillThere, none: noneStays, anchor: stillThere.at(-1) ?? null };
    });
  }, [data, order]);

  const chosen = useMemo(() => new Set(choice.keys), [choice.keys]);
  // The tracks the choice holds, from the counts the wheel and the list write.
  const choiceTotal = choice.none
    ? (data?.no_key ?? 0)
    : choice.keys.reduce((sum, code) => sum + (counts.get(code) ?? 0), 0);

  const pick = useCallback(
    (code: string, modifiers: PickModifiers) => {
      if (!order.includes(code)) return;
      setChoice((current) => chooseKey(current, code, order, modeFromEvent(modifiers)));
    },
    [order],
  );
  const chosenAny = hasChoice(choice);

  const pickNone = useCallback(() => setChoice((current) => chooseNone(current)), []);

  // ----------------------------------------------------------- keys that mix

  const mixKey = showMix ? choice.anchor : null;
  const lit = useCompatibleKeys(mixKey);
  useEffect(() => {
    if (choice.anchor === null) setShowMix(false);
  }, [choice.anchor]);

  // ---------------------------------------------------------- carrying it on

  // What Open in Library and Save as Smart Collection carry: null until a key is chosen.
  const rules: FilterRuleSet | null = useMemo(() => choiceRules(choice, picked), [choice, picked]);
  // What the list beside the wheel shows: that, or every track in the sources.
  const shownRules = useMemo(() => listRules(choice, picked), [choice, picked]);

  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const node of playlists.nodes) out.set(sourceKey("playlist", node.id), node.name);
    for (const node of flattenCollections(collections.tree)) {
      if (node.kind === "collection") out.set(sourceKey("collection", node.id), node.name);
      if (node.kind === "set") out.set(sourceKey("set", node.id), `${node.name} (Set)`);
    }
    return { source: out };
  }, [collections.tree, playlists.nodes]);

  const openInLibrary = useCallback(() => {
    if (rules) navigate("/library", { state: libraryRulesState(rules) });
  }, [navigate, rules]);

  const vocabulary = useFilterVocabulary().vocabulary;
  const folders = useMemo(
    (): FolderOption[] =>
      flattenCollections(collections.tree)
        .filter((node) => node.kind === "folder")
        .map((node) => ({ id: node.id, name: node.name, depth: node.depth })),
    [collections.tree],
  );

  const saveSmart = async (name: string, parentId: number | null) => {
    if (!rules) return;
    setSaving("busy");
    setSaveError(null);
    const result = await collections.saveSmart(name, rules, parentId);
    if (!result.ok || !result.node) {
      setSaving("open");
      setSaveError(result.error ?? couldNot("save that Smart Collection"));
      return;
    }
    setSaving("closed");
    push(`Saved “${result.node.name}”. It is under Collections in the Library.`, "success");
  };

  // ------------------------------------------------------------- Inspector

  const detail = useTrackDetail(inspected.id);
  const heldTrack = detail.detail?.track;
  useReportSelectedTrack(
    inspected.id !== null && heldTrack && heldTrack.id === inspected.id
      ? { id: inspected.id, key: heldTrack.effective_key ?? null }
      : null,
  );
  const onSelectTrack = useCallback(
    (id: number | null, count: number) => setInspected({ id, count }),
    [],
  );
  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={inspected.count}
      onError={(message) => push(message, "warning")}
      onMessage={(message) => push(message, "success")}
      onTrackChanged={() => {
        setReloadToken((value) => value + 1);
        detail.reload();
      }}
      onOpenInClean={(trackId) => navigate("/clean", { state: cleanTrackState(trackId) })}
      onOpenEntity={(kind: EntityKind, ref: string) => navigate(entityPath(kind, ref), { state: originState("library") })}
    />,
  );

  // ------------------------------------------------------------- navigating

  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref), { state: originState("library") }),
    [navigate],
  );
  const openSimilar = useCallback((trackId: number) => navigate(similarPath(trackId), { state: originState("library") }), [navigate]);
  const openInClean = useCallback(
    (trackId: number) => navigate("/clean", { state: cleanTrackState(trackId) }),
    [navigate],
  );
  const openMatch = useCallback(
    (tracks?: CleanTracks) => navigate("/clean", { state: cleanMatchState(tracks) }),
    [navigate],
  );

  // ---------------------------------------------------------------- drawing

  // Nothing ticked and no tracks is an empty library: the summary says so (the import page
  // above), and until it does the page says nothing rather than blaming playlists.
  const wholeLibraryEmpty = data !== null && data.total === 0 && picked.length === 0;

  const shown = data && !libraryEmpty && !wholeLibraryEmpty ? data : null;
  const noKeys = data !== null && data.total > 0 && data.keys.length === 0;
  const emptySources = data !== null && data.total === 0 && picked.length > 0;
  const countable = data !== null && data.keys.length > 0;
  const mixWord = choice.anchor ? `Show keys that mix with ${choice.anchor}` : "Show keys that mix";
  const needChoice = rules === null;

  const header = (
    <ScreenHeader
      title="Keys"
      // A live line: it is read out when the sources change what is counted.
      summary={
        shown ? (
          <span role="status">
            {shown.total === 0
              ? "No tracks here"
              : factsLine({ count: shown.total, noun: "track", facts: [sourcesWords(picked)] })}
          </span>
        ) : undefined
      }
      pageActions={
        countable || noKeys ? (
          <>
            <Hint text={choice.anchor === null ? SELECT_A_KEY : undefined}>
              <Button
                variant="secondary"
                aria-pressed={showMix}
                aria-disabled={choice.anchor === null ? true : undefined}
                onClick={() => {
                  if (choice.anchor !== null) setShowMix((on) => !on);
                }}
              >
                {mixWord}
              </Button>
            </Hint>
            <Hint text={needChoice ? SELECT_A_KEY : undefined}>
              <Button
                variant="secondary"
                aria-disabled={needChoice || !window.cuepoint?.saveSmartCollection ? true : undefined}
                onClick={() => {
                  if (needChoice) return;
                  setSaveError(null);
                  setSaving("open");
                }}
              >
                {opensDialog("Save as Smart Collection")}
              </Button>
            </Hint>
          </>
        ) : undefined
      }
    />
  );

  if (libraryEmpty) {
    return (
      <div className="screen screen--scroll keys-page">
        {header}
        <EmptyState
          icon="keys"
          headline="No library yet"
          description="Keys counts the keys of the tracks in your library."
          action={{
            label: IMPORT_COLLECTION_LABEL,
            onClick: () => navigate("/library", { state: libraryImportState() }),
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen screen--scroll keys-page">
      {header}

      <div className="keys-page__top">
        <KeysSourcePicker
          playlists={playlistTree}
          collections={collections.tree}
          libraryTrackCount={summaryRead.value?.track_count ?? null}
          picked={picked}
          onToggle={(source) => update(toggleSource(picked, source))}
          onToggleMany={(sources, on) => update(setSources(picked, sources, on))}
          onClear={() => update([])}
        />

        {population.status === "loading" && <Loading what="keys" className="keys-page__state" />}

        {population.status === "error" && (
          <Notice
            className="keys-page__state"
            action={
              <Button variant="secondary" onClick={population.retry}>
                {RETRY}
              </Button>
            }
          >
            The keys could not be counted
          </Notice>
        )}

        {population.status === "unavailable" && (
          <EmptyState
            className="keys-page__state"
            icon="keys"
            headline="Keys are counted in the desktop app"
            description={needsDesktopApp("Counting keys")}
          />
        )}

        {noKeys && (
          <EmptyState
            className="keys-page__state"
            icon="keys"
            headline="Keys come from Beatport"
            description={`Match your tracks in Clean. No Beatport key: ${formatCount(data!.no_key)}`}
            action={{ label: MATCH_ON_BEATPORT, onClick: () => openMatch() }}
          />
        )}

        {emptySources && (
          <EmptyState
            className="keys-page__state"
            icon="keys"
            headline={picked.length === 1 ? `This ${emptyNoun(picked[0]!)} is empty` : "These playlists are empty"}
          />
        )}

        {countable && data && (
          <div className="keys-page__view" data-view={view}>
            <div className="keys-page__panel">
              {view === "wheel" ? (
                <>
                  <div className="keys-page__wheel">
                    <CamelotWheel
                      lit={lit}
                      focusCode={choice.anchor ?? order[0] ?? CAMELOT_CODES[0]!}
                      onFocusCode={() => undefined}
                      onPick={pick}
                      counts={counts}
                      chosen={chosen}
                      center={
                        <>
                          <strong>{formatCount(data.total - data.no_key)}</strong>
                          <small>with a key</small>
                        </>
                      }
                    />
                  </div>
                  <KeysNoKeyRow noKey={data.no_key} noneChosen={choice.none} onPickNone={pickNone} />
                </>
              ) : (
                <KeysCountsList
                  keys={keys}
                  noKey={data.no_key}
                  chosen={chosen}
                  noneChosen={choice.none}
                  lit={lit}
                  mixKey={mixKey}
                  onPick={pick}
                  onPickNone={pickNone}
                />
              )}
            </div>
            <p className="keys-page__caption" role="status">
              {!chosenAny ? (
                "Pick a key"
              ) : choice.keys.length === 1 && !choice.none ? (
                <>
                  <KeyChip value={choice.keys[0]} /> {keyName(choice.keys[0]!)} · {countNoun(choiceTotal, "track")}
                </>
              ) : (
                `${choiceWords(choice)} · ${countNoun(choiceTotal, "track")}`
              )}
            </p>
          </div>
        )}

        {countable && (
          <section className="keys-page__tracks" aria-label="Tracks">
            <KeysTracks
              heading={chosenAny ? `Tracks in ${choiceWords(choice)}` : "Tracks"}
              rules={shownRules}
              viewSwitch={
                <span className="keys-page__actions">
                  <Tabs
                    tabs={VIEWS}
                    activeId={view}
                    variant="sub"
                    onChange={(id) => {
                      const next = id as KeysView;
                      setView(next);
                      saveView(next);
                    }}
                  />
                </span>
              }
              openInLibrary={{ run: openInLibrary, disabledReason: needChoice ? SELECT_A_KEY : null }}
              onSelectTrack={onSelectTrack}
              reloadToken={reloadToken}
              heldDetail={detail.detail}
              collections={collections.tree}
              onCollectionsChanged={collections.reload}
              onOpenEntity={openEntity}
              onOpenSimilar={openSimilar}
              onOpenInClean={openInClean}
              onOpenMatch={openMatch}
              onTracksChanged={() => {
                setReloadToken((value) => value + 1);
                detail.reload();
              }}
            />
          </section>
        )}
      </div>

      <SaveSmartDialog
        open={saving !== "closed"}
        rules={rules}
        vocabulary={vocabulary}
        names={names}
        folders={folders}
        busy={saving === "busy"}
        error={saveError}
        onSave={(name, parentId) => void saveSmart(name, parentId)}
        onClose={() => setSaving("closed")}
      />
    </div>
  );
}

/** What one empty source is called. */
function emptyNoun(source: PickedSource): string {
  return source.kind === "playlist" ? "playlist" : source.kind === "set" ? "Set" : "Collection";
}
