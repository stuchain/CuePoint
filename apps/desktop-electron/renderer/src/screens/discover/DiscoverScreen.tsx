/**
 * The Discover page (DISCOVER-10, DEC-021, DEC-091…DEC-093, FLW-15).
 *
 * Three tabs, the one last used remembered: New search, Results (the past
 * searches) and Wantlist. Everything the page shows is DISCOVER-09's wire:
 * `options` when it opens, the searches and their tracks, the wantlist; every
 * action is one of its routes. It adds surface, not rules. "Run" is the
 * engine's word for a search and is never shown (DSC-2).
 *
 * **Beatport's state is the page's, not a tab's.** With no token, or a token
 * Beatport refused, the page says so once, above the tabs, with a way to
 * Settings — and stays usable: past searches and the wantlist are CuePoint's
 * own (DEC-098). A lookup prompt sits beside it when the library has matched
 * tracks Discover has not read from Beatport yet (DISCOVER-04); the engine
 * also does that lookup by itself when a match finishes (DSC-4).
 *
 * **Rows from Beatport are not library rows**, so the Inspector shows its
 * empty state here rather than the last library track: it must never appear to
 * describe a row it does not.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  BeatportPlaylistRequest,
  BeatportPlaylistResult,
  BeatportResolveResult,
  DiscoverBeatportState,
  DiscoverOptions,
  DiscoverRunRequest,
  DiscoveryRunResult,
} from "../../api/cuepointBridge.types";
import { DISCOVER_OPTIONS, LIBRARY_SUMMARY, useReportReadError, useSharedRead } from "../../api/sharedReads";
import { Button } from "../../components/Button";
import { CloseButton } from "../../components/CloseButton";
import { EmptyState, IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { Hint } from "../../components/Hint";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { Tabs } from "../../components/Tabs";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { useActiveJob } from "../../components/shell/useActiveJob";
import { useToast } from "../../components/Toast";
import { MATCH_ON_BEATPORT, RETRY } from "../../format/words";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { libraryImportState } from "../library/libraryLink";
import { NewRunPanel } from "./NewRunPanel";
import { RunsView } from "./RunsView";
import { WantlistView } from "./WantlistView";
import { beatportNotice, beatportUsable, refusalState, unusableReason } from "./beatportState";
import {
  DISCOVER_SECTIONS,
  loadDiscoverSection,
  saveDiscoverSection,
  type DiscoverSection,
} from "./discoverSections";
import {
  discoverFacts,
  discoveryEnded,
  lookingUpLine,
  pushOutcome,
  refusalText,
  resolveOutcome,
  resolvePrompt,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { BeatportSignInButton } from "./BeatportSignInButton";
import { openOnBeatport } from "./openOnBeatport";
import { useDiscoverJob } from "./useDiscoverJob";
import { reportUnexpected } from "../../reporting/reporting";
import "../screens.css";
import "./discover.css";
import { userMessage } from "../../api/userMessage";

/**
 * What the Inspector says on this page. One element for the page's life, so
 * setting it is not a new value on every render.
 */
const INSPECTOR_EMPTY = (
  <p className="cp-inspector__empty">
    Tracks found on Beatport are not in your library, so there is nothing to inspect here. Select
    a track in the Library to see its details.
  </p>
);

interface PushNotice {
  text: string;
  url: string | null;
  tone: "success" | "warning";
}

export function DiscoverScreen() {
  const { push: toast } = useToast();
  const navigate = useNavigate();
  const [section, setSection] = useState<DiscoverSection>(loadDiscoverSection);
  // A refusal a start met, which is newer than what `options` said.
  const [refused, setRefused] = useState<{
    state: DiscoverBeatportState;
    retryAfter: number | null;
    message: string | null;
  } | null>(null);
  const [runsVersion, setRunsVersion] = useState(0);
  const [pushNotice, setPushNotice] = useState<PushNotice | null>(null);

  // Nothing here describes a track, so a selection elsewhere does not open the panel (K1).
  useInspectorSlot(INSPECTOR_EMPTY, { autoOpen: false });

  // The options come through the shared cache (C19d): a page shown again has
  // them at once, and they are read again when a lookup or a sign-in ends.
  const optionsRead = useSharedRead(DISCOVER_OPTIONS);
  useReportReadError(optionsRead.error);
  // Whether the library itself is empty (nothing imported), which the facets alone cannot say:
  // a library of tracks with no artist or label names is not "no library".
  const summaryRead = useSharedRead(LIBRARY_SUMMARY);
  const libraryEmpty =
    (summaryRead.value as { library_empty?: boolean } | undefined)?.library_empty === true;
  const answer = optionsRead.value;
  // A refusal does not take away the options already shown: the last good ones stay.
  const lastOptions = useRef<DiscoverOptions | null>(null);
  if (answer && !answer.refusal) lastOptions.current = answer.value;
  const options = lastOptions.current;
  const optionsError = optionsRead.unavailable
    ? NO_ENGINE
    : answer?.refusal
      ? refusalText(answer.refusal)
      : optionsRead.error !== undefined && !options
        ? userMessage(optionsRead.error)
        : null;
  // A refusal a start met is older than an answer that arrives after it. Only a new answer
  // says so: this page shown again (its effects run again) with the answer it already had
  // does not.
  const seenAnswer = useRef(answer);
  useEffect(() => {
    if (seenAnswer.current === answer) return;
    seenAnswer.current = answer;
    if (answer && !answer.refusal) setRefused(null);
  }, [answer]);

  const reloadOptions = optionsRead.refresh;

  const state: DiscoverBeatportState = refused?.state ?? options?.beatport.state ?? "ok";
  const notice = options
    ? beatportNotice(
        state,
        refused ? refused.message : options.beatport.message,
        refused ? refused.retryAfter : options.beatport.retry_after,
      )
    : null;

  // --- the three jobs, followed here so they outlive the tab that started them

  const discovery = useDiscoverJob<DiscoveryRunResult>((result, finished) => {
    setRunsVersion((value) => value + 1);
    if (result) {
      toast(discoveryEnded(result), result.outcome === "succeeded" ? "success" : "warning");
    } else if (finished.state !== "succeeded") {
      toast(finished.error?.message ?? "The dig did not finish.", "warning");
    }
  });

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
      toast(resolveOutcome(result), result.outcome === "succeeded" ? "success" : "warning");
    } else if (finished.state !== "succeeded") {
      toast(finished.error?.message ?? "The lookup did not finish.", "warning");
    }
    // Kept beside the cache's own invalidation: the job store only sees a job that outlasts
    // one of its polls (2 s), and a lookup shorter than that would leave the prompt standing.
    reloadOptions();
  });

  // A lookup the engine started on its own (after a Clean match, DSC-4) is
  // followed like one started here, so the banner and the options catch up
  // when it ends. Each job is followed once.
  const activeJobs = useActiveJob().jobs;
  const followedLookups = useRef(new Set<string>());
  const followLookup = resolve.follow;
  useEffect(() => {
    const found = activeJobs.find((job) => job.type === "beatport_resolve");
    if (!found || followedLookups.current.has(found.id)) return;
    followedLookups.current.add(found.id);
    followLookup(found.id);
  }, [activeJobs, followLookup]);

  const startDiscovery = discovery.start;
  const startPush = playlist.start;

  const startRun = useCallback(
    async (request: DiscoverRunRequest) => {
      const bridge = window.cuepoint?.startDiscoveryRun;
      if (!bridge) throw new Error(NO_ENGINE);
      const refusal = await startDiscovery(() => bridge(request));
      const beatport = refusalState(refusal);
      if (refusal && beatport) {
        setRefused({ state: beatport, retryAfter: refusal.retry_after, message: refusal.message });
      }
      // The search is on its way: Results is where it appears (FLW-15).
      if (!refusal) {
        setSection("results");
        saveDiscoverSection("results");
      }
      return refusal;
    },
    [startDiscovery],
  );

  const pushTracks = useCallback(
    async (request: BeatportPlaylistRequest) => {
      const bridge = window.cuepoint?.startBeatportPlaylistPush;
      if (!bridge) throw new Error(NO_ENGINE);
      const refusal = await startPush(() => bridge(request));
      if (!refusal) {
        setPushNotice(null);
        toast("Making the playlist on Beatport… The status bar shows how far it has got.", "info");
      }
      return refusal;
    },
    [startPush, toast],
  );

  const startResolve = async () => {
    const bridge = window.cuepoint?.startBeatportResolve;
    if (!bridge) {
      toast(NO_ENGINE, "warning");
      return;
    }
    try {
      const refusal = await resolve.start(() => bridge());
      if (!refusal) return;
      if (refusal.code === "DISCOVER_BUSY" && refusal.job_type === "beatport_resolve" && refusal.job_id) {
        resolve.follow(refusal.job_id);
      }
      const beatport = refusalState(refusal);
      if (beatport) {
        setRefused({ state: beatport, retryAfter: refusal.retry_after, message: refusal.message });
      }
      toast(refusalText(refusal), "warning");
    } catch (cause) {
      reportUnexpected(cause);
      toast(userMessage(cause), "warning");
    }
  };

  const tools = useMemo<DiscoverTools | null>(
    () =>
      options
        ? {
            options,
            beatportState: state,
            pushing: playlist.jobId !== null,
            push: pushTracks,
            notify: toast,
          }
        : null,
    [options, playlist.jobId, pushTracks, state, toast],
  );

  // A tab is mounted when first opened and kept, so a form half filled in, the dig open in
  // Results, and a wantlist's scroll, sort and selection are still there when it is come back to.
  const [seen, setSeen] = useState<ReadonlySet<DiscoverSection>>(() => new Set([section]));
  useEffect(() => {
    setSeen((previous) => (previous.has(section) ? previous : new Set(previous).add(section)));
  }, [section]);

  const choose = (id: string) => {
    const next = DISCOVER_SECTIONS.find((entry) => entry.id === id)?.id;
    if (!next) return;
    setSection(next);
    saveDiscoverSection(next);
  };

  if (!tools) {
    return (
      <div className="screen screen--stack screen--scroll discover-screen--waiting">
        <ScreenHeader title="Discover" inset />
        {optionsError ? (
          <Notice
            title="Discover could not open"
            action={
              optionsError !== NO_ENGINE ? (
                <Button variant="secondary" onClick={reloadOptions}>
                  {RETRY}
                </Button>
              ) : undefined
            }
          >
            {optionsError}
          </Notice>
        ) : (
          <Loading what="Discover" />
        )}
      </div>
    );
  }

  const toRead = tools.options.resolve.to_read;
  // Nothing imported yet: nothing for a dig to look by, so New dig says so instead of a form.
  const noLibrary = libraryEmpty;
  const looking = resolve.jobId !== null;

  return (
    <div className="screen discover-screen">
      <ScreenHeader
        title="Discover"
        inset
        summary={discoverFacts(tools.options)}
        tabs={
          <Tabs
            tabs={DISCOVER_SECTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
            activeId={section}
            onChange={choose}
          />
        }
      />

      {notice && (
        <div className="discover-banner discover-banner--warning" role="status">
          <div className="discover-banner__text">
            <strong>{notice.headline}</strong>
          </div>
          {notice.action === "signin" ? (
            <BeatportSignInButton
              label={notice.actionLabel}
              hint={notice.hint || undefined}
              onDone={reloadOptions}
            />
          ) : (
            <Hint text={notice.hint || undefined}>
              <Button variant="secondary" onClick={reloadOptions}>
                {notice.actionLabel}
              </Button>
            </Hint>
          )}
        </div>
      )}

      {(toRead > 0 || looking) && beatportUsable(state) && (
        <div className="discover-banner" role="status" aria-label="Beatport lookup">
          <div className="discover-banner__text">
            {looking ? <strong>{lookingUpLine(toRead)}</strong> : <span>{resolvePrompt(toRead)}</span>}
          </div>
          <Button variant="secondary" loading={looking} onClick={() => void startResolve()}>
            {MATCH_ON_BEATPORT}
          </Button>
        </div>
      )}

      {pushNotice && (
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
                  if (problem) toast(problem, "warning");
                });
              }}
            >
              Open the playlist
            </Button>
          )}
          <CloseButton aria-label="Dismiss" onClick={() => setPushNotice(null)} />
        </div>
      )}

      <div className="discover-screen__body">
        {seen.has("new") && (
          <div
            role="tabpanel"
            aria-label="New dig"
            hidden={section !== "new"}
            className="discover-screen__panel"
          >
            {/* With no library the shared empty block leads, and the form stays below it: a dig of
                genre charts needs no library (DISCOVER-10). */}
            {noLibrary && (
              <EmptyState
                icon="discover"
                headline="No library yet"
                description="Discover looks for new music by the artists and labels in your library. Genre charts work without one."
                action={{
                  label: IMPORT_COLLECTION_LABEL,
                  onClick: () => navigate("/library", { state: libraryImportState() }),
                }}
              />
            )}
            <NewRunPanel
              options={tools.options}
              usable={beatportUsable(state)}
              unusableReason={unusableReason(state)}
              signedOut={state === "no_token"}
              busy={discovery.jobId !== null}
              onStart={startRun}
            />
          </div>
        )}
        {seen.has("results") && (
          <div
            role="tabpanel"
            aria-label="Results"
            hidden={section !== "results"}
            className="discover-screen__panel"
          >
            <RunsView
              tools={tools}
              runningJobId={discovery.jobId}
              runsVersion={runsVersion}
              onNewSearch={() => choose("new")}
            />
          </div>
        )}
        {seen.has("wantlist") && (
          <div
            role="tabpanel"
            aria-label="Wantlist"
            hidden={section !== "wantlist"}
            className="discover-screen__panel"
          >
            <WantlistView tools={tools} />
          </div>
        )}
      </div>
    </div>
  );
}
