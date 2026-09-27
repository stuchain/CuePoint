/**
 * The Discover page (DISCOVER-10, DEC-021, DEC-091…DEC-093).
 *
 * Runs and the wantlist, behind tabs, the one last used remembered. Everything
 * the page shows is DISCOVER-09's wire: `options` when it opens, the runs and
 * their tracks, the wantlist; every action is one of its routes. It adds
 * surface, not rules.
 *
 * **Beatport's state is the page's, not a tab's.** With no token, or a token
 * Beatport refused, the page says so once, above both tabs, with a way to
 * Settings — and stays usable: past runs and the wantlist are CuePoint's own
 * (DEC-098). A resolve prompt sits beside it when the library has matched
 * tracks Discover has not read from Beatport yet (DISCOVER-04).
 *
 * **Rows from Beatport are not library rows**, so the Inspector shows its
 * empty state here rather than the last library track: it must never appear to
 * describe a row it does not.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { Tabs } from "../../components/Tabs";
import { useToast } from "../../components/Toast";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { settingsFocusState } from "../settingsLink";
import { RunsView } from "./RunsView";
import { WantlistView } from "./WantlistView";
import { beatportNotice, beatportUsable, refusalState } from "./beatportState";
import {
  DISCOVER_SECTIONS,
  loadDiscoverSection,
  saveDiscoverSection,
  type DiscoverSection,
} from "./discoverSections";
import {
  discoveryEnded,
  pushOutcome,
  refusalText,
  resolveOutcome,
  resolvePrompt,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { openOnBeatport } from "./openOnBeatport";
import { useDiscoverJob } from "./useDiscoverJob";
import "../screens.css";
import "./discover.css";

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
  const navigate = useNavigate();
  const { push: toast } = useToast();
  const [section, setSection] = useState<DiscoverSection>(loadDiscoverSection);
  const [options, setOptions] = useState<DiscoverOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsVersion, setOptionsVersion] = useState(0);
  // A refusal a start met, which is newer than what `options` said.
  const [refused, setRefused] = useState<{
    state: DiscoverBeatportState;
    retryAfter: number | null;
    message: string | null;
  } | null>(null);
  const [runsVersion, setRunsVersion] = useState(0);
  const [pushNotice, setPushNotice] = useState<PushNotice | null>(null);

  useInspectorSlot(INSPECTOR_EMPTY);

  useEffect(() => {
    const bridge = window.cuepoint?.getDiscoverOptions;
    if (!bridge) {
      setOptionsError(NO_ENGINE);
      return;
    }
    let current = true;
    void bridge()
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          setOptionsError(refusalText(answer.refusal));
          return;
        }
        setOptions(answer.value);
        setOptionsError(null);
        setRefused(null);
      })
      .catch((cause: unknown) => {
        if (current) setOptionsError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      current = false;
    };
  }, [optionsVersion]);

  const reloadOptions = useCallback(() => setOptionsVersion((value) => value + 1), []);

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
      toast(finished.error?.message ?? "The run did not finish.", "warning");
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
        text: finished.error?.message ?? "The push did not finish.",
        url: null,
        tone: "warning",
      });
    }
  });

  const resolve = useDiscoverJob<BeatportResolveResult>((result, finished) => {
    if (result) {
      toast(resolveOutcome(result), result.outcome === "succeeded" ? "success" : "warning");
    } else if (finished.state !== "succeeded") {
      toast(finished.error?.message ?? "Resolving did not finish.", "warning");
    }
    reloadOptions();
  });

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
        toast("Pushing to Beatport. The status bar shows how far it has got.", "info");
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
      toast(cause instanceof Error ? cause.message : String(cause), "warning");
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

  const choose = (id: string) => {
    const next = DISCOVER_SECTIONS.find((entry) => entry.id === id)?.id;
    if (!next) return;
    setSection(next);
    saveDiscoverSection(next);
  };

  if (!tools) {
    return (
      <div className="screen screen--stack screen--scroll discover-screen--waiting">
        <header>
          <h1 className="screen__title">Discover</h1>
        </header>
        {optionsError ? (
          <Panel title="Discover could not open">
            <p className="discover-note">{optionsError}</p>
            {optionsError !== NO_ENGINE && (
              <Button variant="secondary" onClick={reloadOptions}>
                Try again
              </Button>
            )}
          </Panel>
        ) : (
          <p className="discover-note">Opening Discover…</p>
        )}
      </div>
    );
  }

  const toRead = tools.options.resolve.to_read;
  const label = DISCOVER_SECTIONS.find((entry) => entry.id === section)?.label ?? "";

  return (
    <div className="screen discover-screen">
      <header className="discover-screen__header">
        <h1 className="screen__title">Discover</h1>
        <Tabs
          tabs={DISCOVER_SECTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
          activeId={section}
          onChange={choose}
        />
      </header>

      {notice && (
        <div className="discover-banner discover-banner--warning" role="status">
          <div className="discover-banner__text">
            <strong>{notice.headline}</strong>
            <span>{notice.hint}</span>
          </div>
          {notice.action === "settings" ? (
            <Button
              variant="secondary"
              onClick={() => navigate("/settings", { state: settingsFocusState("beatport-token") })}
            >
              Open Settings
            </Button>
          ) : (
            <Button variant="secondary" onClick={reloadOptions}>
              Try again
            </Button>
          )}
        </div>
      )}

      {toRead > 0 && beatportUsable(state) && (
        <div className="discover-banner" role="status" aria-label="Resolve Beatport identities">
          <span className="discover-banner__text">{resolvePrompt(toRead)}</span>
          <Button
            variant="secondary"
            loading={resolve.jobId !== null}
            onClick={() => void startResolve()}
          >
            Resolve Beatport identities
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
          <Button variant="secondary" aria-label="Dismiss" onClick={() => setPushNotice(null)}>
            ×
          </Button>
        </div>
      )}

      <div className="discover-screen__body" role="tabpanel" aria-label={label}>
        {section === "runs" ? (
          <RunsView
            tools={tools}
            runningJobId={discovery.jobId}
            runsVersion={runsVersion}
            startRun={startRun}
          />
        ) : (
          <WantlistView tools={tools} />
        )}
      </div>
    </div>
  );
}
