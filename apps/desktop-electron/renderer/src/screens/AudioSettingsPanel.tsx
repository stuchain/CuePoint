import { useCallback, useEffect, useState } from "react";

import type { AudioDevice } from "../api/cuepointBridge.types";
import { Panel } from "../components";
import { audioFellBack, selectAudio } from "../components/player/playerFormat";
import {
  SYSTEM_DEFAULT_DEVICE,
  saveAudioDevice,
  saveAudioExclusive,
} from "../components/player/playerAudioState";
import { usePlayerValue } from "../components/player/playerStore";
import "./audio-settings.css";

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

export function AudioSettingsPanel() {
  const audio = usePlayerValue(selectAudio);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bridge = window.cuepoint?.player;
  const available = Boolean(bridge?.setAudioSettings);

  const refresh = useCallback(async () => {
    const player = window.cuepoint?.player;
    if (!player?.audioDevices) return;
    setLoading(true);
    try {
      const result = await player.audioDevices();
      setDevices(result.devices ?? []);
      setError(result.ok ? null : (result.error ?? "Could not read the audio devices."));
    } catch (problem) {
      setDevices([]);
      setError(problem instanceof Error ? problem.message : "Could not read the audio devices.");
    } finally {
      setLoading(false);
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
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // The chosen device may not be in the list: it was unplugged, or the settings
  // were written on another machine. It stays selected — losing the choice
  // because the interface is asleep is worse than showing one that is missing.
  const known = devices.some((device) => device.name === audio.device);
  const fellBack = audioFellBack(audio);

  return (
    <Panel title="Audio">
      <div className="cp-audio-settings">
        <label className="cp-audio-settings__field">
          <span className="cp-audio-settings__label">Output device</span>
          <select
            className="cp-audio-settings__select"
            value={audio.device}
            disabled={!available || busy}
            onChange={(event) => void apply({ device: event.target.value })}
          >
            <option value={SYSTEM_DEFAULT_DEVICE}>System default</option>
            {devices
              .filter((device) => device.name !== SYSTEM_DEFAULT_DEVICE)
              .map((device) => (
                <option key={device.name} value={device.name}>
                  {device.description}
                </option>
              ))}
            {!known && audio.device !== SYSTEM_DEFAULT_DEVICE && (
              <option value={audio.device}>{audio.device} (not connected)</option>
            )}
          </select>
        </label>
        <p className="cp-audio-settings__hint">
          {loading
            ? "Reading the devices this machine has…"
            : available
              ? `${devices.length} ${devices.length === 1 ? "device" : "devices"} found. Unplugging the selected one falls back to the system default.`
              : "Open CuePoint as a desktop app to choose an output device."}
        </p>

        <label className="cp-audio-settings__toggle">
          <input
            type="checkbox"
            checked={audio.exclusive}
            disabled={!available || busy || !audio.exclusiveSupported}
            onChange={(event) => void apply({ exclusive: event.target.checked })}
          />
          <span>Exclusive output</span>
        </label>
        <p className="cp-audio-settings__hint">
          {audio.exclusiveSupported
            ? "CuePoint takes the device for itself and plays to it directly, bypassing the system mixer — no resampling, no volume applied by anything else. While it is on, other applications cannot use that device, and CuePoint falls back to shared output if something else already has it."
            : "Exclusive output is a Windows and macOS feature. This system has no equivalent, so CuePoint plays through the shared device."}
        </p>

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
