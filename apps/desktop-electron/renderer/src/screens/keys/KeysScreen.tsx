/**
 * The Keys page (PAGES-16, FLW-21, DEC-200).
 *
 * Which keys the playlists, Collections and Sets you pick hold, and the tracks in the keys you
 * click. On the left, the sources; in the middle, the Camelot wheel with each key's count on
 * its segment, darker where there are more; beside it the same counts as a list with a bar
 * each, in Camelot order, and "No Beatport key: N" on its own line. Clicking keys (Ctrl or
 * Command for several, Shift for a run) lists those tracks below in the Library's table with
 * the Library's selection bar. Every count is written on the page: the list is the reading of
 * the wheel for anyone who cannot see its colors, and nothing here waits on a hover.
 *
 * The counts are the engine's (`POST /api/v1/library/keys/population`) and the keys are
 * Beatport's (DEC-201); the page keeps no rule about either. The tracks are asked for with an
 * ordinary rule set, so **Open in Library** and **Save as Smart Collection…** carry exactly the
 * choice on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EntityKind, FilterRuleSet, LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { CamelotWheel, type PickModifiers } from "../../components/wheel/CamelotWheel";
import { CAMELOT_CODES, tracksWord } from "../../components/wheel/camelot";
import { useCompatibleKeys } from "../../components/wheel/useWheelSubject";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { reportUnexpected } from "../../reporting/reporting";
import { cleanFixState, cleanMatchState, cleanTrackState, type FixAction } from "../clean/cleanLink";
import type { CleanTracks } from "../clean/cleanTracks";
import { entityPath, similarPath } from "../discover/discoverLinks";
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
import { KeysCountsList } from "./KeysCountsList";
import { KeysSourcePicker } from "./KeysSourcePicker";
import { KeysTracks } from "./KeysTracks";
import {
  EMPTY_CHOICE,
  chooseKey,
  chooseNone,
  choiceRules,
  choiceWords,
  hasChoice,
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
  sourcesWords,
  toggleSource,
  type PickedSource,
} from "./keysSources";
import { useKeysPopulation } from "./useKeysPopulation";

const CLICK_A_KEY = "Click a key first";

interface KeysScreenProps {
  /** Sources to open on, from the Library's Key list; replaces what was remembered. */
  openWith?: KeysOpening | null;
  /** Called once the opening is applied, so it is not replayed when the user comes back. */
  onOpeningApplied?: () => void;
}

/** The Rekordbox playlists, read once: the tree the picker draws and the pruning checks. */
function usePlaylists(): { nodes: LibraryPlaylistNode[]; ready: boolean; settled: boolean } {
  const [state, setState] = useState<{
    nodes: LibraryPlaylistNode[];
    ready: boolean;
    settled: boolean;
  }>({ nodes: [], ready: false, settled: false });
  useEffect(() => {
    const bridge = window.cuepoint?.getLibraryPlaylists;
    if (!bridge) {
      setState((now) => ({ ...now, settled: true }));
      return;
    }
    let current = true;
    bridge()
      .then((payload) => {
        if (current) setState({ nodes: payload.playlists, ready: true, settled: true });
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setState((now) => ({ ...now, settled: true }));
      });
    return () => {
      current = false;
    };
  }, []);
  return state;
}

export function KeysScreen({ openWith = null, onOpeningApplied }: KeysScreenProps) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [picked, setPicked] = useState<PickedSource[]>(() => openWith?.sources ?? loadSources());
  const [choice, setChoice] = useState<KeyChoice>(EMPTY_CHOICE);
  const [showMix, setShowMix] = useState(false);
  const [libraryEmpty, setLibraryEmpty] = useState(false);
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

  useEffect(() => {
    const read = window.cuepoint?.getLibrarySummary;
    if (!read) return;
    let current = true;
    read()
      .then((summary) => {
        if (current) setLibraryEmpty(Boolean(summary?.library_empty));
      })
      .catch((cause: unknown) => reportUnexpected(cause));
    return () => {
      current = false;
    };
  }, []);

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

  const pick = useCallback(
    (code: string, modifiers: PickModifiers) => {
      if (!order.includes(code)) return;
      setChoice((current) => chooseKey(current, code, order, modeFromEvent(modifiers)));
    },
    [order],
  );
  // The tracks sit below the counts: the first key picked brings them into view, so the click
  // shows its result. Easing only where the user has scroll motion on; instant otherwise.
  const tracksRef = useRef<HTMLElement | null>(null);
  const chosenAny = hasChoice(choice);
  useEffect(() => {
    if (!chosenAny) return;
    const easing = document.documentElement.hasAttribute("data-motion-scroll");
    tracksRef.current?.scrollIntoView?.({ block: "start", behavior: easing ? "smooth" : "auto" });
  }, [chosenAny]);

  const pickNone = useCallback(() => setChoice((current) => chooseNone(current)), []);

  // ----------------------------------------------------------- keys that mix

  const mixKey = showMix ? choice.anchor : null;
  const lit = useCompatibleKeys(mixKey);
  useEffect(() => {
    if (choice.anchor === null) setShowMix(false);
  }, [choice.anchor]);

  // ---------------------------------------------------------- carrying it on

  const rules: FilterRuleSet | null = useMemo(() => choiceRules(choice, picked), [choice, picked]);

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
      setSaveError(result.error ?? "Could not save that Smart Collection.");
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
      onOpenEntity={(kind: EntityKind, ref: string) => navigate(entityPath(kind, ref))}
    />,
  );

  // ------------------------------------------------------------- navigating

  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref)),
    [navigate],
  );
  const openSimilar = useCallback((trackId: number) => navigate(similarPath(trackId)), [navigate]);
  const openInClean = useCallback(
    (trackId: number) => navigate("/clean", { state: cleanTrackState(trackId) }),
    [navigate],
  );
  const openMatch = useCallback(
    (tracks?: CleanTracks) => navigate("/clean", { state: cleanMatchState(tracks) }),
    [navigate],
  );
  const openFix = useCallback(
    (tracks: CleanTracks, action: FixAction) =>
      navigate("/clean", { state: cleanFixState(tracks, action) }),
    [navigate],
  );

  // ---------------------------------------------------------------- drawing

  // Nothing ticked and no tracks is an empty library: the summary says so (the import page
  // above), and until it does the page says nothing rather than blaming playlists.
  const wholeLibraryEmpty = data !== null && data.total === 0 && picked.length === 0;

  const header = (
    <header className="keys-page__header">
      <h1 className="screen__title">Keys</h1>
      {data && !libraryEmpty && !wholeLibraryEmpty && (
        <p className="keys-note" role="status">
          {data.total === 0
            ? "No tracks here"
            : `${tracksWord(data.total)} in ${sourcesWords(picked)}`}
        </p>
      )}
    </header>
  );

  if (libraryEmpty) {
    return (
      <div className="screen screen--scroll keys-page">
        {header}
        <div className="keys-empty keys-empty--page">
          <p className="keys-empty__headline">Import your Rekordbox collection first</p>
          <p className="keys-note">The Keys page counts the keys of the tracks in your library.</p>
          <Button variant="primary" onClick={() => navigate("/library", { state: libraryImportState() })}>
            Import your Rekordbox collection…
          </Button>
        </div>
      </div>
    );
  }

  const noKeys = data !== null && data.total > 0 && data.keys.length === 0;
  const emptySources = data !== null && data.total === 0 && picked.length > 0;
  const countable = data !== null && data.keys.length > 0;
  const mixWord = choice.anchor ? `Show keys that mix with ${choice.anchor}` : "Show keys that mix with…";
  const needChoice = rules === null;

  return (
    <div className="screen screen--scroll keys-page">
      {header}

      <div className="keys-page__top">
        <KeysSourcePicker
          playlists={playlistTree}
          collections={collections.tree}
          picked={picked}
          onToggle={(source) => update(toggleSource(picked, source))}
          onClear={() => update([])}
        />

        {population.status === "loading" && <p className="keys-note keys-page__state">Counting the keys…</p>}

        {population.status === "error" && (
          <div className="keys-empty keys-page__state">
            <p className="keys-empty__headline">The keys could not be counted.</p>
            <Button variant="secondary" onClick={population.retry}>
              Try again
            </Button>
          </div>
        )}

        {population.status === "unavailable" && (
          <p className="keys-note keys-page__state">
            The keys can be counted in the desktop app, once CuePoint has started.
          </p>
        )}

        {noKeys && (
          <div className="keys-empty keys-page__state">
            <p className="keys-empty__headline">Keys come from Beatport. Match your tracks in Clean.</p>
            <p className="keys-note">{`No Beatport key: ${data!.no_key.toLocaleString()}`}</p>
            <Button variant="primary" onClick={() => openMatch()}>
              Match tracks…
            </Button>
          </div>
        )}

        {emptySources && (
          <p className="keys-empty__headline keys-page__state">
            {picked.length === 1 ? `This ${emptyNoun(picked[0]!)} is empty` : "These playlists are empty"}
          </p>
        )}

        {countable && data && (
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
                    <strong>{(data.total - data.no_key).toLocaleString()}</strong>
                    <small>with a key</small>
                  </>
                }
              />
            </div>
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
          </>
        )}
      </div>

      {(countable || noKeys) && (
        <div className="keys-page__actions">
          <Button
            variant="secondary"
            aria-pressed={showMix}
            aria-disabled={choice.anchor === null ? true : undefined}
            title={choice.anchor === null ? CLICK_A_KEY : undefined}
            onClick={() => {
              if (choice.anchor !== null) setShowMix((on) => !on);
            }}
          >
            {mixWord}
          </Button>
          <Button
            variant="secondary"
            aria-disabled={needChoice ? true : undefined}
            title={needChoice ? CLICK_A_KEY : undefined}
            onClick={() => {
              if (!needChoice) openInLibrary();
            }}
          >
            Open in Library
          </Button>
          <Button
            variant="secondary"
            aria-disabled={needChoice || !window.cuepoint?.saveSmartCollection ? true : undefined}
            title={needChoice ? CLICK_A_KEY : undefined}
            onClick={() => {
              if (needChoice) return;
              setSaveError(null);
              setSaving("open");
            }}
          >
            Save as Smart Collection…
          </Button>
        </div>
      )}

      {countable && (
        <section ref={tracksRef} className="keys-page__tracks" aria-labelledby="keys-tracks-title">
          {hasChoice(choice) && rules ? (
            <>
              <h2 id="keys-tracks-title" className="keys-section-title">
                {`Tracks in ${choiceWords(choice)}`}
              </h2>
              <KeysTracks
                rules={rules}
                onSelectTrack={onSelectTrack}
                reloadToken={reloadToken}
                heldDetail={detail.detail}
                collections={collections.tree}
                onCollectionsChanged={collections.reload}
                onOpenEntity={openEntity}
                onOpenSimilar={openSimilar}
                onOpenInClean={openInClean}
                onOpenMatch={openMatch}
                onOpenFix={openFix}
              />
            </>
          ) : (
            <>
              <h2 id="keys-tracks-title" className="keys-section-title">
                Tracks
              </h2>
              <p className="keys-note">Click a key to list its tracks.</p>
            </>
          )}
        </section>
      )}

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
