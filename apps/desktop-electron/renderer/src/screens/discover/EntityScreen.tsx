/**
 * An Artist or Label page (DISCOVER-11, DEC-094, DEC-095).
 *
 * Reached from a track's credits in the Inspector, from the operations list,
 * from a filter chip, and from another page's header. Its address is its
 * reference, `bp:<id>` or `name:<key>`, under the `discover` destination.
 *
 * **Which identity it is, it says** (DEC-095): a Beatport artist or label, or
 * tracks grouped by name. A name the engine has since linked to one id is
 * that id's page, and the address is replaced with the id's, so a page has
 * one address however it was reached.
 *
 * Two halves. **Your tracks** are the Library's own table over the engine's
 * rule set, playable and queueable as library rows are. **On Beatport** is
 * the id's recent releases in DISCOVER-10's Beatport table, or the state
 * that stands in for them. The header's facts are the Library's answers over
 * the same rules, so its count is the table's; **Open in Library** and **Save
 * as Smart Collection** carry the same rules, which makes the page a way into
 * CuePoint's own organization too.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  EntityKind,
  EntityPage,
  FilterRuleSet,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { useToast } from "../../components/Toast";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { flattenCollections } from "../library/collectionTree";
import { beatportNameKey } from "../library/filterText";
import { libraryRulesState } from "../library/libraryLink";
import { SaveSmartDialog, type FolderOption } from "../library/SaveSmartDialog";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { useCollectionTree } from "../library/useCollectionTree";
import { useFilterVocabulary } from "../library/useFilterVocabulary";
import { useTrackDetail } from "../library/useTrackDetail";
import { BeatportHalf } from "./BeatportHalf";
import { LibraryHalf } from "./LibraryHalf";
import { entityPath, nameRef, similarPath } from "./discoverLinks";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE } from "./discoverTools";
import {
  facetValueText,
  identityHint,
  identityLabel,
  INDEX_BUILDING,
  kindTitle,
  pageTitle,
  redirectedLine,
  relatedKind,
  relatedTitle,
  tracksLine,
  yearsText,
} from "./entityFormat";
import "../screens.css";
import "./discover.css";

/** Which half holds the page's selection; the other lets go of its own. */
type Focus = "library" | "beatport";

const INSPECTOR_BEATPORT = (
  <p className="cp-inspector__empty">
    Tracks on Beatport are not in your library, so there is nothing to inspect here. Select one
    of your tracks to see its details.
  </p>
);

/**
 * The names the rules' Beatport ids go by, so the Library's chips and the
 * save dialog say "Beatport artist is Mara Veil" rather than an id.
 */
function ruleNames(page: EntityPage): Record<string, string> {
  if (page.beatport_id === null || !page.name) return {};
  const field = page.kind === "label" ? "beatport_label" : "beatport_artist";
  return { [beatportNameKey(field, page.beatport_id)]: page.name };
}

interface EntityScreenProps {
  kind: EntityKind;
  /** Where the Inspector's "Open on the Clean page" goes. */
  onOpenInClean?: (trackId: number) => void;
}

export function EntityScreen({ kind, onOpenInClean }: EntityScreenProps) {
  const { ref: routeRef = "" } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [page, setPage] = useState<EntityPage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [focus, setFocus] = useState<Focus>("library");
  const [inspected, setInspected] = useState<{ id: number | null; count: number }>({
    id: null,
    count: 0,
  });
  const [libraryReload, setLibraryReload] = useState(0);
  const [saving, setSaving] = useState<"closed" | "open" | "busy">("closed");
  const [saveError, setSaveError] = useState<string | null>(null);
  // The page last answered, and for which asking, so the address it replaces
  // is not asked again.
  const held = useRef<{ page: EntityPage; version: number } | null>(null);

  // --- the page: asked once per address, and again after a resolve

  useEffect(() => {
    const have = held.current;
    if (have && have.version === version && have.page.kind === kind && have.page.ref === routeRef) {
      return;
    }
    const bridge = window.cuepoint?.getEntityPage;
    if (!bridge) {
      setProblem(NO_ENGINE);
      return;
    }
    let current = true;
    setProblem(null);
    void bridge({ kind, ref: routeRef })
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          setPage(null);
          setProblem(refusalText(answer.refusal));
          return;
        }
        held.current = { page: answer.value, version };
        setPage(answer.value);
        // The page's own address: a name linked since to an id, or a name as
        // typed, is replaced — not pushed — so Back leaves the page.
        if (answer.value.ref !== routeRef) {
          navigate(entityPath(kind, answer.value.ref), { replace: true });
        }
      })
      .catch((cause: unknown) => {
        if (current) setProblem(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      current = false;
    };
  }, [kind, navigate, routeRef, version]);

  // Only the page this address names is drawn: another's, while it is asked
  // for, would be a header over the wrong tracks.
  const shown = page && page.kind === kind && page.ref === routeRef ? page : null;
  const pageRef = shown?.ref ?? null;

  // --- the Inspector: the library half's track, or why there is none

  const detail = useTrackDetail(focus === "library" ? inspected.id : null);
  const onSelectTrack = useCallback(
    (id: number | null, count: number) => setInspected({ id, count }),
    [],
  );
  const openEntity = useCallback(
    (to: EntityKind, ref: string) => navigate(entityPath(to, ref)),
    [navigate],
  );
  const openSimilar = useCallback((trackId: number) => navigate(similarPath(trackId)), [navigate]);

  useInspectorSlot(
    focus === "beatport" ? (
      INSPECTOR_BEATPORT
    ) : (
      <TrackDetailPanel
        detail={detail.detail}
        loading={detail.loading}
        error={detail.error}
        selectionCount={inspected.count}
        onError={(message) => push(message, "warning")}
        onMessage={(message) => push(message, "success")}
        onTrackChanged={() => {
          setLibraryReload((value) => value + 1);
          detail.reload();
        }}
        onOpenInClean={onOpenInClean}
        onOpenEntity={openEntity}
      />
    ),
  );

  // --- saving the rules as a Smart Collection (DEC-043)

  const vocabulary = useFilterVocabulary().vocabulary;
  const collections = useCollectionTree();
  const folders = useMemo(
    (): FolderOption[] =>
      flattenCollections(collections.tree)
        .filter((node) => node.kind === "folder")
        .map((node) => ({ id: node.id, name: node.name, depth: node.depth })),
    [collections.tree],
  );
  const names = useMemo(() => (shown ? ruleNames(shown) : {}), [shown]);
  const valueNames = useMemo(() => ({ beatport: new Map(Object.entries(names)) }), [names]);

  const save = async (rules: FilterRuleSet, name: string, parentId: number | null) => {
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

  // --- drawing

  if (!shown) {
    return (
      <div className="screen screen--stack screen--scroll discover-screen--waiting">
        <header>
          <p className="discover-page__kind">{kindTitle(kind)}</p>
        </header>
        {problem ? (
          <Panel title="This page could not open">
            <p className="discover-note">{problem}</p>
            {problem !== NO_ENGINE && (
              <Button variant="secondary" onClick={() => setVersion((value) => value + 1)}>
                Try again
              </Button>
            )}
          </Panel>
        ) : (
          <p className="discover-note">Opening the page…</p>
        )}
      </div>
    );
  }

  const years = yearsText(shown.library.years);
  const related = shown.library.related.values;
  const genres = shown.library.genres.values;

  return (
    <div className="screen screen--scroll discover-page">
      <header className="discover-page__header">
        <p className="discover-page__kind">
          {kindTitle(kind)}
          <Badge variant={shown.identity === "beatport" ? "info" : "default"}>
            {identityLabel(shown)}
          </Badge>
        </p>
        <h1 className="screen__title">{pageTitle(shown)}</h1>
        <p className="discover-note">{identityHint(shown)}</p>
        {shown.redirected_from && <p className="discover-note">{redirectedLine(kind)}</p>}
        {!shown.library.index_current && (
          <p className="discover-note discover-note--warning" role="status">
            {INDEX_BUILDING}
          </p>
        )}
        <ul className="discover-page__facts" aria-label="In your library">
          <li>{tracksLine(shown.library.tracks)}</li>
          {years && <li>{years}</li>}
          {genres.length > 0 && (
            <li>Genres: {genres.map(facetValueText).join(", ")}</li>
          )}
          {related.length > 0 && (
            <li>
              {relatedTitle(kind)}:{" "}
              {related.map((value, index) => (
                <span key={`${value.value}-${index}`}>
                  {index > 0 && ", "}
                  <button
                    type="button"
                    className="cp-credit-link"
                    onClick={() => openEntity(relatedKind(kind), nameRef(String(value.value)))}
                  >
                    {String(value.value)}
                  </button>{" "}
                  ({value.count.toLocaleString()})
                </span>
              ))}
            </li>
          )}
        </ul>
        <div className="discover-page__actions">
          <Button
            variant="secondary"
            onClick={() => navigate("/library", { state: libraryRulesState(shown.rules, names) })}
          >
            Open in Library
          </Button>
          <Button
            variant="secondary"
            disabled={!window.cuepoint?.saveSmartCollection}
            onClick={() => {
              setSaveError(null);
              setSaving("open");
            }}
          >
            Save as Smart Collection…
          </Button>
        </div>
      </header>

      <section className="discover-page__half" aria-labelledby="discover-page-library">
        <h2 id="discover-page-library" className="discover-section__title">
          Your tracks
        </h2>
        <LibraryHalf
          kind={kind}
          rules={shown.rules}
          active={focus === "library"}
          onActivate={() => setFocus("library")}
          onSelectTrack={onSelectTrack}
          reloadToken={libraryReload}
          heldDetail={detail.detail}
          onOpenEntity={openEntity}
          onOpenSimilar={openSimilar}
        />
      </section>

      <section className="discover-page__half" aria-labelledby="discover-page-beatport">
        <h2 id="discover-page-beatport" className="discover-section__title">
          On Beatport
        </h2>
        {pageRef && (
          <BeatportHalf
            kind={kind}
            pageRef={pageRef}
            links={shown.links}
            active={focus === "beatport"}
            onActivate={() => setFocus("beatport")}
            onResolved={() => setVersion((value) => value + 1)}
          />
        )}
      </section>

      <SaveSmartDialog
        open={saving !== "closed"}
        rules={shown.rules}
        vocabulary={vocabulary}
        names={valueNames}
        folders={folders}
        busy={saving === "busy"}
        error={saveError}
        onSave={(name, parentId) => void save(shown.rules, name, parentId)}
        onClose={() => setSaving("closed")}
      />
    </div>
  );
}
