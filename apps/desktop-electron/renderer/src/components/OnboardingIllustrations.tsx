/**
 * The four small drawings of "Bring in your Rekordbox file" (Getting started, step 2).
 *
 * Plain generic app windows drawn in SVG from the theme's own colours: no screenshots and no
 * branding of any app. Each is 165 wide, the width its tile has in the wide dialog at 1x, so the
 * 11-unit text is drawn at about 11px, larger than the app's own label size.
 */
import type { ReactNode } from "react";
import appIcon from "../assets/cuepoint-icon.png";
import "./OnboardingIllustrations.css";

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <svg className="ob-art" viewBox="0 0 165 120" aria-hidden="true" focusable="false">
      <rect className="ob-win" x="1" y="1" width="163" height="118" />
      <rect className="ob-bar" x="1" y="1" width="163" height="16" />
      <text className="ob-title" x="158" y="12.5" textAnchor="end">
        {title}
      </text>
      {children}
    </svg>
  );
}

/** Greyed lines standing for the app's content. */
function Lines({ x, y, count, wide = 100 }: { x: number; y: number; count: number; wide?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} className="ob-line" x={x} y={y + i * 9} width={i % 2 ? wide * 0.7 : wide} height="4" />
      ))}
    </>
  );
}

function OpenApp() {
  return (
    <Window title="Rekordbox">
      <Lines x={10} y={30} count={7} />
      <rect className="ob-hl" x="40" y="42" width="85" height="34" />
      <text className="ob-on" x="82.5" y="57" textAnchor="middle">
        Open
      </text>
      <text className="ob-on" x="82.5" y="70" textAnchor="middle">
        Rekordbox
      </text>
    </Window>
  );
}

function ExportMenu() {
  return (
    <Window title="Rekordbox">
      <rect className="ob-hl" x="8" y="19" width="26" height="14" />
      <text className="ob-on" x="21" y="29.5" textAnchor="middle">
        File
      </text>
      <text className="ob-muted" x="42" y="29.5">
        Edit
      </text>
      <rect className="ob-menu" x="8" y="34" width="140" height="80" />
      <text className="ob-muted" x="14" y="47">
        Import Collection
      </text>
      <text className="ob-muted" x="14" y="60">
        Library backup
      </text>
      <rect className="ob-hl" x="9" y="66" width="138" height="30" />
      <text className="ob-on" x="14" y="79">
        Export Collection
      </text>
      <text className="ob-on" x="14" y="92">
        in xml format
      </text>
      <text className="ob-muted" x="14" y="109">
        Preferences
      </text>
    </Window>
  );
}

function SaveAs() {
  return (
    <Window title="Save as">
      <rect className="ob-menu" x="8" y="22" width="60" height="64" />
      <text className="ob-muted" x="12" y="35">
        Desktop
      </text>
      <rect className="ob-hl" x="9" y="40" width="58" height="14" />
      <text className="ob-on" x="12" y="50.5">
        Documents
      </text>
      <text className="ob-muted" x="12" y="67">
        Music
      </text>
      <rect className="ob-menu" x="74" y="22" width="82" height="64" />
      <Lines x={80} y={32} count={4} wide={66} />
      <rect className="ob-field" x="8" y="93" width="100" height="16" />
      <text className="ob-fg" x="13" y="104.5">
        rekordbox.xml
      </text>
      <rect className="ob-hl" x="114" y="93" width="42" height="16" />
      <text className="ob-on" x="135" y="104.5" textAnchor="middle">
        Save
      </text>
    </Window>
  );
}

function BackHere() {
  return (
    <Window title="CuePoint">
      <rect className="ob-menu" x="8" y="22" width="34" height="90" />
      <rect className="ob-hl" x="12" y="32" width="26" height="6" />
      <rect className="ob-line" x="12" y="46" width="22" height="4" />
      <rect className="ob-line" x="12" y="58" width="18" height="4" />
      <text className="ob-fg" x="50" y="36">
        Library
      </text>
      <rect className="ob-hl" x="50" y="46" width="107" height="34" />
      <text className="ob-on" x="103.5" y="60" textAnchor="middle">
        Import a Rekordbox
      </text>
      <text className="ob-on" x="103.5" y="73" textAnchor="middle">
        file…
      </text>
      <Lines x={50} y={90} count={2} />
    </Window>
  );
}

/** Step 1: the app's own window, logo and the four pages. */
function WelcomeArt() {
  return (
    <Window title="CuePoint">
      <rect className="ob-menu" x="8" y="22" width="34" height="90" />
      <rect className="ob-hl" x="12" y="32" width="26" height="6" />
      <rect className="ob-line" x="12" y="46" width="22" height="4" />
      <rect className="ob-line" x="12" y="58" width="18" height="4" />
      <rect className="ob-line" x="12" y="70" width="22" height="4" />
      <image className="ob-logo" href={appIcon} x="82" y="24" width="48" height="48" />
      <text className="ob-fg" x="106" y="86" textAnchor="middle">
        Clean · Discover
      </text>
      <text className="ob-fg" x="106" y="99" textAnchor="middle">
        Prepare
      </text>
    </Window>
  );
}

/** Step 3: a list with the Match button. */
function MatchArt() {
  return (
    <Window title="CuePoint">
      <rect className="ob-menu" x="8" y="22" width="34" height="90" />
      <rect className="ob-line" x="12" y="32" width="26" height="4" />
      <rect className="ob-hl" x="12" y="44" width="26" height="6" />
      <rect className="ob-line" x="12" y="58" width="18" height="4" />
      <Lines x={50} y={30} count={3} wide={104} />
      <rect className="ob-hl" x="50" y="68" width="107" height="34" />
      <text className="ob-on" x="103.5" y="82" textAnchor="middle">
        Match on Beatport
      </text>
      <text className="ob-on" x="103.5" y="95" textAnchor="middle">
        keys, genres, labels
      </text>
    </Window>
  );
}

/** Step 4: a sign-in field and button. */
function SignInArt() {
  return (
    <Window title="Beatport">
      <text className="ob-fg" x="82.5" y="38" textAnchor="middle">
        Sign in to Beatport
      </text>
      <rect className="ob-field" x="22" y="50" width="121" height="16" />
      <rect className="ob-field" x="22" y="72" width="121" height="16" />
      <rect className="ob-hl" x="52" y="96" width="61" height="16" />
      <text className="ob-on" x="82.5" y="107.5" textAnchor="middle">
        Sign in
      </text>
    </Window>
  );
}

/** One drawing, in the same window style as the four of step 2. */
export function OnboardingArt({ id }: { id: "welcome" | "match" | "sign-in" }) {
  return (
    <div className="onboarding-dialog__single" aria-hidden="true">
      {id === "welcome" ? <WelcomeArt /> : id === "match" ? <MatchArt /> : <SignInArt />}
    </div>
  );
}

const STEPS: { art: ReactNode; caption: string }[] = [
  { art: <OpenApp />, caption: "Open Rekordbox on your computer." },
  { art: <ExportMenu />, caption: "File menu: Export Collection in xml format." },
  { art: <SaveAs />, caption: "Choose where to save, such as Documents, as rekordbox.xml." },
  { art: <BackHere />, caption: "Back here: Import a Rekordbox file…" },
];

/** The four drawings side by side, each with its numbered caption. */
export function OnboardingDrawings() {
  return (
    <ol className="onboarding-dialog__steps" aria-label="How to export from Rekordbox">
      {STEPS.map((step, index) => (
        <li key={step.caption} className="onboarding-dialog__step">
          <div className="onboarding-dialog__art">{step.art}</div>
          <p className="onboarding-dialog__caption">
            <strong>{index + 1}</strong> {step.caption}
          </p>
        </li>
      ))}
    </ol>
  );
}
