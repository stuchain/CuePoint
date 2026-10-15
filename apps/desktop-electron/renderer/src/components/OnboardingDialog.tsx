import { useState } from "react";
import { formatCount, pluralize } from "../screens/library/libraryFormat";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { PixelIcon } from "./PixelIcon";
import type { PixelIconName } from "./pixelIcons";
import { markOnboardingDone, markPhase14NoteSeen } from "./firstRunMemory";
import { useFirstRunProgress, type FirstRunProgress } from "./useFirstRunProgress";
import "./OnboardingDialog.css";

type Action = "import" | "match" | "sign-in";

interface Screen {
  title: string;
  body: string;
  /** The picture, drawn from pixel icons so a theme change cannot leave it stale. */
  picture: PixelIconName[];
  action?: { id: Action; label: string; primary?: boolean };
  /** The line that says this step is already done; null until it is. */
  done?: (progress: FirstRunProgress) => string | null;
}

const SCREENS: Screen[] = [
  {
    title: "Welcome to CuePoint",
    body: "Tidies your Rekordbox library, finds new music, plans sets. Rekordbox is never changed until you export.",
    picture: ["logo"],
  },
  {
    title: "Bring in your Rekordbox file",
    body: "In Rekordbox: File → Export Collection in xml format. Then import that file.",
    picture: ["export", "chevron-right", "library"],
    action: { id: "import", label: "Import a Rekordbox file…", primary: true },
    done: ({ trackCount }) =>
      trackCount !== null && trackCount > 0 ? `✓ ${pluralize(trackCount, "track")} imported` : null,
  },
  {
    title: "Match your tracks on Beatport",
    body: "Keys, genres and labels come from Beatport.",
    picture: ["clean", "chevron-right", "match"],
    action: { id: "match", label: "Match tracks…" },
    done: ({ matchedCount }) =>
      matchedCount !== null && matchedCount > 0 ? `✓ ${formatCount(matchedCount)} matched` : null,
  },
  {
    title: "Sign in to Beatport (optional)",
    body: "Discover uses it to find new music.",
    picture: ["discover"],
    action: { id: "sign-in", label: "Sign in to Beatport" },
    done: ({ signedIn }) => (signedIn ? "✓ Signed in" : null),
  },
];

interface OnboardingDialogProps {
  open: boolean;
  /** Another dialog is shown over the guide (Show me how): hide it but keep its place. */
  covered?: boolean;
  /** The guide has gone, finished or not. */
  onComplete: () => void;
  /** Show how to export the collection from Rekordbox. */
  onShowExport: () => void;
  /** Open the Library's import. */
  onImport: () => void;
  /** Open Clean's match window. */
  onMatch: () => void;
  /** Start the Beatport sign-in; the guide stays open and ticks when it lands. */
  onSignIn: () => void;
}

export function OnboardingDialog({
  open,
  covered = false,
  onComplete,
  onShowExport,
  onImport,
  onMatch,
  onSignIn,
}: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  // Reopening, from Help or after a close, starts at the first screen (RUN-2). Set while
  // rendering rather than in an effect, so the first frame is already the right one.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const progress = useFirstRunProgress(open);
  const screen = SCREENS[step]!;
  const doneLine = screen.done?.(progress) ?? null;
  const isLast = step >= SCREENS.length - 1;

  /** Done for good: the guide, and the update note a new user has no use for. */
  const finish = () => {
    markOnboardingDone();
    markPhase14NoteSeen();
    onComplete();
  };

  const act = (id: Action) => {
    if (id === "sign-in") {
      onSignIn();
      return;
    }
    finish();
    if (id === "import") onImport();
    else onMatch();
  };

  return (
    <Modal
      open={open && !covered}
      title="Getting started"
      // Escape and the close button leave without marking it done; a click on the
      // backdrop does nothing (RUN-1, RUN-2).
      onClose={onComplete}
      closeOnBackdrop={false}
      primaryAction={{
        label: isLast ? "Done" : "Next",
        onClick: () => (isLast ? finish() : setStep((s) => s + 1)),
      }}
      extraAction={isLast ? undefined : { label: "Skip", onClick: finish }}
      backAction={{ label: "Back", onClick: () => setStep((s) => s - 1), disabled: step === 0 }}
    >
      <div className="onboarding-dialog">
        <div className="onboarding-dialog__picture" aria-hidden="true">
          {screen.picture.map((name, index) => (
            <PixelIcon key={`${name}-${index}`} name={name} className="onboarding-dialog__icon" />
          ))}
        </div>
        <h3 className="onboarding-dialog__title">{screen.title}</h3>
        <p className="onboarding-dialog__body">{screen.body}</p>
        {doneLine && <p className="onboarding-dialog__done">{doneLine}</p>}
        {screen.action && !(screen.action.id === "sign-in" && progress.signedIn) && (
          <div className="onboarding-dialog__actions">
            <Button
              variant={screen.action.primary ? "primary" : "secondary"}
              onClick={() => act(screen.action!.id)}
            >
              {screen.action.label}
            </Button>
            {screen.action.id === "import" && (
              <Button variant="secondary" size="sm" onClick={onShowExport}>
                How?
              </Button>
            )}
          </div>
        )}
        <div className="onboarding-dialog__foot">
          <div className="onboarding-dialog__dots" role="img" aria-label={`Step ${step + 1} of ${SCREENS.length}`}>
            {SCREENS.map((item, index) => (
              <span
                key={item.title}
                className="onboarding-dialog__dot"
                data-current={index === step ? "true" : "false"}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
