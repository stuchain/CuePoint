import { useId, useRef, useState } from "react";

import { Panel } from "../components";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { MOTION_GROUPS, type MotionKindId, type MotionSwitches } from "../tokens/motion";
import { useMotion } from "../tokens/MotionContext";
import { ResetToDefaults } from "./ResetToDefaults";
import { PanelTools, SettingsHint, SettingsStatus } from "./SettingsParts";
import "./motion-settings.css";

/**
 * `system` is every kind on, which the system's reduced-motion setting still wins over (DEC-134);
 * `on` is every kind on whatever the system asks (M435, D23).
 */
type MotionMode = "system" | "on" | "off" | "custom";

/**
 * Settings → Motion (SET-2, K11, M435): one choice, Follow system, On, Off or Custom; Custom shows a
 * switch for each of the ten kinds in three plain groups. Beside each switch a small square moves once
 * when that switch is turned on, so a person sees what it does without leaving the page. The choice
 * is worked out from the switches and the stored Follow system flag: every kind on is Follow system
 * while the flag is set (the system's setting wins while it asks for less motion, DEC-134) and On
 * when it is not, Off is every kind off, and anything else is Custom. Only Follow system and On
 * change the flag, so Custom keeps whichever was chosen last.
 */
export function MotionSettingsPanel() {
  const { switches, setKind, setAll, setSwitches, reset, systemReduced, followSystem, setFollowSystem } =
    useMotion();
  const [saved, markSaved] = useSavedSignal();
  // How many times each preview has been asked to play; a new count restarts it.
  const [plays, setPlays] = useState<Partial<Record<MotionKindId, number>>>({});
  // Custom picked on its own, while no kind differs yet; a change to a kind, On or Off clears it.
  const [pickedCustom, setPickedCustom] = useState(false);
  const values = Object.values(switches);
  const differ = values.some(Boolean) && !values.every(Boolean);
  const allOn = values.every(Boolean);
  const mode: MotionMode =
    pickedCustom || differ ? "custom" : !allOn ? "off" : followSystem ? "system" : "on";
  // The last hand-made set, so On or Off and back to Custom does not lose it. Not stored.
  const lastCustom = useRef<MotionSwitches | null>(null);
  if (differ) lastCustom.current = switches;
  // Custom is the list: it shows while Custom is chosen and not otherwise.
  const listOpen = mode === "custom";
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
      return;
    }
    setPickedCustom(false);
    if (next !== "off") setFollowSystem(next === "system");
    turnAll(next !== "off");
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

  const modes: readonly { mode: MotionMode; label: string }[] = [
    { mode: "system", label: `Follow system (now: ${systemReduced ? "reduced" : "full"})` },
    { mode: "on", label: "On" },
    { mode: "off", label: "Off" },
    { mode: "custom", label: "Custom" },
  ];

  return (
    <Panel
      title="Motion"
      badge={
        <PanelTools
          saved={<SavedTick signal={saved} />}
          reset={<ResetToDefaults section="Motion" onReset={resetToDefaults} atDefaults={mode === "system"} />}
        />
      }
    >
      <div className="motion-settings">
        <SettingsStatus>
          {!systemReduced
            ? "Your system allows animations."
            : followSystem
              ? "Your system is set to reduce animations, so CuePoint keeps still while Follow system is chosen."
              : "Your system is set to reduce animations; CuePoint moves anyway, as you chose."}
        </SettingsStatus>

        <fieldset className="motion-settings__modes" aria-label="Animations">
          {modes.map((option) => (
            <label key={option.mode} className="motion-settings__label settings-check">
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

        <div id={listId} className="motion-settings__list" hidden={!listOpen}>
          {MOTION_GROUPS.map((group) => (
            <fieldset key={group.title} className="motion-settings__group">
              <legend>{group.title}</legend>
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
                      <label className="motion-settings__label settings-check">
                        <input
                          type="checkbox"
                          checked={switches[kind.id]}
                          aria-describedby={hintId}
                          onChange={(e) => toggle(kind.id, e.target.checked)}
                        />
                        <span>{kind.label}</span>
                      </label>
                      <SettingsHint id={hintId}>{kind.description}</SettingsHint>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
    </Panel>
  );
}
