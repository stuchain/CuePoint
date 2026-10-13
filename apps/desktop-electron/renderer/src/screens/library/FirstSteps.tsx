/**
 * The first-steps checklist under the empty Library (RUN-3, LIB-2).
 *
 * The guide can be skipped, so the four things it teaches wait here, where the
 * user will be. Each ticks from what the app knows rather than from a click:
 * the library is imported, some track has been looked up on Beatport, a track
 * has been given to the player, a token is saved. When all four are true the
 * list is gone for good (`cuepoint-first-steps-done`). On the empty Library it is the
 * full list; once something is imported it is a small chip beside the Library
 * heading (`FirstStepsNote`, DEC-248) that opens the same list in a popover,
 * so it costs the table no row.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../../components";
import {
  firstStepsDone,
  firstStepsPlayed,
  markFirstStepsDone,
  markFirstStepsPlayed,
} from "../../components/firstRunMemory";
import { useFirstRunProgress } from "../../components/useFirstRunProgress";
import { selectHasPlayed } from "../../components/player/playerFormat";
import { usePlayerValue } from "../../components/player/playerStore";
import "./FirstSteps.css";

interface FirstStepsProps {
  /** True once a collection has been imported. */
  imported: boolean;
  /** Open Clean's match window; offered once there are tracks to match. */
  onMatch: () => void;
  /** Open Settings at the Beatport token. */
  onAddToken: () => void;
  /** Run the import (the header's button does the same); the first step offers it while not done. */
  onImport?: () => void;
  /** Open the Rekordbox export help; the first step offers it while not done, when given. */
  onHowToExport?: () => void;
}

interface Step {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  action?: StepAction;
  /** A quieter second button beside the action. */
  secondary?: StepAction;
}

interface StepAction {
  label: string;
  onClick: () => void;
  /** The step's main button; the rest are secondary. */
  primary?: boolean;
}

interface StepsHandlers {
  onMatch: () => void;
  onAddToken: () => void;
  onImport?: () => void;
  onHowToExport?: () => void;
}

/** The four steps, ticking from real state; the first time all are true, it remembers that. */
function useFirstSteps(imported: boolean, { onMatch, onAddToken, onImport, onHowToExport }: StepsHandlers) {
  const { matchedCount, signedIn } = useFirstRunProgress();
  const matched = (matchedCount ?? 0) > 0;
  const playedNow = usePlayerValue(selectHasPlayed);
  const [playedBefore] = useState(firstStepsPlayed);
  const played = playedNow || playedBefore;

  useEffect(() => {
    if (playedNow) markFirstStepsPlayed();
  }, [playedNow]);

  const steps: Step[] = [
    {
      id: "import",
      label: "Import your Rekordbox collection",
      hint: "In Rekordbox choose File → Export Collection in xml format, then import that file. Nothing in Rekordbox is changed.",
      done: imported,
      action: onImport ? { label: "Import…", onClick: onImport, primary: true } : undefined,
      secondary: onHowToExport ? { label: "How do I export one?", onClick: onHowToExport } : undefined,
    },
    {
      id: "match",
      label: "Match your tracks",
      hint: "Keys, genres and labels come from Beatport: match your tracks in Clean.",
      done: matched,
      action: imported ? { label: "Match tracks…", onClick: onMatch } : undefined,
    },
    {
      id: "play",
      label: "Play a track",
      hint: "Double-click a track to play it.",
      done: played,
    },
    {
      id: "token",
      label: "Sign in to Beatport",
      hint: "Discover uses it to find new music.",
      done: signedIn,
      action: { label: "Sign in to Beatport…", onClick: onAddToken },
    },
  ];

  const allDone = steps.every((step) => step.done);
  useEffect(() => {
    if (allDone) markFirstStepsDone();
  }, [allDone]);
  return { steps, allDone };
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="first-steps__list" aria-label="First steps">
      {steps.map((step) => (
        <li key={step.id} className="first-steps__item" data-done={step.done ? "true" : "false"}>
          <span className="first-steps__tick" aria-hidden="true">
            {step.done ? "✓" : ""}
          </span>
          <div className="first-steps__text">
            <span className="first-steps__label">{step.label}</span>
            <span className="first-steps__state">{step.done ? " (done)" : " (not yet)"}</span>
            <span className="first-steps__hint">{step.hint}</span>
          </div>
          {!step.done && (step.action || step.secondary) && (
            <div className="first-steps__actions">
              {step.action && (
                <Button
                  variant={step.action.primary ? "primary" : "secondary"}
                  onClick={step.action.onClick}
                >
                  {step.action.label}
                </Button>
              )}
              {step.secondary && (
                <Button variant="secondary" onClick={step.secondary.onClick}>
                  {step.secondary.label}
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The full list, on the empty Library. Gone for good once all four were done. */
export function FirstSteps({ imported, ...handlers }: FirstStepsProps) {
  const [hidden] = useState(firstStepsDone);
  if (hidden) return null;
  return <FirstStepsSection imported={imported} {...handlers} />;
}

function FirstStepsSection({ imported, ...handlers }: FirstStepsProps) {
  const { steps, allDone } = useFirstSteps(imported, handlers);
  if (allDone) return null;
  return (
    <section className="first-steps" aria-label="First steps">
      <h2 className="first-steps__heading">First steps</h2>
      <StepList steps={steps} />
    </section>
  );
}

/**
 * The loaded Library's entry, a small chip beside the heading (DEC-248): "First
 * steps 2/4", a button that opens the list in a popover, so the table keeps its rows.
 * Escape and a click outside close it.
 */
export function FirstStepsNote(props: Omit<FirstStepsProps, "imported">) {
  const [hidden] = useState(firstStepsDone);
  if (hidden) return null;
  return <FirstStepsNoteLine {...props} />;
}

function FirstStepsNoteLine({ onMatch, onAddToken }: Omit<FirstStepsProps, "imported">) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) rootRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  const { steps, allDone } = useFirstSteps(true, {
    onMatch: () => {
      close(false);
      onMatch();
    },
    onAddToken: () => {
      close(false);
      onAddToken();
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  if (allDone) return null;
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div ref={rootRef} className="first-steps-note">
      <button
        type="button"
        className="first-steps-chip"
        aria-label={`First steps: ${doneCount} of 4 done`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        First steps {doneCount}/4
      </button>
      {open && (
        <div className="first-steps-note__popover" role="dialog" aria-label="First steps">
          <StepList steps={steps} />
        </div>
      )}
    </div>
  );
}
