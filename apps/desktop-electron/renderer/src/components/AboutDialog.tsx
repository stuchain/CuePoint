import { useEffect, useState } from "react";
import appIcon from "../assets/cuepoint-icon.png";
import { Modal } from "./index";
import { NoteLink } from "./updates/NoteLink";
import type { AppBuildInfo } from "../api/cuepointBridge.types";
import "./AboutDialog.css";

/** The one sentence that says what CuePoint is: About and Getting started both use it (M445). */
export const TAGLINE = "Tidy your Rekordbox library, find new music and plan sets.";

export const DESKTOP_ENGINE_VERSION = "1.0.0-test.4";

/** The version shown for this app: the build's own, else the desktop version. */
export function appVersion(build: AppBuildInfo | null): string {
  return build?.version ?? DESKTOP_ENGINE_VERSION;
}

/**
 * The one way the version is written (C118): "1.2.3 (build 456)", or just "1.2.3" when this
 * build has told no commit. A label in front of it is the caller's ("Version").
 */
export function versionWords(version: string, build: AppBuildInfo | null): string {
  return build ? `${version} (build ${build.dist ?? "not recorded"})` : version;
}

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [build, setBuild] = useState<AppBuildInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    // The app's own version and build come from Electron main (REPORT-07); an older main has none.
    void window.cuepoint
      ?.buildInfo?.()
      .then((info) => {
        if (live) setBuild(info);
      })
      .catch(() => {
        // About still shows the version.
      });
    return () => {
      live = false;
    };
  }, [open]);

  return (
    <Modal open={open} title="About CuePoint" onClose={onClose} closeLabel="Close">
      <div className="about-dialog">
        <div className="about-dialog__brand">
          <img className="about-dialog__logo" src={appIcon} alt="" draggable={false} />
          <p className="cp-modal__lead about-dialog__tagline">{TAGLINE}</p>
        </div>
        <dl className="cp-facts cp-facts--dialog">
          <dt>Version</dt>
          <dd data-testid="about-version">{versionWords(appVersion(build), build)}</dd>
          {build?.environment === "development" && (
            <>
              <dt>Environment</dt>
              <dd data-testid="about-environment">Development</dd>
            </>
          )}
        </dl>
        <p className="about-dialog__links">
          <NoteLink href="https://usecuepoint.com">Website</NoteLink>
          <NoteLink href="https://github.com/stuchain/CuePoint/blob/main/LICENSE">License</NoteLink>
        </p>
      </div>
    </Modal>
  );
}
