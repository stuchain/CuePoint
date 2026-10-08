/**
 * The sections of the Settings page, in the order they appear (SET-1).
 *
 * One list, so the page and its links agree, and so later phases add a section
 * here (Phase 18's Backups goes before About & updates) and tests check the
 * sections by name rather than by count.
 */
export const SETTINGS_SECTIONS = [
  { id: "settings-appearance", title: "Appearance" },
  { id: "settings-motion", title: "Motion" },
  { id: "settings-playback", title: "Playback" },
  { id: "settings-waveforms", title: "Waveforms" },
  { id: "settings-beatport", title: "Beatport" },
  { id: "settings-rekordbox-export", title: "Rekordbox export" },
  { id: "settings-privacy", title: "Privacy" },
  { id: "settings-about", title: "About & updates" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
