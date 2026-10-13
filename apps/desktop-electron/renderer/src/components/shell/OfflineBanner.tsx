import { useEffect, useRef, useState } from "react";
import { refreshEngineStatus, useEngineOnline } from "../../api/engineOnline";
import { Button } from "../Button";
import "./OfflineBanner.css";

/** How many times the supervisor restarts the process by itself before it gives up. */
const AUTO_RESTARTS = 3;

/** How long the banner draws the eye after a blocked click. */
const PULSE_MS = 600;

interface OfflineBannerProps {
  /** Opens the help dialog; without it the "Get help…" button is left out. */
  onGetHelp?: () => void;
  /** Goes up by one each time a click on the dimmed page was stopped. */
  pulse?: number;
}

/** "09:05", local time, 24 hours. */
function clock(at: number): string {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * The one banner above the page when CuePoint's background process stops.
 *
 * Reads the shared online store (`api/engineOnline.ts`), so it appears when a
 * call fails or the poll notices, whichever comes first, and goes when a poll
 * finds the process back. It owns the restart button: the status strip only
 * reports.
 */
export function OfflineBanner({ onGetHelp, pulse = 0 }: OfflineBannerProps) {
  const { status, offline, lastOkAt } = useEngineOnline();
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  // A pulse is a change in the count, not its value: the first render is not one.
  const lastPulse = useRef(pulse);
  useEffect(() => {
    if (pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  // Once it is back, a later stop is a new story. A restart that returned is over only when
  // the page has seen it back, so the "stopped" words do not flash in between.
  useEffect(() => {
    if (!offline) {
      setFailed(false);
      setRestarting(false);
    }
  }, [offline]);

  if (!offline) return null;

  const restart = window.cuepoint?.restartEngine;
  const startAgain = async () => {
    if (!restart) return;
    setFailed(false);
    setRestarting(true);
    try {
      const next = await restart();
      if (next.connected) refreshEngineStatus();
      else {
        setFailed(true);
        setRestarting(false);
      }
    } catch {
      setFailed(true);
      setRestarting(false);
    }
  };

  const starting = restarting || status?.reconnecting === true || status?.starting === true;
  const attempt = status?.reconnecting && status.restartAttempts ? status.restartAttempts : null;

  let text: string;
  let action: "restart" | "help" | null = null;
  if (starting) {
    text = `Starting it again…${attempt ? ` (${attempt} of ${AUTO_RESTARTS})` : ""}`;
  } else if (failed) {
    text = "CuePoint couldn't start its background process. Quit and open CuePoint again.";
    action = onGetHelp ? "help" : null;
  } else {
    text = "CuePoint stopped working in the background. Your library and files are safe.";
    action = restart ? "restart" : null;
  }

  return (
    <div className="cp-offline" data-pulse={pulsing ? "" : undefined}>
      <div className="cp-offline__text" role="alert">
        <span>{text}</span>
        {lastOkAt !== null && <span className="cp-offline__time">Last loaded {clock(lastOkAt)}</span>}
      </div>
      {action === "restart" && (
        <Button size="sm" onClick={() => void startAgain()}>
          Start it again
        </Button>
      )}
      {action === "help" && (
        <Button size="sm" onClick={onGetHelp}>
          Get help…
        </Button>
      )}
    </div>
  );
}
