import { useId, useRef, useState } from "react";

import { Button, Panel } from "../components";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { MOTION_GROUPS, type MotionKindId, type MotionSwitches } from "../tokens/motion";
import { useMotion } from "../tokens/MotionContext";
import { ResetToDefaults } from "./ResetToDefaults";
import "./motion-settings.css";

type MotionMode = "on" | "off" | "custom";

const MODES: readonly { mode: MotionMode; label: string }[] = [
  { mode: "on", label: "On" },
  { mode: "off", label: "Off" },
  { mode: "custom", label: "Custom" },
];

/**
 * Settings → Motion (SET-2, K11): the system's Reduce motion setting, one On,
 * Off or Custom choice, and behind "Choose each kind…" a switch for each of the
 * ten kinds in three plain groups. Beside each switch a small square moves once
 * when that switch is turned on, so a person sees what it does without leaving
 * the page. The choice is worked out from the switches, not stored: On is every
 * kind on (the system's Reduce motion still wins, DEC-134), Off is every kind
 * off, and anything else is Custom.
 */
export function MotionSettingsPanel() {
  const { switches, setKind, setAll, setSwitches, reset, systemReduced } = useMotion();
  const [saved, markSaved] = useSavedSignal();
  // How many times each preview has been asked to play; a new count restarts it.
  const [plays, setPlays] = useState<Partial<Record<MotionKindId, number>>>({});
  // Custom picked on its own, while no kind differs yet; a change to a kind, On or Off clears it.
  const [pickedCustom, setPickedCustom] = useState(false);
  const values = Object.values(switches);
  const differ = values.some(Boolean) && !values.every(Boolean);
  const mode: MotionMode = pickedCustom || differ ? "custom" : values.every(Boolean) ? "on" : "off";
  // The last hand-made set, so On or Off and back to Custom does not lose it. Not stored.
  const lastCustom = useRef<MotionSwitches | null>(null);
  if (differ) lastCustom.current = switches;
  // Closed unless the page loads on Custom; not remembered.
  const [listOpen, setListOpen] = useState(mode === "custom");
  const listId = useId();

  const play = (ids: MotionKindId[]) =>
    setPlays((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = (prev[id] ?? 0) + 1;
      return next;
    });

  const toggle = (id: MotionKindId, on: boolean) => {
    // From here the switches decide the choice.
    setPickedCustom(false);
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

  const choose = (next: MotionMode) => {
    if (next === "custom") {
      // Changes no switch unless a hand-made set was left behind; it shows the list to choose from.
      if (mode !== "custom" && lastCustom.current) {
        setSwitches(lastCustom.current);
        markSaved();
      } else {
        setPickedCustom(true);
      }
      setListOpen(true);
      return;
    }
    setPickedCustom(false);
    turnAll(next === "on");
  };

  const resetToDefaults = () => {
    const undo = reset();
    setPickedCustom(false);
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

        <fieldset className="motion-settings__modes">
          <legend className="motion-settings__legend">
            Motion
          </legend>
          {MODES.map((option) => (
            <label key={option.mode} className="motion-settings__label">
              <input
                type="radio"
                name="motion-mode"
                value={option.mode}
                checked={mode === option.mode}
                onChange={() => choose(option.mode)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="motion-settings__actions">
          <Button
            variant="secondary"
            aria-expanded={listOpen}
            aria-controls={listId}
            onClick={() => setListOpen((open) => !open)}
          >
            Choose each kind…
          </Button>
        </div>

        <div id={listId} className="motion-settings__list" hidden={!listOpen}>
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
        </div>

        <div className="motion-settings__actions">
          <ResetToDefaults
            section="Motion"
            onReset={resetToDefaults}
          />
        </div>
      </div>
    </Panel>
  );
}
