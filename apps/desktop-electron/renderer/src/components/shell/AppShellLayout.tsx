import type { ReactNode } from "react";
import "./AppShellLayout.css";

export interface AppShellLayoutProps {
  /** Application menu bar. Spans the full width above every other region. */
  menuBar?: ReactNode;
  /** Shell header. Global search moves in here in SHELL-04. */
  header?: ReactNode;
  /** Primary navigation. The sidebar moves in here in SHELL-02. */
  sidebar?: ReactNode;
  /** Track Inspector, docked right. SHELL-05. */
  inspector?: ReactNode;
  /** Player transport. Stays empty until Phase 5, per DEC-025. */
  player?: ReactNode;
  /** Engine and job status strip. SHELL-07. */
  statusBar?: ReactNode;
  /** The routed page. */
  children: ReactNode;
}

/**
 * The application frame: a grid of named regions that later Phase 2 steps fill.
 *
 * Every region except the content area is optional, and an absent region is not
 * rendered at all rather than rendered empty. That is what lets the grid tracks
 * collapse to zero: an empty `auto` track takes no space, but an empty *element*
 * still carries whatever border and padding its class gives it. DEC-025's
 * "occupies no space until Phase 5" player slot depends on this property, so the
 * conditionals are load-bearing, not tidiness.
 *
 * Landmark roles beyond `main` are deliberately absent. `AppMenuBar` already
 * claims `role="banner"`, and a second banner here would be a duplicate
 * landmark; the rest arrive with the content each later step supplies, and
 * SHELL-10 does the accessibility pass over the finished shell.
 *
 * The content element keeps its historical `app-main` class alongside the grid
 * class, because screen styling in `App.css` and `screens.css` is written
 * against `.app-main .screen`. Renaming it would be a much larger change than
 * this step.
 */
export function AppShellLayout({
  menuBar,
  header,
  sidebar,
  inspector,
  player,
  statusBar,
  children,
}: AppShellLayoutProps) {
  return (
    <div className="app-shell">
      {menuBar ? <div className="app-shell__menubar">{menuBar}</div> : null}
      {header ? <div className="app-shell__header">{header}</div> : null}
      {sidebar ? <div className="app-shell__sidebar">{sidebar}</div> : null}
      <main className="app-shell__content app-main">{children}</main>
      {inspector ? <div className="app-shell__inspector">{inspector}</div> : null}
      {player ? <div className="app-shell__player">{player}</div> : null}
      {statusBar ? <div className="app-shell__status">{statusBar}</div> : null}
    </div>
  );
}
