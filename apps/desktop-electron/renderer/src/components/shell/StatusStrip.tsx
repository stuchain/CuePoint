import { useEffect, useState } from "react";
import { ActivityPanel } from "./ActivityPanel";
import { jobLabel, jobPercent, useActiveJob } from "./useActiveJob";
import { useEngineStatus } from "./useEngineStatus";
import "./StatusStrip.css";

/**
 * The shell's status strip (DEC-026).
 *
 * Two things Phase 1 built and nothing displayed: engine state, which was a
 * floating banner read once and never refreshed, and job records, which have
 * been durable since FOUNDATION-07 without ever being shown. Both live here
 * now, in a strip that is always on screen.
 *
 * `EngineStatusBanner` is not rendered alongside this — its markup moved here
 * and the floating banner is gone, so there is one place that reports engine
 * state rather than two that can disagree.
 *
 * Clicking through to the Activity panel is the other half of DEC-026: the
 * strip is the only entry point to a feed that has been recorded since Phase 1
 * and never shown.
 */
export function StatusStrip() {
  const status = useEngineStatus();
  const { job, activeCount } = useActiveJob();
  const [activityOpen, setActivityOpen] = useState(false);

  const percent = jobPercent(job);
  const connected = status?.connected === true;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActivityOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    // The panel is a sibling of the strip, not a child of it. Rendered inside,
    // it inherited the strip's `white-space: nowrap` and every event summary
    // refused to wrap — a dialog silently picking up the styling of whatever
    // happened to render it.
    <>
      <div className="cp-status" role="status" aria-live="polite">
        <span
          className={`cp-status__engine ${
            connected ? "cp-status__engine--ok" : "cp-status__engine--error"
          }`}
        >
          {status === null
            ? "Engine status unknown"
            : connected
              ? `Engine connected${status.version ? ` · v${status.version}` : ""}`
              : `Engine offline${status.error ? `: ${status.error}` : ""}`}
        </span>

        {job ? (
          <span className="cp-status__job">
            <span className="cp-status__job-label">{jobLabel(job)}</span>
            {percent !== null && (
              <>
                {/*
                  A progress element rather than a styled div: it reports its
                  own value to assistive technology, which a bar drawn with CSS
                  width does not.
                */}
                <progress
                  className="cp-status__progress"
                  value={percent}
                  max={100}
                  aria-label="Job progress"
                />
                <span className="cp-status__percent">{percent}%</span>
              </>
            )}
            {activeCount > 1 && (
              <span className="cp-status__more">+{activeCount - 1} more</span>
            )}
          </span>
        ) : (
          <span className="cp-status__idle">No jobs running</span>
        )}

        <button
          type="button"
          className="cp-status__activity"
          onClick={() => setActivityOpen(true)}
        >
          Activity
        </button>
      </div>

      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
    </>
  );
}
