import { useEffect, useState } from "react";

import type { UpdateState } from "../../api/cuepointBridge.types";
import { UpdateReadyPanel } from "./UpdateReadyPanel";
import { whenWorkEnds } from "./restartStore";
import { useRestartFlow } from "./useRestartFlow";
import { useUpdateState } from "./useUpdateState";
import "./UpdateStatusItem.css";

/** An update that is ready: a button for the panel, and the restart flow behind it. */
function ReadyItem({ state }: { state: UpdateState }) {
  const [open, setOpen] = useState(false);
  const flow = useRestartFlow();
  const version = state.version ?? "";

  // Choosing to restart when the work ends closes the panel; the item then says what it waits for.
  useEffect(() => {
    if (flow.waiting) setOpen(false);
  }, [flow.waiting]);

  return (
    <>
      <button type="button" className="cp-update-item__button" onClick={() => setOpen(true)}>
        {flow.waiting ? whenWorkEnds(flow.work) : `CuePoint ${version} is ready`}
      </button>
      <UpdateReadyPanel open={open} state={state} flow={flow} onClose={() => setOpen(false)} />
    </>
  );
}

/** A version to download by hand: a button for the panel with its Download. */
function ManualItem({ state }: { state: UpdateState }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cp-update-item__button" onClick={() => setOpen(true)}>
        {`CuePoint ${state.version ?? ""} is out`}
      </button>
      <UpdateReadyPanel open={open} state={state} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * The quiet update item in the status strip (DIST-07, DEC-171). Nothing shows while idle,
 * checking, up to date or after a failure; a download is a line of status text; a ready update
 * (or one to fetch by hand) is a button that opens its notes. Keyed by state, so each arrival
 * plays the strip's feedback motion once, and changes are announced politely.
 */
export function UpdateStatusItem() {
  const state = useUpdateState();
  if (!state) return null;
  const { status } = state;
  const shown = status === "downloading" || status === "ready" || status === "manual";
  const percent = status === "downloading" && state.progress !== null ? `${Math.round(state.progress)}%` : null;

  return (
    <>
      {/*
        One live region that stays put while the item inside it changes, so a screen reader hears each
        arrival. Its words do not change as the download moves; the percentage sits beside it, unannounced.
      */}
      <span className="cp-update-live" aria-live="polite">
        {shown && (
          <span key={status} className="cp-update-item">
            {status === "downloading" ? (
              <span className="cp-update-item__text">{`Downloading CuePoint ${state.version ?? ""}…`}</span>
            ) : status === "ready" ? (
              <ReadyItem state={state} />
            ) : (
              <ManualItem state={state} />
            )}
          </span>
        )}
      </span>
      {percent && <span className="cp-update-item__percent">{percent}</span>}
    </>
  );
}
