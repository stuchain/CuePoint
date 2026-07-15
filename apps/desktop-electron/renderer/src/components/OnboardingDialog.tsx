import { useState } from "react";
import { Modal } from "./index";
import "./OnboardingDialog.css";

const STORAGE_KEY = "cuepoint-onboarding-complete";

const SCREENS = [
  {
    title: "Welcome to CuePoint",
    body: "Match your Rekordbox library to Beatport tracks, export results, and sync tags back to your collection.",
  },
  {
    title: "Collection XML",
    body: "Export your Rekordbox collection as XML, then open it in inKey. Single playlist or batch mode — your choice.",
  },
  {
    title: "Results & export",
    body: "Review matches on the Results screen, export CSV/JSON/Excel, or sync key/BPM tags with Rekordbox.",
  },
];

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  const screen = SCREENS[step];
  const isLast = step >= SCREENS.length - 1;

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    onComplete();
  };

  return (
    <Modal
      open={open}
      title="Getting started"
      onClose={finish}
      primaryAction={{
        label: isLast ? "Get started" : "Next",
        onClick: () => (isLast ? finish() : setStep((s) => s + 1)),
      }}
      secondaryAction={
        step > 0
          ? { label: "Back", onClick: () => setStep((s) => s - 1) }
          : { label: "Skip tour", onClick: finish }
      }
    >
      <div className="onboarding-dialog">
        <h3 className="onboarding-dialog__title">{screen.title}</h3>
        <p className="onboarding-dialog__body">{screen.body}</p>
        <p className="onboarding-dialog__step">
          Step {step + 1} of {SCREENS.length}
        </p>
      </div>
    </Modal>
  );
}

export function shouldShowOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}
