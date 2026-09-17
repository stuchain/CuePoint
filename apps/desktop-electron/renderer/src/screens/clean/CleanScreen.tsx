/**
 * The Clean page (CLEAN-12, DEC-072).
 *
 * Four parts behind tabs — Review, Missing files, Duplicates and Health — over
 * one read of Library Health they all share. The part last used is where the
 * page reopens (`cleanSections.ts`).
 *
 * Every table here is the Library's `TrackTable` over the Library's windowed
 * browse with a rule set, and every action goes through a route CLEAN-11 built.
 * The page adds surface, not machinery: no second query path, no in-memory
 * results, no rule the engine does not already state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { LibrarySummary } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Panel } from "../../components/Panel";
import { Tabs } from "../../components/Tabs";
import { DuplicatesView } from "./DuplicatesView";
import { HealthView } from "./HealthView";
import { MissingFilesView } from "./MissingFilesView";
import { ReviewView } from "./ReviewView";
import type { CleanOpening } from "./cleanLink";
import {
  CLEAN_SECTIONS,
  loadCleanSection,
  saveCleanSection,
  type CleanSection,
} from "./cleanSections";
import { useCleanHealth } from "./useCleanHealth";
import "../screens.css";
import "./clean.css";

export interface CleanScreenProps {
  /**
   * A track to open in the review queue (CLEAN-13), from the Inspector's link.
   * Applied once per navigation, as the Library's `openWith` is.
   */
  openWith?: CleanOpening | null;
}

export function CleanScreen({ openWith = null }: CleanScreenProps = {}) {
  const navigate = useNavigate();
  const [section, setSection] = useState<CleanSection>(() =>
    openWith ? "review" : loadCleanSection(),
  );
  const opened = useRef<string | null>(null);
  const [focus, setFocus] = useState<CleanOpening | null>(null);

  useEffect(() => {
    if (!openWith || opened.current === openWith.token) return;
    opened.current = openWith.token;
    setSection("review");
    setFocus(openWith);
  }, [openWith]);
  const cleanHealth = useCleanHealth();
  const { reload: reloadHealth } = cleanHealth;
  const [summary, setSummary] = useState<LibrarySummary | null | undefined>(undefined);

  useEffect(() => {
    const bridge = window.cuepoint?.getLibrarySummary;
    if (!bridge) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    bridge()
      .then((payload) => {
        if (!cancelled) setSummary(payload);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(
    (id: string) => {
      const next = CLEAN_SECTIONS.find((entry) => entry.id === id)?.id;
      if (!next) return;
      setSection(next);
      saveCleanSection(next);
      // Counts change with every edit made anywhere, the Library included.
      reloadHealth();
    },
    [reloadHealth],
  );

  if (summary === undefined) {
    return (
      <div className="screen screen--stack clean-screen--waiting">
        <p className="clean-empty__hint">Reading your library…</p>
      </div>
    );
  }

  if (summary && (summary.library_empty || summary.source === null)) {
    return (
      <div className="screen screen--stack screen--scroll clean-screen--waiting">
        <header className="clean-screen__intro">
          <h1 className="screen__title">Clean</h1>
          <p className="screen__subtitle">
            Match your library on Beatport, review what needs a look, and find what needs fixing.
          </p>
        </header>
        <Panel title="No collection imported yet">
          <p className="clean-empty__hint">
            Clean works on your library. Import a Rekordbox collection in the Library first.
          </p>
          <Button onClick={() => navigate("/library")}>Go to the Library</Button>
        </Panel>
      </div>
    );
  }

  const label = CLEAN_SECTIONS.find((entry) => entry.id === section)?.label ?? "";

  return (
    <div className="screen clean-screen">
      <header className="clean-screen__header">
        <h1 className="screen__title">Clean</h1>
        <Tabs
          tabs={CLEAN_SECTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
          activeId={section}
          onChange={choose}
        />
      </header>
      <div className="clean-screen__body" role="tabpanel" aria-label={label}>
        {section === "review" && (
          <ReviewView
            health={cleanHealth.health}
            onHealthChanged={reloadHealth}
            focus={focus}
          />
        )}
        {section === "missing" && (
          <MissingFilesView health={cleanHealth.health} onHealthChanged={reloadHealth} />
        )}
        {section === "duplicates" && (
          <DuplicatesView health={cleanHealth.health} onHealthChanged={reloadHealth} />
        )}
        {section === "health" && (
          <HealthView
            health={cleanHealth.health}
            error={cleanHealth.error}
            loading={cleanHealth.loading}
            onHealthChanged={reloadHealth}
          />
        )}
      </div>
    </div>
  );
}
