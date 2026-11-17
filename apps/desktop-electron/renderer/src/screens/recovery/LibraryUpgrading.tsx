import { useEffect, useRef } from "react";

import appIcon from "../../assets/cuepoint-icon.png";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import "./recovery.css";

const TITLE_ID = "library-upgrading-title";

/**
 * The full-window screen shown instead of the app while the first launch after an update brings
 * the library up to date. It has no buttons: the gate shows the app when the library is ready.
 */
export function LibraryUpgrading() {
  const root = useRef<HTMLDivElement>(null);

  // Focus is on the heading when the screen shows, so a screen reader reads where it is.
  useEffect(() => {
    const heading = root.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.id = TITLE_ID;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, []);

  return (
    <div className="library-recovery" data-state="upgrading" ref={root}>
      <div className="library-recovery__brand">
        <img className="library-recovery__logo" src={appIcon} alt="" draggable={false} />
        <span>CuePoint</span>
      </div>
      <main className="library-recovery__card" aria-busy="true">
        <ScreenHeader title="Getting your library ready…" />
        <p className="library-recovery__text">
          CuePoint was updated, so it is bringing your library up to date. This takes a few seconds, and your tracks, playlists and tags stay as they are.
        </p>
        <p className="library-recovery__text">A backup was made first.</p>
        <div className="library-recovery__progress" role="progressbar" aria-labelledby={TITLE_ID}>
          <div className="library-recovery__progress-bar" />
        </div>
      </main>
    </div>
  );
}
