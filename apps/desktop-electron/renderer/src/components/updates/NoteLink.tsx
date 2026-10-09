import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

/**
 * A link in a release's notes. It has no `href`, so there is nothing for a middle click, a drag
 * or a drop to load into the window: it is a `link` role that hands its address to
 * `updates.openLink`, where main allows GitHub and CuePoint's own site (DIST-07).
 */
export function NoteLink({ href, children }: { href: string; children: ReactNode }) {
  const open = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    void window.cuepoint?.updates?.openLink?.(href)?.catch?.(() => undefined);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      draggable={false}
      className="cp-release-notes__link"
      onClick={open}
      onAuxClick={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") open(event);
      }}
    >
      {children}
    </span>
  );
}
