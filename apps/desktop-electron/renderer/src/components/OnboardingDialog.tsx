import { useState } from "react";
import { Modal } from "./index";
import "./OnboardingDialog.css";

const STORAGE_KEY = "cuepoint-onboarding-complete";

const SCREENS = [
  {
    title: "Welcome to CuePoint",
    body: "Browse and organize your Rekordbox library, match it to Beatport, and keep it clean.",
  },
  {
    title: "Import your collection",
    body: "Export your Rekordbox collection as XML, then import it in the Library. A refresh picks up later changes.",
  },
  {
    title: "Clean",
    body: "Match tracks on Beatport, review what needs a look, apply the values you want, and export the review list. Nothing is deleted.",
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
