import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter, Navigate, Route, useLocation, useNavigate, type Location } from "react-router-dom";
import {
  AboutDialog,
  DiagnosticsDialog,
  LogViewerDialog,
  OnboardingDialog,
  PrivacyDialog,
  RekordboxInstructionsDialog,
  GetHelpDialog,
  ShortcutsDialog,
  ToastProvider,
  useToast,
} from "./components";
import {
  applyLaunchDestination,
  AppShellLayout,
  enabledDestinations,
  isDialogOpen,
  litDestination,
  homeDestination,
  OfflineBanner,
  SearchDialogHost,
  Sidebar,
  StatusStrip,
  TrackInspector,
  RightColumn,
  InspectorSlotProvider,
  InspectorSlotOutlet,
  KeptPages,
  retiredRedirects,
  useRememberDestination,
} from "./components/shell";
import { useEngineOffline } from "./api/engineOnline";
import { WheelPopoverHost } from "./components/wheel";
import { PlayerSlot } from "./components/player/PlayerSlot";
import { useRestorePlayerAudio } from "./components/player/playerAudioState";
import { useRestorePlayerOrder } from "./components/player/playerOrderState";
import { useCompactBarFlag } from "./components/player/useCompactBar";
import {
  CleanScreen,
  DiscoverScreen,
  KeysScreen,
  LibraryScreen,
  PrepareScreen,
  SettingsScreen,
  StatisticsScreen,
} from "./screens";
import { sendExitClearing } from "./screens/exitClearing";
import {
  importOpening,
  libraryImportState,
  libraryExportState,
  exportOpening,
  libraryOpening,
  libraryRefreshState,
  libraryTrackState,
  refreshOpening,
  trackOpening,
} from "./screens/library/libraryLink";
import { keysOpening, keysState } from "./screens/keys/keysLink";
import { settingsFocusState } from "./screens/settingsLink";
import { hasShortcutModifier } from "./components/shell/platformKeys";
import { emitShellCommand } from "./components/shell/shellCommands";
import { openActivity } from "./components/shell/activityState";
import { useMenuCommands } from "./components/shell/useMenuCommands";
import { useWindowTitle } from "./components/shell/useWindowTitle";
import { undoTarget } from "./api/menuCommands";
import { PREPARE_SET_ROUTE, preparePath } from "./screens/prepare/prepareLink";
import { EntityScreen } from "./screens/discover/EntityScreen";
import { SimilarScreen } from "./screens/discover/SimilarScreen";
import {
  ARTIST_PAGE_ROUTE,
  LABEL_PAGE_ROUTE,
  SIMILAR_ROUTE,
  entityPath,
  nameRef,
  originState,
  similarPath,
  type PageOrigin,
} from "./screens/discover/discoverLinks";
import {
  cleanMatchOpening,
  cleanMatchState,
  cleanOpening,
  cleanRedirect,
  cleanSectionOpening,
  cleanSectionState,
  cleanTrackState,
} from "./screens/clean/cleanLink";
import type { CleanTracks } from "./screens/clean/cleanTracks";
import { MotionProvider } from "./tokens/MotionContext";
import { ScaleProvider } from "./tokens/ScaleContext";
import { ThemeProvider } from "./tokens/ThemeContext";
import { useNavigationBreadcrumbs, usePageTiming } from "./reporting";
import { Phase14Note } from "./components/Phase14Note";
import { WhatsNew } from "./components/updates/WhatsNew";
import { phase14NoteDue, shouldShowOnboarding } from "./components/firstRunMemory";
import { applyFreshStart } from "./freshStart";
import "./App.css";
// After every component stylesheet, so a rule here wins a tie with one (PAGES-12).
import "./motion.css";

/** The paths a destination's slot owns: its own, and the pages under Discover and Prepare. */
function slotPaths(id: string, path: string): string[] {
  if (id === "discover") return [path, ARTIST_PAGE_ROUTE, LABEL_PAGE_ROUTE, SIMILAR_ROUTE];
  if (id === "prepare") return [path, PREPARE_SET_ROUTE];
  return [path];
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { runNewestAction } = useToast();
  useWindowTitle();
  // A different page steps in (Changing page, PAGES-12). The phase alternates so each change
  // names a different animation and restarts it without remounting the page; there is none
  // before the first change, so the app does not move as it opens. Worked out while rendering,
  // so the new page is drawn with its animation from the first frame and never waits for data.
  const [pageAt, setPageAt] = useState({ path: location.pathname, phase: undefined as "a" | "b" | undefined });
  if (pageAt.path !== location.pathname) {
    setPageAt({ path: location.pathname, phase: pageAt.phase === "a" ? "b" : "a" });
  }
  // What the current page has put in the Inspector (LIBUI-10). The panel lives
  // here rather than in the page so it survives navigation (SHELL-05).
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  // A new user sees the guide; someone who finished the old tour sees the note once
  // (DEC-207). Never both: the guide marks the note seen when it is finished.
  const [onboardingOpen, setOnboardingOpen] = useState(() => shouldShowOnboarding());
  const [noteOpen, setNoteOpen] = useState(() => !shouldShowOnboarding() && phase14NoteDue());
  const [rekordboxOpen, setRekordboxOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [getHelpOpen, setGetHelpOpen] = useState(false);
  // Goes up each time a click on the offline page is stopped; the banner pulses.
  const [bannerPulse, setBannerPulse] = useState(0);
  const offline = useEngineOffline();

  useEffect(() => {
    sendExitClearing();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Not on top of another dialog (C201).
      if (isDialogOpen()) return;
      if (event.key === "F1") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (hasShortcutModifier(event) && (event.key === "?" || (event.shiftKey && event.key === "/"))) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useRememberDestination();
  // A step for each destination opened, by its id (REPORT-06).
  useNavigationBreadcrumbs();
  // How long each page takes to draw, for main.log.
  usePageTiming();

  // DISCOVER-11: the pages every track leads to, and Similar tracks.
  // The page a track was opened from stays lit in the sidebar (C221): it goes along as `from`.
  // Opened from Discover it is Discover's; from any other page the track is a Library track (C221).
  const originRef = useRef<PageOrigin>("library");
  originRef.current = litDestination(location.pathname, location.state)?.id === "discover" ? "discover" : "library";
  const openEntity = useCallback(
    (kind: "artist" | "label", ref: string) =>
      navigate(entityPath(kind, ref), { state: originState(originRef.current) }),
    [navigate],
  );
  // BAR-4: the player bar's title opens the track in the Library, its artist the
  // artist's page.
  const openPlayingTrack = useCallback(
    (trackId: number) => navigate("/library", { state: libraryTrackState(trackId) }),
    [navigate],
  );
  const openPlayingArtist = useCallback(
    (artist: string) => openEntity("artist", nameRef(artist)),
    [openEntity],
  );
  const openSimilar = useCallback(
    (trackId: number) => navigate(similarPath(trackId), { state: originState(originRef.current) }),
    [navigate],
  );
  // A one-shot opening (a searched track, the import's file choice) is spent once the
  // Library applies it; clearing it keeps Back from replaying it.
  const clearOpening = useCallback(
    () => navigate(location.pathname, { replace: true, state: null }),
    [location.pathname, navigate],
  );
  const openInClean = useCallback(
    (trackId: number) => navigate("/clean", { state: cleanTrackState(trackId) }),
    [navigate],
  );
  // PREP-10: a Set opens on the Prepare page, from the tree, the Inspector
  // and the Set scope's note (DEC-104).
  const openInPrepare = useCallback(
    (setId: number) => navigate(preparePath(setId)),
    [navigate],
  );
  // The Library's Key list leads to the Keys page with the open playlist or Collection ticked.
  const openKeys = useCallback(
    (sources: Parameters<typeof keysState>[0]) => navigate("/keys", { state: keysState(sources) }),
    [navigate],
  );
  const openMissingFiles = useCallback(
    () => navigate("/clean", { state: cleanSectionState("missing") }),
    [navigate],
  );
  // "No tracks have a Beatport key yet" and the Key is empty list send the user to
  // Clean's match window, with the tracks to match when there are some (FLW-13).
  const openMatching = useCallback(
    (tracks?: CleanTracks) => navigate("/clean", { state: cleanMatchState(tracks) }),
    [navigate],
  );
  const closeNote = useCallback(() => setNoteOpen(false), []);
  const prepareScreen = () => (
    <PrepareScreen
      onOpenInClean={openInClean}
      onOpenMissingFiles={openMissingFiles}
      // The export's "Refresh first" (DEC-082): the Library's own refresh.
      onRefreshLibrary={() => navigate("/library", { state: libraryRefreshState() })}
    />
  );
  // Shuffle and repeat are remembered across sessions (PLAYER-07). Restored
  // here rather than in the bar, which does not exist until the first play —
  // by then the queue has already been built and ordered.
  useRestorePlayerOrder();
  // The output device the user chose, before the first track plays (PLAYER-11).
  useRestorePlayerAudio();
  // One short-window threshold for the compact player bar and the zoomed strip (C207): the page
  // carries it as `data-short-window`, which PlayerBar.css reads.
  useCompactBarFlag();

  /**
   * Maps a destination id to the screen that renders it.
   *
   * This lives here rather than in the registry because two of these screens
   * need callbacks that open dialogs owned by this component; putting elements
   * in the registry would drag that state into what is meant to stay data.
   */
  const screenFor = (id: string, slotLocation: Location) => {
    switch (id) {
      case "library":
        // A Health count opens the Library on its rules (CLEAN-12, DEC-075);
        // they arrive in the location's state and are handed over as a prop.
        return (
          <LibraryScreen
            openWith={libraryOpening(slotLocation)}
            refreshWith={refreshOpening(slotLocation)}
            trackWith={trackOpening(slotLocation)}
            importWith={importOpening(slotLocation)}
            exportWith={exportOpening(slotLocation)}
            onOpeningApplied={clearOpening}
            onOpenRekordboxInstructions={() => setRekordboxOpen(true)}
            onOpenInClean={openInClean}
            onOpenMissingFiles={openMissingFiles}
            onOpenMatch={openMatching}
            onOpenToken={() => navigate("/settings", { state: settingsFocusState("beatport-token") })}
            onOpenEntity={openEntity}
            onOpenSimilar={openSimilar}
            onOpenInPrepare={openInPrepare}
            onOpenKeys={openKeys}
          />
        );
      case "clean": {
        // The Inspector's link opens one track's review (CLEAN-13).
        // The Rekordbox export's missing-file count opens Missing files (EXPORT-07).
        // A link to the Health or Fix values tab K3 removed goes where they went.
        const moved = cleanRedirect(slotLocation);
        if (moved) return <Navigate to={moved.to} state={moved.state} replace />;
        return (
          <CleanScreen
            openWith={cleanOpening(slotLocation)}
            openSection={cleanSectionOpening(slotLocation)}
            matchWith={cleanMatchOpening(slotLocation)}
          />
        );
      }
      // PAGES-16 (DEC-200): the keys of chosen playlists, Collections and Sets. The Library's Key
      // list opens it with the open playlist or Collection ticked.
      case "keys":
        return <KeysScreen openWith={keysOpening(slotLocation)} onOpeningApplied={clearOpening} />;
      // DISCOVER-10. inCrate retired into it in DISCOVER-12 (DEC-100).
      case "discover":
        return <DiscoverScreen />;
      // PREP-10 (DEC-104). `/prepare` reopens the last Set; each Set is a page
      // of the destination, as Discover's Artist pages are (DEC-094).
      case "prepare":
        return prepareScreen();
      // STATS-04 (DEC-138): what is played most and how the library is made up.
      case "statistics":
        return <StatisticsScreen />;
      case "settings":
        return (
          <SettingsScreen
            onOpenPrivacy={() => setPrivacyOpen(true)}
            onOpenOnboarding={() => setOnboardingOpen(true)}
          />
        );
      default:
        return null;
    }
  };

  // The native menu (FLW-20, DEC-204): main sends the id of the item picked and each one
  // does what the in-window bar's items did, or opens the page they lead to. Import and
  // Check for changes are the Library's own buttons, reached by way of the Library.
  useMenuCommands({
    settings: () => navigate("/settings"),
    "getting-started": () => setOnboardingOpen(true),
    shortcuts: () => setShortcutsOpen(true),
    // The choices live in Settings → Privacy; the dialog only explains them.
    privacy: () => navigate("/settings", { state: settingsFocusState("privacy") }),
    "get-help": () => setGetHelpOpen(true),
    diagnostics: () => setDiagnosticsOpen(true),
    "log-viewer": () => setLogViewerOpen(true),
    "rekordbox-help": () => setRekordboxOpen(true),
    about: () => setAboutOpen(true),
    import: () => navigate("/library", { state: libraryImportState() }),
    "check-rekordbox": () => navigate("/library", { state: libraryRefreshState() }),
    "export-rekordbox": () => navigate("/library", { state: libraryExportState() }),
    // Ctrl+Z (M456): the menu takes it from the page, so a text field's typing is undone here
    // and anything else presses the newest toast's Undo.
    undo: () => {
      if (undoTarget(document.activeElement) === "text") document.execCommand("undo");
      else runNewestAction();
    },
    "toggle-inspector": () => emitShellCommand("toggle-inspector"),
    "toggle-sidebar": () => emitShellCommand("toggle-sidebar"),
    "search-library": () => emitShellCommand("open-search"),
    activity: openActivity,
  });

  // Every destination the user has opened stays alive behind the current one (KeptPages), so
  // each is a slot: its own page and the pages under it, drawn from the slot's own location.
  const slots = enabledDestinations().map((destination) => ({
    id: destination.id,
    paths: slotPaths(destination.id, destination.path),
    // Discover's Artist and Similar pages open over its root, which stays as it was (C194).
    keepRoot: destination.id === "discover",
    routes: (slotLocation: Location) => (
      <>
        <Route path={destination.path} element={screenFor(destination.id, slotLocation)} />
        {/*
          Artist and Label pages and Similar tracks are routes under
          Discover, not destinations of their own (DEC-094): the sidebar
          keeps Discover lit on them, and the app reopens on Discover.
        */}
        {destination.id === "discover" && (
          <>
            <Route
              path={ARTIST_PAGE_ROUTE}
              element={<EntityScreen kind="artist" onOpenInClean={openInClean} />}
            />
            <Route
              path={LABEL_PAGE_ROUTE}
              element={<EntityScreen kind="label" onOpenInClean={openInClean} />}
            />
            <Route path={SIMILAR_ROUTE} element={<SimilarScreen onOpenInClean={openInClean} />} />
          </>
        )}
        {destination.id === "prepare" && (
          <Route path={PREPARE_SET_ROUTE} element={prepareScreen()} />
        )}
      </>
    ),
  }));

  return (
    <>
      <AppShellLayout
        pagePhase={pageAt.phase}
        banner={<OfflineBanner onGetHelp={() => setGetHelpOpen(true)} pulse={bannerPulse} />}
        offline={offline}
        onBlockedClick={() => setBannerPulse((n) => n + 1)}
        sidebar={<Sidebar />}
        inspector={
          <RightColumn>
            <TrackInspector>
              <InspectorSlotOutlet />
            </TrackInspector>
          </RightColumn>
        }
        player={<PlayerSlot onOpenTrack={openPlayingTrack} onOpenArtist={openPlayingArtist} />}
        statusBar={<StatusStrip />}
      >
        <KeptPages
          slots={slots}
          unowned={
            <>
              {/*
                A retired page's path lands on the page that replaced it (DEC-071,
                DEC-100), so a bookmark or an old link still arrives somewhere
                real: `/match` and `/results` on Clean, `/incrate` on Discover, and
                `/` — Tools' landing page — on the Library.
              */}
              {retiredRedirects().map((redirect) => (
                <Route
                  key={redirect.id}
                  path={redirect.from}
                  element={<Navigate to={redirect.to} replace />}
                />
              ))}
              {/*
                A path that matches no destination goes home rather than showing
                nothing. This is the belt to the registry's braces: DEC-027's
                fallback keeps a stale stored destination from landing here, and
                this keeps any other unmatched path — a stray link, a future typo —
                from showing an empty content area. It redirects rather than
                rendering home in place, so the address, the sidebar and launch
                memory all agree on where the user is.
              */}
              <Route path="*" element={<Navigate to={homeDestination().path} replace />} />
            </>
          }
        />
      </AppShellLayout>
      {/* The two popups the shell owns, mounted once (K8): search's dialog and the wheel's popover. */}
      <SearchDialogHost />
      <WheelPopoverHost />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <GetHelpDialog
        open={getHelpOpen}
        onClose={() => setGetHelpOpen(false)}
        onOpenDiagnostics={() => {
          setGetHelpOpen(false);
          setDiagnosticsOpen(true);
        }}
        onOpenLogViewer={() => {
          setGetHelpOpen(false);
          setLogViewerOpen(true);
        }}
      />
      <DiagnosticsDialog open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
      <OnboardingDialog
        open={onboardingOpen}
        covered={rekordboxOpen}
        onComplete={() => setOnboardingOpen(false)}
        onShowExport={() => setRekordboxOpen(true)}
        onImport={() => navigate("/library", { state: libraryImportState() })}
        onMatch={() => openMatching()}
        onSignIn={() => {
          // The guide stays open and ticks through onBeatportAuthChanged; Settings reports a
          // failed sign-in. Without the bridge, Settings is where to go instead.
          const signIn = window.cuepoint?.beatportSignIn;
          if (signIn) {
            signIn().catch(() => {});
            return;
          }
          setOnboardingOpen(false);
          navigate("/settings", { state: settingsFocusState("beatport-token") });
        }}
      />
      <Phase14Note
        open={noteOpen}
        onClose={closeNote}
        onChangeSize={() => navigate("/settings", { state: settingsFocusState("size") })}
        onMatch={() => openMatching()}
      />
      {/* After the guide and the Phase 14 note: one dialog at a time (DIST-07). */}
      <WhatsNew hold={onboardingOpen || noteOpen} />
      <RekordboxInstructionsDialog open={rekordboxOpen} onClose={() => setRekordboxOpen(false)} />
      <LogViewerDialog open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
    </>
  );
}

export default function App() {
  // Before the router mounts, not after: see `applyLaunchDestination` for why
  // restoring from an effect leaves the URL and the screen disagreeing.
  useState(applyLaunchDestination);
  // Clean on Match → Playlists and Discover on New dig, once per start (a session keeps its tabs).
  useState(applyFreshStart);

  return (
    <HashRouter>
      <ThemeProvider>
        <ScaleProvider>
          <MotionProvider>
            <ToastProvider>
              <InspectorSlotProvider>
                <AppShell />
              </InspectorSlotProvider>
            </ToastProvider>
          </MotionProvider>
        </ScaleProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
