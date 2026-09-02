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
 * The Activity panel this opens onto is SHELL-08's job; there is deliberately
 * no button for it yet, because a control that does nothing is worse than one
 * that is not there.
 */
export function StatusStrip() {
  const status = useEngineStatus();
  const { job, activeCount } = useActiveJob();

  const percent = jobPercent(job);
  const connected = status?.connected === true;

  return (
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
                A progress element rather than a styled div: it reports its own
                value to assistive technology, which a bar drawn with CSS width
                does not.
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
    </div>
  );
}
