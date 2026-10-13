import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { AudioDevice } from "../api/cuepointBridge.types";
import { MoreAbout, Panel } from "../components";
import { Select } from "../components/Select";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { audioFellBack, selectAudio } from "../components/player/playerFormat";
import {
  SYSTEM_DEFAULT_DEVICE,
  saveAudioDevice,
  saveAudioExclusive,
} from "../components/player/playerAudioState";
import { usePlayerValue } from "../components/player/playerStore";
import { reportUnexpected } from "../reporting/reporting";
import "./audio-settings.css";
import { userMessage } from "../api/userMessage";

/**
 * Where the audio actually comes out (PLAYER-11, DEC-055).
 *
 * DEC-005 chose mpv for foobar2000-grade playback, and a high-quality decoder
 * played to whatever device the OS mixer happens to be using, at whatever rate
 * it happens to be running, is not that claim delivered. This panel is what
 * makes it real: the device, and whether CuePoint takes it exclusively.
 *
 * Three things here are deliberate rather than incidental.
 *
 * **The device list is asked for every time the panel opens.** Interfaces are
 * plugged in and unplugged while the app runs, and a cached list offers a
 * device that is not there any more.
 *
 * **The exclusive toggle is disabled with a reason where it does not exist.**
 * Linux has no equivalent of WASAPI exclusive or macOS hog mode, and a control
 * that silently does nothing is worse than one that explains itself.
 *
 * **What is in use is shown next to what was asked for.** Exclusive output can
 * be refused by a device another application is holding, and a chosen interface
 * can be unplugged; the player falls back so the music keeps going, and this
 * says so. A toggle reading "on" while the audio is going out shared is exactly
 * the lie DEC-055 exists to prevent.
 */

/**
 * The list the player answered last, kept for the next time the panel opens (a tiny cache): the
 * panel is drawn with it at once while it asks again, so Settings shown again is not blank. It is
 * still asked every time; this only decides what is on screen meanwhile.
 */
const lastDevices = new WeakMap<object, AudioDevice[]>();

/** The list remembered for this player bridge, if any. */
function remembered(): AudioDevice[] | null {
  const player = window.cuepoint?.player;
  return (player && lastDevices.get(player)) || null;
}

export function AudioSettingsPanel() {
  const audio = usePlayerValue(selectAudio);
  const [devices, setDevices] = useState<AudioDevice[]>(() => remembered() ?? []);
  const [listed, setListed] = useState(() => remembered() !== null);
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, markSaved] = useSavedSignal();

  const bridge = window.cuepoint?.player;
  const available = Boolean(bridge?.setAudioSettings);

  const refresh = useCallback(async () => {
    const player = window.cuepoint?.player;
    if (!player?.audioDevices) return;
    // Only the latest ask may set the list: an older answer that lands late is dropped.
    const mine = ++epoch.current;
    setLoading(true);
    try {
      const result = await player.audioDevices();
      if (mine !== epoch.current) return;
      const found = result.devices ?? [];
      lastDevices.set(player, found);
      setDevices(found);
      setListed(true);
      setError(result.ok ? null : (result.error ?? "Could not read the audio devices."));
    } catch (problem) {
      if (mine !== epoch.current) return;
      reportUnexpected(problem);
      lastDevices.delete(player);
      setListed(false);
      setDevices([]);
      setError(userMessage(problem, "Could not read the audio devices."));
    } finally {
      if (mine === epoch.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = useCallback(
    async (settings: { device?: string; exclusive?: boolean }) => {
      const player = window.cuepoint?.player;
      if (!player?.setAudioSettings) return;
      setBusy(true);
      try {
        const result = await player.setAudioSettings(settings);
        if (!result?.ok) {
          setError(result?.error ?? "Could not change the audio output.");
          return;
        }
        setError(null);
        // Remembered only once main has accepted it, so a refused change is
        // not restored on the next launch.
        if (settings.device !== undefined) saveAudioDevice(settings.device);
        if (settings.exclusive !== undefined) saveAudioExclusive(settings.exclusive);
        markSaved();
      } finally {
        setBusy(false);
      }
    },
    [markSaved],
  );

  // The chosen device may not be in the list: it was unplugged, or the settings
  // were written on another machine. It stays selected — losing the choice
  // because the interface is asleep is worse than showing one that is missing.
  const outputsId = useId();
  const exclusiveId = useId();
  const known = devices.some((device) => device.name === audio.device);
  const fellBack = audioFellBack(audio);

  return (
    <Panel title="Playback" badge={<SavedTick signal={saved} />}>
      <div className="cp-audio-settings">
        <Select
          label="Output device"
          className="cp-audio-settings__field"
          value={audio.device}
          disabled={!available || busy}
          onChange={(event) => void apply({ device: event.target.value })}
          options={[
            { value: SYSTEM_DEFAULT_DEVICE, label: "System default" },
            ...devices
              .filter((device) => device.name !== SYSTEM_DEFAULT_DEVICE)
              .map((device) => ({ value: device.name, label: device.description })),
            ...(!known && audio.device !== SYSTEM_DEFAULT_DEVICE
              ? [{ value: audio.device, label: `${audio.device} (not connected)` }]
              : []),
          ]}
        />
        <p id={outputsId} className="cp-audio-settings__hint">
          {loading && !listed
            ? "Reading the devices this machine has…"
            : available
              ? `${devices.length} ${devices.length === 1 ? "output" : "outputs"} found.`
              : "Open CuePoint as a desktop app to choose an output device."}
        </p>
        {available && !(loading && !listed) && (
          <MoreAbout describedBy={outputsId}>
            <p className="cp-audio-settings__hint">
              If the chosen one is unplugged, CuePoint switches to System default.
            </p>
          </MoreAbout>
        )}

        {/* Where the system has no such mode, the control is not drawn at all. */}
        {audio.exclusiveSupported && (
          <>
            <label className="cp-audio-settings__toggle">
              <input
                type="checkbox"
                checked={audio.exclusive}
                disabled={!available || busy}
                onChange={(event) => void apply({ exclusive: event.target.checked })}
              />
              <span>Exclusive output</span>
            </label>
            <p id={exclusiveId} className="cp-audio-settings__hint">
              Plays straight to your audio interface. Other apps can&apos;t use it meanwhile.
            </p>
            <MoreAbout describedBy={exclusiveId}>
              <p className="cp-audio-settings__hint">
                Leave it off unless you use an audio interface. CuePoint bypasses the system mixer
                (no resampling, no outside volume), and uses shared output if another app already
                has the device.
              </p>
            </MoreAbout>
          </>
        )}

        {fellBack && (
          <p className="cp-audio-settings__fallback" role="status">
            {audio.exclusive && !audio.activeExclusive
              ? "Currently playing through the shared device — exclusive output was not available."
              : "Currently playing through the system default — the selected device was not available."}
          </p>
        )}
        {error && (
          <p className="cp-audio-settings__error" role="status">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
