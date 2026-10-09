import { useEffect, useState } from "react";

import type { AppBuildInfo, UpdateState, WhatsNew as WhatsNewNotes } from "../api/cuepointBridge.types";
import { Button } from "../components/Button";
import { WhatsNew } from "../components/updates/WhatsNew";
import { useRestartFlow } from "../components/updates/useRestartFlow";
import { useUpdateState } from "../components/updates/useUpdateState";
import { whenWorkEnds } from "../components/updates/restartStore";
import "./aboutUpdates.css";

/** A test build's version ends in `-test.N`; people are told it is a test version. */
function isTestVersion(version: string | null | undefined): boolean {
  return version !== null && version !== undefined && /-test\.\d+$/.test(version);
}

/** "Last checked 10:42" in the person's own clock, or that it never has. */
function lastCheckedWords(iso: string | null): string {
  if (iso === null) return "Never checked";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "Never checked";
  return `Last checked ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** The state in words, and the second line some states add. */
function stateWords(state: UpdateState | null, installed: boolean | null): { main: string; more?: string } {
  if (state === null) return { main: "Updates are checked in the installed app." };
  switch (state.status) {
    case "idle":
      // A run from source never checks. An installed app has simply not checked yet (the first
      // check comes ten seconds after launch); nothing is said until the build is known.
      if (installed === null) return { main: "" };
      return { main: installed ? (state.lastCheckedAt === null ? "Not checked yet" : "") : "Updates are checked in the installed app." };
    case "checking":
      return { main: "Checking for updates…" };
    case "up-to-date":
      return { main: "You're up to date" };
    case "downloading":
      return { main: `Downloading ${state.version ?? ""}…` };
    case "ready":
      return { main: "Update ready" };
    case "manual":
      return {
        main: `CuePoint ${state.version ?? ""} is out`,
        more:
          state.manualReason === "linux"
            ? "Updates on Linux are installed by hand."
            : "CuePoint can't replace itself from where it is installed. Download the new version.",
      };
    case "failed":
      return {
        main:
          state.error === "download-failed"
            ? "The update didn't download. CuePoint will try again later."
            : state.error === "install-failed"
              ? "The update didn't install. CuePoint will try again later."
              : "Couldn't check for updates. You may be offline.",
      };
  }
}

/** Restart now for a ready update, asking first while work runs (DEC-173). Mounted only when ready. */
function ReadyActions() {
  const flow = useRestartFlow();
  if (flow.waiting) {
    return (
      <div className="about-updates__row">
        <span>{whenWorkEnds(flow.work)}</span>
        <Button variant="secondary" onClick={flow.stopWaiting}>
          Cancel restart
        </Button>
      </div>
    );
  }
  if (flow.confirming) {
    return (
      <div className="about-updates__ask" role="group" aria-label="Restart CuePoint">
        <p>
          {flow.unknown
            ? "CuePoint couldn't tell whether work is still running."
            : `${flow.work ?? "Background work"} is still running.`}
        </p>
        <div className="about-updates__row">
          {!flow.unknown && (
            <Button variant="primary" onClick={flow.restartWhenDone}>
              Restart when done
            </Button>
          )}
          <Button variant="secondary" onClick={flow.restartNow}>
            Restart now
          </Button>
          {/* Focus lands here, so a second Enter on the button that was pressed cannot pick another. */}
          <Button variant="secondary" onClick={flow.cancel} autoFocus>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="about-updates__row">
      <Button variant="primary" onClick={flow.request}>
        Restart now
      </Button>
    </div>
  );
}

/**
 * Settings › About & updates (DIST-07): the build, what the updater is doing in words, the time
 * of the last check, and the buttons that act on it.
 */
export function AboutUpdatesSection() {
  const state = useUpdateState();
  const [build, setBuild] = useState<AppBuildInfo | null>(null);
  const [buildKnown, setBuildKnown] = useState(() => !window.cuepoint?.buildInfo);
  const [notes, setNotes] = useState<WhatsNewNotes | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const bridge = window.cuepoint?.updates;

  useEffect(() => {
    let live = true;
    void window.cuepoint
      ?.buildInfo?.()
      .then((info) => {
        if (live) setBuild(info);
      })
      .catch(() => {
        // The version above still shows.
      })
      .finally(() => {
        if (live) setBuildKnown(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Installed: a packaged build, or an older main that does not say (it has the updater, so it is one).
  const installed = !buildKnown ? null : build ? build.environment === "production" : true;
  const words = stateWords(state, installed);
  const status = state?.status ?? "idle";
  const version = state?.currentVersion ?? build?.version ?? null;
  const checkable = status !== "idle" || installed === true;
  const busy = status === "checking" || status === "downloading";

  return (
    <div className="about-updates">
      {(build || isTestVersion(version)) && (
        <p>
          {build && `Build ${build.dist ?? "not recorded"}`}
          {build && isTestVersion(version) && " · "}
          {isTestVersion(version) && <span>test version</span>}
        </p>
      )}
      <div className="about-updates__state">
        {/* Announced politely. The percentage is beside the words, so it does not repeat them as it moves. */}
        <p className="about-updates__words" aria-live="polite">
          {words.main}
        </p>
        {status === "downloading" && state?.progress != null && (
          <p className="about-updates__percent">{`${Math.round(state.progress)}%`}</p>
        )}
        {words.more && <p className="about-updates__more">{words.more}</p>}
      </div>
      <p className="about-updates__checked">{lastCheckedWords(state?.lastCheckedAt ?? null)}</p>
      {status === "ready" && <ReadyActions />}
      <div className="about-updates__row">
        <Button
          variant="secondary"
          disabled={busy || !checkable}
          onClick={() => void bridge?.check().catch(() => undefined)}
        >
          Check for updates
        </Button>
        {status === "manual" && (
          <Button variant="primary" onClick={() => void bridge?.openReleasePage("update")}>
            Download
          </Button>
        )}
        {bridge && (
          <Button
            variant="secondary"
            onClick={() => {
              void bridge
                .getNotes()
                .then((found) => {
                  setNotes(found);
                  setNotesOpen(true);
                })
                .catch(() => undefined);
            }}
          >
            What's new
          </Button>
        )}
      </div>
      {notes && <WhatsNew notes={notes} open={notesOpen} onClose={() => setNotesOpen(false)} />}
    </div>
  );
}
