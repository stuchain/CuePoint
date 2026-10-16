import { useId, useState } from "react";
import { formatCount, pluralize } from "../screens/library/libraryFormat";
import { Button } from "./Button";
import { Modal } from "./Modal";
import appIcon from "../assets/cuepoint-icon.png";
import { MATCH_ON_BEATPORT } from "../format/words";
import { OnboardingDrawings } from "./OnboardingIllustrations";
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
  picture?: PixelIconName[];
  /** The real CuePoint logo, drawn crisp, in place of the icon picture. */
  logo?: boolean;
  /** The four drawings of the export, side by side (step 2); the dialog is wide for them. */
  steps?: boolean;
  /** Why the action cannot be used yet, while it cannot. */
  needs?: (progress: FirstRunProgress) => string | null;
  action?: { id: Action; label: string; primary?: boolean };
  /** The line that says this step is already done; null until it is. */
  done?: (progress: FirstRunProgress) => string | null;
}

const SCREENS: Screen[] = [
  {
    title: "Welcome to CuePoint",
    body: "Tidies your Rekordbox library, finds new music, plans sets. Rekordbox is never changed until you export.",
    logo: true,
  },
  {
    title: "Bring in your Rekordbox file",
    body: "Export your collection from Rekordbox, then import that file here. Nothing in Rekordbox is changed.",
    steps: true,
    action: { id: "import", label: "Import a Rekordbox file…", primary: true },
    done: ({ trackCount }) =>
      trackCount !== null && trackCount > 0 ? `✓ ${pluralize(trackCount, "track")} imported` : null,
  },
  {
    title: "Match your tracks on Beatport",
    body: "After importing: keys, genres and labels come from Beatport.",
    picture: ["clean", "chevron-right", "match"],
    action: { id: "match", label: `${MATCH_ON_BEATPORT}…` },
    // Only a library known to be empty holds it back; while the count is unknown the button works.
    needs: ({ trackCount }) => (trackCount === 0 ? "Import a Rekordbox file first (step 2)." : null),
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
  const needsLine = screen.needs?.(progress) ?? null;
  const needsId = useId();
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
      size={screen.steps ? "wide" : "default"}
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
        {screen.logo && (
          <div className="onboarding-dialog__picture" aria-hidden="true">
            <img src={appIcon} alt="" className="onboarding-dialog__logo" />
          </div>
        )}
        {screen.picture && (
          <div className="onboarding-dialog__picture" aria-hidden="true">
            {screen.picture.map((name, index) => (
              <PixelIcon key={`${name}-${index}`} name={name} className="onboarding-dialog__icon" />
            ))}
          </div>
        )}
        <h3 className="onboarding-dialog__title">{screen.title}</h3>
        <p className="onboarding-dialog__body">{screen.body}</p>
        {screen.steps && <OnboardingDrawings />}
        {doneLine && <p className="onboarding-dialog__done">{doneLine}</p>}
        {screen.action && !(screen.action.id === "sign-in" && progress.signedIn) && (
          <div className="onboarding-dialog__actions">
            <Button
              variant={screen.action.primary ? "primary" : "secondary"}
              disabled={Boolean(needsLine)}
              aria-describedby={needsLine ? needsId : undefined}
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
        {needsLine && screen.action && <p id={needsId} className="onboarding-dialog__needs">
            {needsLine}
          </p>}
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
