import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { appVersion } from "../components/AboutDialog";
import { Button, Panel } from "../components";
import type { AppBuildInfo } from "../api/cuepointBridge.types";
import { AudioSettingsPanel } from "./AudioSettingsPanel";
import { BeatportSettingsPanel } from "./BeatportSettingsPanel";
import { ErrorReportingSettingsPanel } from "./ErrorReportingSettingsPanel";
import { ExitClearingSettings } from "./ExitClearingSettings";
import { MotionSettingsPanel } from "./MotionSettingsPanel";
import { RekordboxExportSettingsPanel } from "./RekordboxExportSettingsPanel";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import { WaveformSettingsPanel } from "./WaveformSettingsPanel";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settingsSections";
import { settingsFocus } from "./settingsLink";
import "./screens.css";
import "./settings.css";

/** The Beatport token field's id: what Discover's Settings link focuses. */
export const BEATPORT_TOKEN_FIELD_ID = "settings-beatport-token";

/** The sections' titles, by id, so a section is named once. */
function titleOf(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.title ?? id;
}

/** One section of the page: a region named by its title, with a stable id for the links. */
function Section({ id, children }: { id: SettingsSectionId; children: ReactNode }) {
  return (
    <section id={id} className="settings-page__section" aria-label={titleOf(id)} tabIndex={-1}>
      {children}
    </section>
  );
}

function AboutSection({ onOpenOnboarding }: { onOpenOnboarding?: () => void }) {
  const [build, setBuild] = useState<AppBuildInfo | null>(null);

  useEffect(() => {
    let live = true;
    // The app's own version comes from Electron main (REPORT-07); an older main has none.
    void window.cuepoint
      ?.buildInfo?.()
      .then((info) => {
        if (live) setBuild(info);
      })
      .catch(() => {
        // The desktop version still shows.
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Panel title={titleOf("settings-about")}>
      <div className="settings-page__about">
        <p data-testid="settings-version">CuePoint version {appVersion(build)}</p>
        <div>
          <Button variant="secondary" onClick={() => onOpenOnboarding?.()}>
            Getting started
          </Button>
        </div>
        {/* Phase 16's "Check for updates" takes this place. */}
        <div data-slot="updates" />
      </div>
    </Panel>
  );
}

/**
 * Settings: one page in sections (SET-1). A list of links at the top, or in a
 * left rail where there is room, scrolls to each section. Exporting matches
 * moved to Clean's "Export review list" when Results retired (DEC-071), and the
 * Rekordbox export's section shows where exports go and offers no way to start
 * one (DEC-087).
 */
export function SettingsScreen({
  onOpenPrivacy,
  onOpenOnboarding,
}: {
  onOpenPrivacy?: () => void;
  onOpenOnboarding?: () => void;
} = {}) {
  // Discover's "no token" and "token rejected" states link here, to the token
  // field (DISCOVER-10); Help → Privacy links to the error-reporting switch and
  // to the Privacy section. The Beatport and error-reporting panels focus their
  // own fields once they can; the Privacy link has only a section to reach.
  const location = useLocation();
  const asked = settingsFocus(location);
  const focusToken = asked?.focus === "beatport-token" ? asked.token : null;
  const focusReporting = asked?.focus === "error-reporting" ? asked.token : null;
  // A section a link names is scrolled to: Privacy, and Waveforms (Prepare's
  // "See progress" on a waveform that is not made yet, PRP-12).
  const sectionAsked = asked?.focus === "privacy" || asked?.focus === "waveforms" ? asked.focus : null;
  const sectionToken = sectionAsked ? asked?.token : null;
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!sectionAsked || !sectionToken || scrolledTo.current === sectionToken) return;
    scrolledTo.current = sectionToken;
    document.getElementById(`settings-${sectionAsked}`)?.scrollIntoView?.({ block: "start" });
  }, [sectionAsked, sectionToken]);

  // The links are plain anchors, but a hash router owns the address bar: the
  // click scrolls the section into view and moves focus there, and leaves the
  // address alone.
  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const section = document.getElementById(id);
    section?.scrollIntoView?.({ block: "start" });
    section?.focus({ preventScroll: true });
  };

  return (
    <div className="screen screen--stack screen--scroll settings-page">
      <h1 className="screen__title">Settings</h1>

      <div className="settings-page__layout">
        <nav aria-label="Settings sections" className="settings-page__nav">
          <ul>
            {SETTINGS_SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} onClick={(event) => goTo(event, section.id)}>
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-page__sections">
          <Section id="settings-appearance">
            <ThemeSettingsPanel />
          </Section>

          <Section id="settings-motion">
            <MotionSettingsPanel />
          </Section>

          <Section id="settings-playback">
            <AudioSettingsPanel />
          </Section>

          <Section id="settings-waveforms">
            <WaveformSettingsPanel />
          </Section>

          <Section id="settings-beatport">
            <BeatportSettingsPanel fieldId={BEATPORT_TOKEN_FIELD_ID} focusToken={focusToken} />
          </Section>

          <Section id="settings-rekordbox-export">
            <RekordboxExportSettingsPanel />
          </Section>

          <Section id="settings-privacy">
            <ErrorReportingSettingsPanel onOpenPrivacy={onOpenPrivacy} focusToken={focusReporting}>
              <ExitClearingSettings />
            </ErrorReportingSettingsPanel>
          </Section>

          <Section id="settings-about">
            <AboutSection onOpenOnboarding={onOpenOnboarding} />
          </Section>
        </div>
      </div>
    </div>
  );
}
