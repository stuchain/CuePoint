import { useState } from "react";

import { Button, Panel } from "../components";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { MOTION_GROUPS, type MotionKindId } from "../tokens/motion";
import { useMotion } from "../tokens/MotionContext";
import { ResetToDefaults } from "./ResetToDefaults";
import "./motion-settings.css";

/**
 * Settings → Motion (SET-2): the system's Reduce motion setting, Turn all on
 * and Turn all off, and a switch for each of the ten kinds in three plain
 * groups. Beside each switch a small square moves once when that switch is
 * turned on, so a person sees what it does without leaving the page.
 */
export function MotionSettingsPanel() {
  const { switches, setKind, setAll, reset, systemReduced } = useMotion();
  const [saved, markSaved] = useSavedSignal();
  // How many times each preview has been asked to play; a new count restarts it.
  const [plays, setPlays] = useState<Partial<Record<MotionKindId, number>>>({});

  const play = (ids: MotionKindId[]) =>
    setPlays((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = (prev[id] ?? 0) + 1;
      return next;
    });

  const toggle = (id: MotionKindId, on: boolean) => {
    setKind(id, on);
    if (on) play([id]);
    markSaved();
  };

  const turnAll = (on: boolean) => {
    const turningOn = Object.keys(switches).filter(
      (id) => !switches[id as MotionKindId],
    ) as MotionKindId[];
    setAll(on);
    if (on) play(turningOn);
    markSaved();
  };

  const resetToDefaults = () => {
    const undo = reset();
    markSaved();
    return () => {
      undo();
      markSaved();
    };
  };

  return (
    <Panel title="Motion" badge={<SavedTick signal={saved} />}>
      <div className="motion-settings">
        <p className="motion-settings__system">
          Motion follows your system&apos;s Reduce motion setting: {systemReduced ? "on" : "off"}
          {systemReduced ? ", so nothing moves" : ""}.
        </p>

        <div className="motion-settings__actions">
          <Button variant="secondary" onClick={() => turnAll(true)}>
            Turn all on
          </Button>
          <Button variant="secondary" onClick={() => turnAll(false)}>
            Turn all off
          </Button>
        </div>

        {MOTION_GROUPS.map((group) => (
          <fieldset key={group.title} className="motion-settings__group">
            <legend className="motion-settings__legend">{group.title}</legend>
            {group.kinds.map((kind) => {
              const hintId = `motion-hint-${kind.id}`;
              const count = plays[kind.id] ?? 0;
              return (
                <div key={kind.id} className="motion-settings__row">
                  <span
                    // A new key starts the one move again.
                    key={count}
                    className="motion-settings__preview"
                    data-kind={kind.id}
                    data-play={count > 0 ? "" : undefined}
                    aria-hidden="true"
                  />
                  <div className="motion-settings__text">
                    <label className="motion-settings__label">
                      <input
                        type="checkbox"
                        checked={switches[kind.id]}
                        aria-describedby={hintId}
                        onChange={(e) => toggle(kind.id, e.target.checked)}
                      />
                      <span>{kind.label}</span>
                    </label>
                    <p id={hintId} className="motion-settings__hint">
                      {kind.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </fieldset>
        ))}

        <div className="motion-settings__actions">
          <ResetToDefaults
            section="Motion"
            summary="This turns every kind of motion back on. Motion still follows your system's Reduce motion setting."
            onReset={resetToDefaults}
          />
        </div>
      </div>
    </Panel>
  );
}
