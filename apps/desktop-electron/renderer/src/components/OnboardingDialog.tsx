import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { PixelIcon } from "./PixelIcon";
import type { PixelIconName } from "./pixelIcons";
import { NAV_DESTINATIONS } from "./shell/navRegistry";
import { markOnboardingDone, markPhase14NoteSeen } from "./firstRunMemory";
import "./OnboardingDialog.css";

/** The Keys page's line in the guide's last screen; PAGES-16 adjusts it here. */
export const KEYS_PAGE_LINE = "Keys shows the keys of your playlists on the Camelot wheel.";

const PLAY_LINE = "Double-click a track to play it.";
const PREPARE_LINE =
  "Put tracks in the order you will play them. CuePoint suggests what fits next, checks every change of tempo and key, and plays the Set as the queue.";
const BACKGROUND_LINE =
  "The strip at the bottom shows what CuePoint is doing; you can keep working. Activity lists everything it did.";

type Action = "show-export" | "import" | "match";

interface Screen {
  title: string;
  body: string;
  /** The picture, drawn from pixel icons so a theme change cannot leave it stale. */
  picture: PixelIconName[];
  action?: { id: Action; label: string };
}

const SCREENS: Screen[] = [
  {
    title: "Welcome to CuePoint",
    body: "CuePoint keeps your Rekordbox library tidy, finds new music and helps you plan sets. Nothing changes in Rekordbox until you export.",
    picture: ["logo"],
  },
  {
    title: "Get your collection out of Rekordbox",
    body: "In Rekordbox, export your collection as an XML file. CuePoint reads that file.",
    picture: ["library", "chevron-right", "export"],
    action: { id: "show-export", label: "Show me how" },
  },
  {
    title: "Import it",
    body: "CuePoint keeps what it reads as its own library. Nothing in Rekordbox is changed.",
    picture: ["export", "chevron-right", "library"],
    action: { id: "import", label: "Import your Rekordbox collection…" },
  },
  {
    title: "Match your tracks",
    body: "Keys, genres and labels come from Beatport: match your tracks in Clean.",
    picture: ["clean", "chevron-right", "match"],
    action: { id: "match", label: "Match tracks…" },
  },
  {
    title: "Find your way around",
    body: "",
    picture: ["library", "clean", "discover", "prepare", "activity"],
  },
];

/** The last screen: the sidebar's pages with their hints, then how to play and where work shows. */
function Around() {
  const pages = NAV_DESTINATIONS.filter(
    (d) => d.enabled && d.group === "workspace" && !d.parentId && d.id !== "keys",
  );
  return (
    <div className="onboarding-dialog__around">
      <ul className="onboarding-dialog__pages" aria-label="Pages">
        {pages.map((page) => (
          <li key={page.id}>
            <strong>{page.label}</strong> {page.id === "prepare" ? PREPARE_LINE : page.hint}
          </li>
        ))}
        <li>{KEYS_PAGE_LINE}</li>
      </ul>
      <p className="onboarding-dialog__body">{PLAY_LINE}</p>
      <p className="onboarding-dialog__body">{BACKGROUND_LINE}</p>
    </div>
  );
}

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
}

export function OnboardingDialog({
  open,
  covered = false,
  onComplete,
  onShowExport,
  onImport,
  onMatch,
}: OnboardingDialogProps) {
  const [step, setStep] = useState(0);
  // Reopening, from Help or after a close, starts at the first screen (RUN-2). Set while
  // rendering rather than in an effect, so the first frame is already the right one.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const screen = SCREENS[step]!;
  const isLast = step >= SCREENS.length - 1;

  /** Done for good: the guide, and the update note a new user has no use for. */
  const finish = () => {
    markOnboardingDone();
    markPhase14NoteSeen();
    onComplete();
  };

  const act = (id: Action) => {
    if (id === "show-export") {
      onShowExport();
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
      // Wide: the last screen is long, and a wide dialog scrolls its body rather than
      // running past the window.
      size="wide"
      primaryAction={{
        label: isLast ? "Get started" : "Next",
        onClick: () => (isLast ? finish() : setStep((s) => s + 1)),
      }}
      secondaryAction={{ label: "Skip", onClick: finish }}
      backAction={{ label: "Back", onClick: () => setStep((s) => s - 1), disabled: step === 0 }}
    >
      <div className="onboarding-dialog">
        <div
          className={`onboarding-dialog__picture ${isLast ? "onboarding-dialog__picture--small" : ""}`.trim()}
          aria-hidden="true"
        >
          {screen.picture.map((name, index) => (
            <PixelIcon key={`${name}-${index}`} name={name} className="onboarding-dialog__icon" />
          ))}
        </div>
        <h3 className="onboarding-dialog__title">{screen.title}</h3>
        {isLast ? (
          <Around />
        ) : (
          <p className="onboarding-dialog__body">{screen.body}</p>
        )}
        {screen.action && (
          <div className="onboarding-dialog__actions">
            <Button variant="secondary" onClick={() => act(screen.action!.id)}>
              {screen.action.label}
            </Button>
          </div>
        )}
        <div className="onboarding-dialog__foot">
          <p className="onboarding-dialog__step">
            Step {step + 1} of {SCREENS.length}
          </p>
        </div>
      </div>
    </Modal>
  );
}
