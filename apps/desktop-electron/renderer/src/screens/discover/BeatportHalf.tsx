/**
 * An Artist or Label page's Beatport half (DISCOVER-11, DEC-094, DEC-098).
 *
 * The recent releases Beatport lists for the page's id, in DISCOVER-10's
 * Beatport table, each marked owned (DEC-092) and wanted, with the same
 * actions as a run's table: add to the wantlist, push to a Beatport playlist,
 * open on Beatport.
 *
 * **Every answer is a state** (DISCOVER-07). When there are no tracks to show,
 * the half says why and offers the one thing that helps: Settings for a token,
 * the resolve job for a name CuePoint could link, the artists who share a
 * name as choices, or asking again when Beatport was busy or out of reach. An
 * artist is never looked up by name (DEC-095), so a name page says so rather
 * than guessing who it is.
 *
 * The tracks already in the library are hidden until asked, with the one
 * switch Results has, in the same words and on by default (DSC-6): what is
 * left is what is new. Turned off, they are shown and marked "In your library".
 * The artist and label names in the table are links (FLW-16), and the row last
 * chosen lights the wheel with Beatport's own key (DEC-157).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  BeatportPlaylistResult,
  BeatportResolveResult,
  BeatportTrackRow,
  DiscoverAnswer,
  DiscoverOptions,
  EntityBeatportHalf,
  EntityKind,
  EntityLink,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { formatCount, pluralize } from "../library/libraryFormat";
import { settingsFocusState } from "../settingsLink";
import { BeatportTable } from "./BeatportTable";
import { HideOwnedSwitch } from "./HideOwnedSwitch";
import { useHideOwned } from "./useHideOwned";
import { PushDialog } from "./PushDialog";
import { beatportRowKey } from "./beatportKey";
import { beatportSelectedId, useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { runActions, type BeatportActionId } from "./beatportActions";
import { ENTITY_COLUMNS, ENTITY_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { entityPath } from "./discoverLinks";
import { pushOutcome, refusalText, resolveOutcome } from "./discoverFormat";
import { NO_ENGINE } from "./discoverTools";
import { beatportHeadline, freshnessLine, nounOf } from "./entityFormat";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";
import { useDiscoverJob } from "./useDiscoverJob";
import { refusalError } from "../../reporting/expected";
import { reportUnexpected } from "../../reporting/reporting";

/** One answer of the half, shaped as a window for `useBeatportWindow`. */
interface HalfPage {
  rows: BeatportTrackRow[];
  total: number;
  half: EntityBeatportHalf;
}

const idOf = (row: BeatportTrackRow) => row.beatport_track_id;

interface BeatportHalfProps {
  kind: EntityKind;
  /** The page's own reference, as the engine answered it. */
  pageRef: string;
  /** For a name several Beatport artists share: who they are (DEC-095). */
  links: readonly EntityLink[];
  /** False while the library half holds the page's selection. */
  active: boolean;
  onActivate: () => void;
  /** A resolve finished: the page may now be known by an id. */
  onResolved: () => void;
}

interface PushNotice {
  text: string;
  url: string | null;
  tone: "success" | "warning";
}

export function BeatportHalf({
  kind,
  pageRef,
  links,
  active,
  onActivate,
  onResolved,
}: BeatportHalfProps) {
  const navigate = useNavigate();
  const { push: notify } = useToast();
  const [owned, setHiding] = useHideOwned();
  const [working, setWorking] = useState(false);
  const [pushing, setPushing] = useState<{ options: DiscoverOptions } | null>(null);
  const [readingOptions, setReadingOptions] = useState(false);
  const [pushNotice, setPushNotice] = useState<PushNotice | null>(null);
  // Set by "Read again": the next request asks Beatport however fresh the copy.
  const refreshNext = useRef(false);

  const windowKey = `${kind}|${pageRef}|${owned}`;
  const fetchHalf = useCallback(
    async (offset: number, limit: number): Promise<DiscoverAnswer<HalfPage>> => {
      const bridge = window.cuepoint?.getEntityBeatport;
      if (!bridge) throw new Error(NO_ENGINE);
      const refresh = refreshNext.current;
      refreshNext.current = false;
      const answer = await bridge({
        kind,
        ref: pageRef,
        owned,
        offset,
        limit,
        ...(refresh ? { refresh: true } : {}),
      });
      if (answer.refusal) return { value: null, refusal: answer.refusal };
      const half = answer.value;
      return {
        value: { rows: half.page?.rows ?? [], total: half.page?.total ?? 0, half },
        refusal: null,
      };
    },
    [kind, owned, pageRef],
  );
  const answersHalf = useCallback(
    (page: HalfPage) => page.half.kind === kind,
    [kind],
  );
  const tracks = useBeatportWindow<BeatportTrackRow, HalfPage>({
    key: windowKey,
    fetch: fetchHalf,
    answers: answersHalf,
  });
  const { reload } = tracks;
  // The last answer for this page, kept while a new filter is asked for, so
  // the toolbar — the checkbox just clicked — does not vanish under the
  // pointer. Another page's answer is never kept.
  const pageKey = `${kind}|${pageRef}`;
  const [lastHalf, setLastHalf] = useState<{ key: string; half: EntityBeatportHalf } | null>(
    null,
  );
  useEffect(() => {
    if (tracks.page) setLastHalf({ key: pageKey, half: tracks.page.half });
  }, [pageKey, tracks.page]);
  const half =
    tracks.page?.half ?? (lastHalf && lastHalf.key === pageKey ? lastHalf.half : null);

  const selection = useBeatportSelection<BeatportTrackRow>({
    key: windowKey,
    idOf,
    getRow: tracks.source.getRow,
    loadedRows: tracks.loadedRows,
  });
  const clearSelection = selection.clear;
  const lastRow = selection.anchorRow;
  useReportSelectedTrack(
    lastRow
      ? {
          id: beatportSelectedId(lastRow.beatport_track_id),
          key: beatportRowKey(lastRow),
          title: lastRow.title,
        }
      : null,
    active,
  );
  // One selection per page: the library half took it.
  useEffect(() => {
    if (!active) clearSelection();
  }, [active, clearSelection]);

  const playlist = useDiscoverJob<BeatportPlaylistResult>((result, finished) => {
    if (result) {
      setPushNotice({
        text: pushOutcome(result),
        url: result.playlist_url,
        tone: result.outcome === "succeeded" ? "success" : "warning",
      });
    } else if (finished.state !== "succeeded") {
      setPushNotice({
        text: finished.error?.message ?? "The playlist was not made.",
        url: null,
        tone: "warning",
      });
    }
  });

  const resolve = useDiscoverJob<BeatportResolveResult>((result, finished) => {
    if (result) {
      notify(resolveOutcome(result), result.outcome === "succeeded" ? "success" : "warning");
    } else if (finished.state !== "succeeded") {
      notify(finished.error?.message ?? "The lookup did not finish.", "warning");
    }
    onResolved();
    reload();
  });

  // The table is drawn only when Beatport answered with tracks, so the token
  // works; what can still stop a push is one already running.
  const actions = useMemo(
    () =>
      runActions(selection.count, {
        pushable: playlist.jobId === null,
        pushReason: playlist.jobId === null ? null : "A Beatport playlist is already being made.",
        total: tracks.total,
      }),
    [playlist.jobId, selection.count, tracks.total],
  );

  const addToWantlist = async () => {
    const bridge = window.cuepoint?.addToWantlist;
    if (!bridge) {
      notify(NO_ENGINE, "warning");
      return;
    }
    setWorking(true);
    try {
      const answer = await bridge({ track_ids: selection.rows.map(idOf) });
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else notify(answer.value.message, "success");
      reload();
    } catch (cause) {
      reportUnexpected(cause);
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
    } finally {
      setWorking(false);
    }
  };

  /** The push dialog needs the engine's default name and limits: read them now. */
  const openPush = async () => {
    const bridge = window.cuepoint?.getDiscoverOptions;
    if (!bridge) {
      notify(NO_ENGINE, "warning");
      return;
    }
    setReadingOptions(true);
    try {
      const answer = await bridge();
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else setPushing({ options: answer.value });
    } catch (cause) {
      reportUnexpected(cause);
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
    } finally {
      setReadingOptions(false);
    }
  };

  /** Every id the half shows, in its order, for a push of the whole list. */
  const everyId = async (options: DiscoverOptions): Promise<number[]> => {
    const bridge = window.cuepoint?.getEntityBeatport;
    if (!bridge) throw new Error(NO_ENGINE);
    const { max_entity_window: limit, max_playlist_tracks: most } = options.limits;
    const found: number[] = [];
    for (let offset = 0; offset <= most; offset += limit) {
      const answer = await bridge({ kind, ref: pageRef, owned, offset, limit });
      if (answer.refusal) throw refusalError(refusalText(answer.refusal), answer.refusal.code);
      const page = answer.value.page;
      if (!page) break;
      found.push(...page.rows.map(idOf));
      if (offset + limit >= page.total) break;
    }
    return found;
  };

  const pushTracks = async (name: string, includeOwned: boolean) => {
    const bridge = window.cuepoint?.startBeatportPlaylistPush;
    if (!bridge || !pushing) throw new Error(NO_ENGINE);
    const trackIds =
      selection.count > 0 ? selection.rows.map(idOf) : await everyId(pushing.options);
    const refused = await playlist.start(() =>
      bridge({ name, include_owned: includeOwned, track_ids: trackIds }),
    );
    if (!refused) {
      setPushing(null);
      setPushNotice(null);
      notify("Making the playlist on Beatport… The status bar shows how far it has got.", "info");
    }
    return refused;
  };

  const startResolve = async () => {
    const bridge = window.cuepoint?.startBeatportResolve;
    if (!bridge) {
      notify(NO_ENGINE, "warning");
      return;
    }
    try {
      const refusal = await resolve.start(() => bridge());
      if (!refusal) return;
      if (
        refusal.code === "DISCOVER_BUSY" &&
        refusal.job_type === "beatport_resolve" &&
        refusal.job_id
      ) {
        resolve.follow(refusal.job_id);
      }
      notify(refusalText(refusal), "warning");
    } catch (cause) {
      reportUnexpected(cause);
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
    }
  };

  const onAction = (id: BeatportActionId) => {
    if (id === "add_to_wantlist") void addToWantlist();
    if (id === "push") void openPush();
    if (id === "open") {
      void openOnBeatport(selection.rows.map((row) => row.url)).then((problem) => {
        if (problem) notify(problem, "warning");
      });
    }
  };

  const readAgain = () => {
    refreshNext.current = true;
    reload();
  };

  const pushBanner = pushNotice && (
    <div
      className={`discover-banner${pushNotice.tone === "warning" ? " discover-banner--warning" : ""}`}
      role="status"
      aria-label="Beatport playlist"
    >
      <span className="discover-banner__text">{pushNotice.text}</span>
      {pushNotice.url && (
        <Button
          variant="secondary"
          onClick={() => {
            const url = pushNotice.url;
            if (!url) return;
            void openOnBeatport([url]).then((problem) => {
              if (problem) notify(problem, "warning");
            });
          }}
        >
          Open the playlist
        </Button>
      )}
      <Button variant="secondary" aria-label="Dismiss" onClick={() => setPushNotice(null)}>
        ×
      </Button>
    </div>
  );

  // --- nothing answered yet, or the engine could not be asked

  if (!half) {
    return (
      <div className="discover-page__beatport-state" role="status">
        {tracks.status === "error" ? (
          <>
            <p className="discover-empty__headline">Beatport's half could not be read.</p>
            <p className="discover-note">{tracks.error}</p>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </>
        ) : (
          <p className="discover-note">Asking Beatport…</p>
        )}
      </div>
    );
  }

  // --- a state standing in for tracks

  if (half.state !== "ok") {
    const shared = half.state === "name_only" && half.reason === "shared";
    return (
      <div
        className="discover-page__beatport-state"
        role="status"
        aria-label="Beatport"
      >
        <p className="discover-empty__headline">{beatportHeadline(half)}</p>
        <p className="discover-note">{half.message}.</p>
        {shared && links.length > 0 && (
          <ul className="discover-page__links" aria-label={`Beatport ${nounOf(kind)}s with this name`}>
            {links.map((link) => (
              <li key={link.ref}>
                <Button variant="secondary" onClick={() => navigate(entityPath(kind, link.ref))}>
                  {link.name ?? `Beatport ${nounOf(kind)} ${link.beatport_id}`}
                </Button>
                <span className="discover-note">
                  {formatCount(link.tracks)} of your tracks
                </span>
              </li>
            ))}
          </ul>
        )}
        {half.action === "settings" && (
          <Button
            variant="secondary"
            onClick={() => navigate("/settings", { state: settingsFocusState("beatport-token") })}
          >
            Open Settings
          </Button>
        )}
        {half.action === "resolve" && (
          <Button
            variant="secondary"
            loading={resolve.jobId !== null}
            onClick={() => void startResolve()}
          >
            Look them up now
          </Button>
        )}
        {(half.state === "rate_limited" || half.state === "unavailable") && (
          <Button variant="secondary" onClick={readAgain}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  // --- tracks

  const page = half.page;
  const freshness = freshnessLine(half);

  return (
    <div className="discover-page__beatport">
      {pushBanner}
      <div className="discover-toolbar" role="toolbar" aria-label="Beatport's releases">
        <HideOwnedSwitch
          hiding={owned === "hide"}
          onChange={setHiding}
        />
        <span className="discover-note" role="status">
          {half.found_by_name ? "Found by name on Beatport. " : ""}
          {page
            ? `${pluralize(page.tracks, "track")} released since ${half.since ?? "—"}${
                page.owned > 0
                  ? ` · ${formatCount(page.owned)} already in your library${owned === "hide" ? " (hidden)" : ""}`
                  : ""
              }`
            : half.message}
        </span>
        {freshness && <span className="discover-note">{freshness}</span>}
        <Button variant="secondary" onClick={readAgain}>
          Check Beatport again
        </Button>
      </div>

      <div
        className="discover-page__beatport-table"
        onMouseDownCapture={() => {
          if (!active) onActivate();
        }}
      >
        <BeatportTable<BeatportTrackRow>
          columns={ENTITY_COLUMNS}
          layoutKey={ENTITY_TABLE_LAYOUT_KEY}
          source={tracks.source}
          selection={selection}
          idOf={idOf}
          actions={actions}
          onAction={onAction}
          label={`Beatport's releases by this ${nounOf(kind)}`}
          summary={pluralize(tracks.total, "track")}
          emptyState={
            <div className="discover-empty">
              {tracks.loading ? (
                <p className="discover-note">Asking Beatport…</p>
              ) : (
                <p className="discover-empty__headline">
                  {owned === "hide" && (page?.tracks ?? 0) > 0
                    ? "Every track released in this window is already in your library."
                    : `Nothing released on Beatport since ${half.since ?? "then"}.`}
                </p>
              )}
            </div>
          }
          resetKey={windowKey}
          busy={working || readingOptions}
        />
      </div>

      {pushing && (
        <PushDialog
          open
          what={
            selection.count > 0
              ? `the ${pluralize(selection.count, "selected track")}`
              : `the ${pluralize(tracks.total, "track")} this table shows`
          }
          defaultName={pushing.options.defaults.playlist_name}
          maxNameLength={pushing.options.limits.max_playlist_name_length}
          onPush={pushTracks}
          onClose={() => setPushing(null)}
        />
      )}
    </div>
  );
}
