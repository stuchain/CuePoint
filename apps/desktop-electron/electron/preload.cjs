const { contextBridge, ipcRenderer, webUtils } = require("electron");

/**
 * Electron hands a rejected `invoke` back as
 * "Error invoking remote method '<channel>': Error: <message>". The message is
 * the engine's, written for a person — "bpm must be between 20 and 300" — and
 * the rest is plumbing. Every method's rejection is given its own words back
 * (CLEAN-13), so a refusal shown beside a field reads as the engine said it.
 */
const REMOTE_PREFIX = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/;

/**
 * An engine error's status, code and report id ride at the end of its message,
 * after this marker, because Electron rebuilds a rejected `invoke` from the
 * message alone (REPORT-04, DEC-126). Keep equal to `BRIDGE_ERROR_MARKER` in
 * `bridgeError.ts`.
 */
const ERROR_MARKER = "\u0000cuepoint-error:";

/** What an error that did not come from the engine says about itself. */
const NO_FIELDS = { status: null, code: null, reportId: null };

function fieldsFrom(text) {
  try {
    const raw = JSON.parse(text);
    return {
      status: typeof raw.status === "number" ? raw.status : null,
      code: typeof raw.code === "string" ? raw.code : null,
      reportId: typeof raw.reportId === "string" ? raw.reportId : null,
    };
  } catch {
    return NO_FIELDS;
  }
}

/**
 * The fields of the engine errors that crossed lately, by their words.
 *
 * `contextBridge` rebuilds an Error in the page from its message alone: `status`,
 * `code`, `reportId`, `name` and `cause` are all dropped (checked in Electron 34), so
 * the properties set below reach a page only where nothing is bridged. This is the
 * way the page gets them: `engineErrorFields(error.message)`. The newest error with
 * those words wins, so two failures with the same words at the same moment can swap
 * their ids; the words of an engine error name a status, so that is rare and harmless.
 */
const MAX_REMEMBERED = 50;
const recentFields = new Map();

function remember(words, fields) {
  recentFields.delete(words);
  recentFields.set(words, fields);
  if (recentFields.size > MAX_REMEMBERED) recentFields.delete(recentFields.keys().next().value);
}

/**
 * The error as the renderer reads it: the engine's words as `message`, and
 * `status`, `code` and `reportId` (null when the error has none).
 */
function engineWords(error) {
  if (error instanceof Error && REMOTE_PREFIX.test(error.message)) {
    const text = error.message.replace(REMOTE_PREFIX, "");
    const at = text.indexOf(ERROR_MARKER);
    if (at === -1) {
      // These words are no longer an engine error's: forget any earlier one's fields.
      recentFields.delete(text);
      return Object.assign(new Error(text), NO_FIELDS);
    }
    const words = text.slice(0, at);
    const fields = fieldsFrom(text.slice(at + ERROR_MARKER.length));
    remember(words, fields);
    return Object.assign(new Error(words), fields);
  }
  return error;
}

/** The same API, with every promise's rejection in the engine's words. */
function withEngineWords(api) {
  const wrapped = {};
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === "function") {
      wrapped[name] = (...args) => {
        const result = value(...args);
        return result && typeof result.then === "function"
          ? result.catch((error) => {
              throw engineWords(error);
            })
          : result;
      };
    } else if (value && typeof value === "object") {
      wrapped[name] = withEngineWords(value);
    } else {
      wrapped[name] = value;
    }
  }
  return wrapped;
}

/**
 * The renderer's error reporter reaches Electron main through this, and
 * through nothing else (REPORT-06, DEC-126, DEC-127, DEC-128).
 *
 * `@sentry/electron`'s renderer SDK looks for `window.__SENTRY_IPC__`, which its
 * own preload would set. This is that bridge cut down to what a report needs:
 *
 * - `sendEnvelope` forwards an envelope only when every item in it is an error
 *   `event`. Main passes an event through its `beforeSend` (the choice, then the
 *   scrubber); it passes every other kind (sessions, replay, spans, client
 *   reports) to Sentry as it is, so they never leave the page.
 * - `sendFeedback` forwards one feedback item, and only while the choice is on:
 *   main sends feedback without its `beforeSend`.
 * - Scope, status, log and metric updates are dropped. Each reaches main's scope
 *   or Sentry unscrubbed.
 *
 * The channel names are the SDK's own (namespace `sentry-ipc`), which main
 * registers in its Classic IPC mode.
 */
const SENTRY_START_CHANNEL = "sentry-ipc.start";
const SENTRY_ENVELOPE_CHANNEL = "sentry-ipc.envelope";
const SENTRY_FEEDBACK_CHANNEL = "sentry-ipc.feedback";

/**
 * The `type` of each item in an envelope (a string or bytes), read exactly as
 * `parseEnvelope` in @sentry/core reads it, because main parses the same bytes with it: a
 * header line, then for each item a header line followed by either `length` bytes (a
 * truthy numeric `length`) or one line of JSON. Every JSON line is parsed. Answers null for
 * anything that does not read cleanly, or that holds a binary item, which no error event or
 * feedback ever has.
 */
function envelopeItemTypes(envelope) {
  try {
    let buffer = typeof envelope === "string" ? new TextEncoder().encode(envelope) : envelope;
    if (!(buffer instanceof Uint8Array)) return null;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const readBinary = (length) => {
      const bin = buffer.subarray(0, length);
      buffer = buffer.subarray(length + 1);
      return bin;
    };
    const readJson = () => {
      let i = buffer.indexOf(10);
      if (i < 0) i = buffer.length;
      return JSON.parse(decoder.decode(readBinary(i)));
    };
    const header = readJson();
    if (typeof header !== "object" || header === null) return null;
    const types = [];
    while (buffer.length) {
      const itemHeader = readJson();
      if (typeof itemHeader !== "object" || itemHeader === null || typeof itemHeader.type !== "string") return null;
      const binaryLength = typeof itemHeader.length === "number" ? itemHeader.length : undefined;
      if (binaryLength) return null;
      readJson();
      types.push(itemHeader.type);
    }
    return types;
  } catch {
    return null;
  }
}

function onlyTypes(envelope, allowed) {
  const types = envelopeItemTypes(envelope);
  return types !== null && types.length > 0 && types.every((type) => allowed.includes(type));
}

contextBridge.exposeInMainWorld("__SENTRY_IPC__", {
  "sentry-ipc": {
    sendRendererStart: () => ipcRenderer.send(SENTRY_START_CHANNEL),
    sendEnvelope: (envelope) => {
      if (onlyTypes(envelope, ["event"])) ipcRenderer.send(SENTRY_ENVELOPE_CHANNEL, envelope);
    },
    sendFeedback: async (envelope) => {
      if (!onlyTypes(envelope, ["feedback"])) return {};
      const state = await ipcRenderer.invoke("errorReporting:get");
      if (!state || state.enabled !== true) return {};
      return ipcRenderer.invoke(SENTRY_FEEDBACK_CHANNEL, envelope);
    },
    sendScope: () => {},
    sendStatus: () => {},
    sendStructuredLog: () => {},
    sendMetric: () => {},
  },
});

contextBridge.exposeInMainWorld("cuepoint", withEngineWords({
  // The status, code and report id of an engine error the page caught, by its
  // message (REPORT-04). Null for any other error. See `recentFields`.
  engineErrorFields: (message) => {
    const fields = recentFields.get(message);
    return fields ? { ...fields } : null;
  },
  getEngineStatus: () => ipcRenderer.invoke("engine:status"),
  restartEngine: () => ipcRenderer.invoke("engine:restart"),
  searchLibrary: (params) => ipcRenderer.invoke("engine:searchLibrary", params),
  browseLibrary: (params) => ipcRenderer.invoke("engine:browseLibrary", params),
  getLibraryPlaylists: () => ipcRenderer.invoke("engine:getLibraryPlaylists"),
  getLibraryFacet: (params) => ipcRenderer.invoke("engine:getLibraryFacet", params),
  getLibraryFilterFields: () => ipcRenderer.invoke("engine:getLibraryFilterFields"),
  getLibraryTrack: (params) => ipcRenderer.invoke("engine:getLibraryTrack", params),
  // A track's artwork (CLEAN-09). The engine's JPEG bytes become an object URL
  // here, so the renderer draws an image without a path, a custom protocol or
  // the bytes crossing into its own code. The URL holds the image in memory
  // until it is released.
  getTrackArtwork: async (params) => {
    const bytes = await ipcRenderer.invoke("engine:getTrackArtwork", params);
    if (!bytes) return null;
    return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  },
  releaseTrackArtwork: (url) => {
    if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
  },

  // CuePoint's own organization (ORG-08).
  getCollections: () => ipcRenderer.invoke("engine:getCollections"),
  getCollectionEntries: (params) =>
    ipcRenderer.invoke("engine:getCollectionEntries", params),
  createCollection: (params) =>
    ipcRenderer.invoke("engine:createCollection", params),
  renameCollection: (params) =>
    ipcRenderer.invoke("engine:renameCollection", params),
  moveCollection: (params) =>
    ipcRenderer.invoke("engine:moveCollection", params),
  deleteCollection: (params) =>
    ipcRenderer.invoke("engine:deleteCollection", params),
  previewCollectionDelete: (params) =>
    ipcRenderer.invoke("engine:previewCollectionDelete", params),
  addTracksToCollection: (params) =>
    ipcRenderer.invoke("engine:addTracksToCollection", params),
  insertTrackInCollection: (params) =>
    ipcRenderer.invoke("engine:insertTrackInCollection", params),
  removeCollectionEntries: (params) =>
    ipcRenderer.invoke("engine:removeCollectionEntries", params),
  reorderCollectionEntry: (params) =>
    ipcRenderer.invoke("engine:reorderCollectionEntry", params),
  saveSmartCollection: (params) =>
    ipcRenderer.invoke("engine:saveSmartCollection", params),
  updateSmartCollection: (params) =>
    ipcRenderer.invoke("engine:updateSmartCollection", params),
  duplicateSmartCollection: (params) =>
    ipcRenderer.invoke("engine:duplicateSmartCollection", params),
  freezeSmartCollection: (params) =>
    ipcRenderer.invoke("engine:freezeSmartCollection", params),
  getTags: () => ipcRenderer.invoke("engine:getTags"),
  createTag: (params) =>
    ipcRenderer.invoke("engine:createTag", params),
  updateTag: (params) =>
    ipcRenderer.invoke("engine:updateTag", params),
  deleteTag: (params) =>
    ipcRenderer.invoke("engine:deleteTag", params),
  mergeTags: (params) =>
    ipcRenderer.invoke("engine:mergeTags", params),
  assignTag: (params) =>
    ipcRenderer.invoke("engine:assignTag", params),
  unassignTag: (params) =>
    ipcRenderer.invoke("engine:unassignTag", params),
  setTrackMetadata: (params) =>
    ipcRenderer.invoke("engine:setTrackMetadata", params),
  getTrackHistory: (params) =>
    ipcRenderer.invoke("engine:getTrackHistory", params),
  applyBatch: (params) =>
    ipcRenderer.invoke("engine:applyBatch", params),

  // Clean (CLEAN-11).
  startCleanMatch: (params) => ipcRenderer.invoke("engine:startCleanMatch", params),
  resumeCleanMatch: (params) => ipcRenderer.invoke("engine:resumeCleanMatch", params),
  getResumableMatches: () => ipcRenderer.invoke("engine:getResumableMatches"),
  getTrackMatches: (params) => ipcRenderer.invoke("engine:getTrackMatches", params),
  getMatchCandidates: (params) => ipcRenderer.invoke("engine:getMatchCandidates", params),
  // CLEAN-12's reveal: a track id in, the file or its nearest folder out.
  getTrackFolder: (params) => ipcRenderer.invoke("engine:getTrackFolder", params),
  decideMatch: (params) => ipcRenderer.invoke("engine:decideMatch", params),
  applyMatch: (params) => ipcRenderer.invoke("engine:applyMatch", params),
  setTrackOverrides: (params) => ipcRenderer.invoke("engine:setTrackOverrides", params),
  revertChange: (params) => ipcRenderer.invoke("engine:revertChange", params),
  revertBatch: (params) => ipcRenderer.invoke("engine:revertBatch", params),
  startFileCheck: (params) => ipcRenderer.invoke("engine:startFileCheck", params),
  startDuplicateScan: (params) => ipcRenderer.invoke("engine:startDuplicateScan", params),
  getDuplicateGroups: (params) => ipcRenderer.invoke("engine:getDuplicateGroups", params),
  dismissDuplicateGroup: (params) =>
    ipcRenderer.invoke("engine:dismissDuplicateGroup", params),
  restoreDuplicateGroup: (params) =>
    ipcRenderer.invoke("engine:restoreDuplicateGroup", params),
  startArtworkScan: (params) => ipcRenderer.invoke("engine:startArtworkScan", params),
  previewTagWrite: (params) => ipcRenderer.invoke("engine:previewTagWrite", params),
  startTagWrite: (params) => ipcRenderer.invoke("engine:startTagWrite", params),
  startTagRestore: (params) => ipcRenderer.invoke("engine:startTagRestore", params),
  getTagWrites: (params) => ipcRenderer.invoke("engine:getTagWrites", params),
  getLibraryHealth: () => ipcRenderer.invoke("engine:getLibraryHealth"),
  exportReviewList: (params) => ipcRenderer.invoke("engine:exportReviewList", params),
  // The Rekordbox export (EXPORT-06): not the review list above.
  previewRekordboxExport: (params) =>
    ipcRenderer.invoke("engine:previewRekordboxExport", params),
  startRekordboxExport: (params) => ipcRenderer.invoke("engine:startRekordboxExport", params),
  getRekordboxExportHistory: (params) =>
    ipcRenderer.invoke("engine:getRekordboxExportHistory", params),
  chooseRekordboxExportDestination: (request) =>
    ipcRenderer.invoke("dialog:saveRekordboxExport", request),
  // Discover (DISCOVER-09): every answer is { value, refusal }.
  getDiscoverOptions: () => ipcRenderer.invoke("engine:getDiscoverOptions"),
  listDiscoveryRuns: (params) => ipcRenderer.invoke("engine:listDiscoveryRuns", params),
  getDiscoveryRun: (params) => ipcRenderer.invoke("engine:getDiscoveryRun", params),
  getDiscoveryRunTracks: (params) => ipcRenderer.invoke("engine:getDiscoveryRunTracks", params),
  startDiscoveryRun: (params) => ipcRenderer.invoke("engine:startDiscoveryRun", params),
  deleteDiscoveryRun: (params) => ipcRenderer.invoke("engine:deleteDiscoveryRun", params),
  getWantlist: (params) => ipcRenderer.invoke("engine:getWantlist", params),
  addToWantlist: (params) => ipcRenderer.invoke("engine:addToWantlist", params),
  removeFromWantlist: (params) => ipcRenderer.invoke("engine:removeFromWantlist", params),
  setWantlistNote: (params) => ipcRenderer.invoke("engine:setWantlistNote", params),
  setWantlistBought: (params) => ipcRenderer.invoke("engine:setWantlistBought", params),
  startBeatportPlaylistPush: (params) =>
    ipcRenderer.invoke("engine:startBeatportPlaylistPush", params),
  startBeatportResolve: () => ipcRenderer.invoke("engine:startBeatportResolve"),
  getEntityPage: (params) => ipcRenderer.invoke("engine:getEntityPage", params),
  getEntityBeatport: (params) => ipcRenderer.invoke("engine:getEntityBeatport", params),
  getSimilarTracks: (params) => ipcRenderer.invoke("engine:getSimilarTracks", params),
  // A Set (PREP-08): every answer is { value, refusal }. Adding and removing
  // entries stays on the Collection methods above.
  sets: {
    plan: (params) => ipcRenderer.invoke("engine:getSetPlan", params),
    entries: (params) => ipcRenderer.invoke("engine:getSetEntries", params),
    analysis: (params) => ipcRenderer.invoke("engine:getSetAnalysis", params),
    suggestions: (params) => ipcRenderer.invoke("engine:getSetSuggestions", params),
    setListText: (params) => ipcRenderer.invoke("engine:getSetListText", params),
    create: (params) => ipcRenderer.invoke("engine:createSet", params),
    createFrom: (params) => ipcRenderer.invoke("engine:createSetFrom", params),
    duplicate: (params) => ipcRenderer.invoke("engine:duplicateSet", params),
    setNotes: (params) => ipcRenderer.invoke("engine:setSetNotes", params),
    createChapter: (params) => ipcRenderer.invoke("engine:createSetChapter", params),
    updateChapter: (params) => ipcRenderer.invoke("engine:updateSetChapter", params),
    moveChapter: (params) => ipcRenderer.invoke("engine:moveSetChapter", params),
    deleteChapter: (params) => ipcRenderer.invoke("engine:deleteSetChapter", params),
    splitChapter: (params) => ipcRenderer.invoke("engine:splitSetChapter", params),
    moveEntry: (params) => ipcRenderer.invoke("engine:moveSetEntry", params),
    setEntryTimes: (params) => ipcRenderer.invoke("engine:setSetEntryTimes", params),
    setEntryNote: (params) => ipcRenderer.invoke("engine:setSetEntryNote", params),
    acknowledge: (params) => ipcRenderer.invoke("engine:acknowledgeSetWarning", params),
    unacknowledge: (params) => ipcRenderer.invoke("engine:unacknowledgeSetWarning", params),
    saveSetList: (params) => ipcRenderer.invoke("engine:saveSetList", params),
    chooseSetListDestination: (request) =>
      ipcRenderer.invoke("dialog:saveSetList", request),
  },
  // Waveforms and their analysis (WAVE-03, WAVE-05): every answer is
  // { value, refusal }. A picture arrives as a Uint8Array, decoded in main.
  waveforms: {
    analysis: () => ipcRenderer.invoke("engine:getWaveformAnalysis"),
    pause: () => ipcRenderer.invoke("engine:pauseWaveformAnalysis"),
    resume: () => ipcRenderer.invoke("engine:resumeWaveformAnalysis"),
    get: (params) => ipcRenderer.invoke("engine:getWaveforms", params),
    request: (params) => ipcRenderer.invoke("engine:requestWaveforms", params),
    deleteData: () => ipcRenderer.invoke("engine:deleteWaveformData"),
  },
  startLibraryImport: (params) =>
    ipcRenderer.invoke("engine:startLibraryImport", params),
  startLibraryRefreshPreview: (params) =>
    ipcRenderer.invoke("engine:startLibraryRefreshPreview", params),
  startLibraryRefreshApply: (params) =>
    ipcRenderer.invoke("engine:startLibraryRefreshApply", params),
  getLibrarySummary: () => ipcRenderer.invoke("engine:getLibrarySummary"),
  listJobs: (params) => ipcRenderer.invoke("engine:listJobs", params),
  getRecentActivity: (params) => ipcRenderer.invoke("engine:getRecentActivity", params),
  getJob: (jobId) => ipcRenderer.invoke("engine:getJob", jobId),
  getJobResults: (jobId) => ipcRenderer.invoke("engine:getJobResults", jobId),
  cancelJob: (jobId) => ipcRenderer.invoke("engine:cancelJob", jobId),
  getBeatportTokenStatus: () => ipcRenderer.invoke("engine:getBeatportTokenStatus"),
  setBeatportToken: (token) => ipcRenderer.invoke("engine:setBeatportToken", token),
  testBeatportToken: (body) => ipcRenderer.invoke("engine:testBeatportToken", body),
  exportSupportBundle: (options) => ipcRenderer.invoke("support:exportBundle", options ?? {}),
  showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItemInFolder", filePath),
  openBeatportPage: (url) => ipcRenderer.invoke("shell:openBeatportPage", url),
  getLogsDir: () => ipcRenderer.invoke("engine:getLogsDir"),
  getCuepointLog: (options) => ipcRenderer.invoke("engine:getCuepointLog", options ?? {}),
  clearCuepointLogs: () => ipcRenderer.invoke("engine:clearCuepointLogs"),
  clearCuepointCache: () => ipcRenderer.invoke("engine:clearCuepointCache"),
  setPrivacyExitPrefs: (prefs) => ipcRenderer.invoke("privacy:setExitPrefs", prefs),
  // This build's version, release, commit and environment (REPORT-07), for the About dialog.
  buildInfo: () => ipcRenderer.invoke("app:buildInfo"),
  errorReporting: {
    get: () => ipcRenderer.invoke("errorReporting:get"),
    set: (enabled) => ipcRenderer.invoke("errorReporting:set", enabled),
  },
  // Whether this run is an end-to-end test (REPORT-06): the page may then be
  // made to throw, to see the error screen. Main answers false for a user.
  testHooks: {
    enabled: () => ipcRenderer.invoke("testHooks:enabled"),
  },
  subscribeJobEvents: (jobId, onEvent) => {
    const eventHandler = (_event, payload) => {
      if (payload?.jobId === jobId) onEvent(payload.event);
    };
    const endHandler = (_event, payload) => {
      if (payload?.jobId !== jobId) return;
      ipcRenderer.removeListener("engine:jobEvent", eventHandler);
      ipcRenderer.removeListener("engine:jobEventEnd", endHandler);
    };
    ipcRenderer.on("engine:jobEvent", eventHandler);
    ipcRenderer.on("engine:jobEventEnd", endHandler);
    void ipcRenderer.invoke("engine:subscribeJobEvents", jobId);
    return () => {
      ipcRenderer.removeListener("engine:jobEvent", eventHandler);
      ipcRenderer.removeListener("engine:jobEventEnd", endHandler);
      void ipcRenderer.invoke("engine:unsubscribeJobEvents", jobId);
    };
  },
  openXmlFileDialog: () => ipcRenderer.invoke("dialog:openXml"),
  resolveDroppedFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  saveExportFileDialog: (options) => ipcRenderer.invoke("dialog:saveExport", options),
  /**
   * Audio playback (PLAYER-03).
   *
   * Narrow on purpose: the renderer can ask for transport and read state, and
   * that is all. No socket path, no process handle and no binary path crosses
   * this boundary — the renderer has no business knowing mpv exists, let alone
   * where it lives.
   */
  player: {
    getState: () => ipcRenderer.invoke("player:getState"),
    // Durable state, not an event: a missing macOS Accessibility permission
    // is still missing long after the toast about it has faded (PLAYER-12).
    mediaKeyStatus: () => ipcRenderer.invoke("player:mediaKeyStatus"),
    playQueue: (items, startIndex) =>
      ipcRenderer.invoke("player:playQueue", items, startIndex ?? 0),
    playView: (view, startIndex) =>
      ipcRenderer.invoke("player:playView", view, startIndex ?? 0),
    queueWindow: (offset, limit) =>
      ipcRenderer.invoke("player:queueWindow", offset ?? 0, limit ?? 100),
    playNext: (items) => ipcRenderer.invoke("player:playNext", items),
    addToQueue: (items) => ipcRenderer.invoke("player:addToQueue", items),
    next: () => ipcRenderer.invoke("player:next"),
    previous: () => ipcRenderer.invoke("player:previous"),
    jumpTo: (index) => ipcRenderer.invoke("player:jumpTo", index),
    removeFromQueue: (id) => ipcRenderer.invoke("player:removeFromQueue", id),
    moveInQueue: (from, to) => ipcRenderer.invoke("player:moveInQueue", from, to),
    clearQueue: () => ipcRenderer.invoke("player:clearQueue"),
    setShuffle: (on) => ipcRenderer.invoke("player:setShuffle", on),
    setRepeat: (mode) => ipcRenderer.invoke("player:setRepeat", mode),
    pause: () => ipcRenderer.invoke("player:pause"),
    resume: () => ipcRenderer.invoke("player:resume"),
    toggle: () => ipcRenderer.invoke("player:toggle"),
    stop: () => ipcRenderer.invoke("player:stop"),
    seek: (seconds) => ipcRenderer.invoke("player:seek", seconds),
    setVolume: (volume) => ipcRenderer.invoke("player:setVolume", volume),
    setMuted: (muted) => ipcRenderer.invoke("player:setMuted", muted),
    /** The output devices mpv can see right now (PLAYER-11, DEC-055). */
    audioDevices: () => ipcRenderer.invoke("player:audioDevices"),
    setAudioSettings: (settings) =>
      ipcRenderer.invoke("player:setAudioSettings", settings ?? {}),
    /**
     * Things to tell the user once: a track that would not play, or a player
     * that is gone (PLAYER-10). Not replayed on subscribe, so a reloaded
     * window never shows a stale toast.
     */
    subscribeNotices: (onNotice) => {
      const handler = (_event, notice) => onNotice(notice);
      ipcRenderer.on("player:notice", handler);
      void ipcRenderer.invoke("player:subscribeNotices");
      return () => {
        ipcRenderer.removeListener("player:notice", handler);
        void ipcRenderer.invoke("player:unsubscribeNotices");
      };
    },
    subscribeState: (onState) => {
      const handler = (_event, snapshot) => onState(snapshot);
      ipcRenderer.on("player:state", handler);
      void ipcRenderer.invoke("player:subscribeState");
      return () => {
        ipcRenderer.removeListener("player:state", handler);
        void ipcRenderer.invoke("player:unsubscribeState");
      };
    },
  },
}));
