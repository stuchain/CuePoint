import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AboutDialog,
  DiagnosticsDialog,
  LogViewerDialog,
  OnboardingDialog,
  PrivacyDialog,
  RekordboxInstructionsDialog,
  ReportProblemDialog,
  ShortcutsDialog,
  SupportBundleDialog,
  ToastProvider,
} from "./components";
import {
  applyLaunchDestination,
  AppShellLayout,
  enabledDestinations,
  findDestinationById,
  ShellHeader,
  homeDestination,
  Sidebar,
  StatusStrip,
  TrackInspector,
  InspectorSlotProvider,
  InspectorSlotOutlet,
  retiredRedirects,
  useRememberDestination,
} from "./components/shell";
import { PlayerSlot } from "./components/player/PlayerSlot";
import { useRestorePlayerAudio } from "./components/player/playerAudioState";
import { useRestorePlayerOrder } from "./components/player/playerOrderState";
import {
  CleanScreen,
  DiscoverScreen,
  LibraryScreen,
  PrepareScreen,
  SettingsScreen,
} from "./screens";
import { sendExitClearing } from "./screens/exitClearing";
import {
  importOpening,
  libraryImportState,
  libraryOpening,
  libraryRefreshState,
  libraryTrackState,
  refreshOpening,
  trackOpening,
} from "./screens/library/libraryLink";
import { settingsFocusState } from "./screens/settingsLink";
import { hasShortcutModifier } from "./components/shell/platformKeys";
import { emitShellCommand } from "./components/shell/shellCommands";
import { useMenuCommands } from "./components/shell/useMenuCommands";
import { PREPARE_SET_ROUTE, preparePath } from "./screens/prepare/prepareLink";
import { EntityScreen } from "./screens/discover/EntityScreen";
import { SimilarScreen } from "./screens/discover/SimilarScreen";
import {
  ARTIST_PAGE_ROUTE,
  LABEL_PAGE_ROUTE,
  SIMILAR_ROUTE,
  entityPath,
  nameRef,
  similarPath,
} from "./screens/discover/discoverLinks";
import {
  cleanOpening,
  cleanSectionOpening,
  cleanSectionState,
  cleanTrackState,
} from "./screens/clean/cleanLink";
import { MotionProvider } from "./tokens/MotionContext";
import { ScaleProvider } from "./tokens/ScaleContext";
import { ThemeProvider } from "./tokens/ThemeContext";
import { E2eCrashProbe, ErrorBoundary, useNavigationBreadcrumbs } from "./reporting";
import { shouldShowOnboarding } from "./components/OnboardingDialog";
import "./App.css";

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  // What the current page has put in the Inspector (LIBUI-10). The panel lives
  // here rather than in the page so it survives navigation (SHELL-05).
  const [supportOpen, setSupportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => shouldShowOnboarding());
  const [rekordboxOpen, setRekordboxOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [reportProblemOpen, setReportProblemOpen] = useState(false);

  useEffect(() => {
    document.title = "CuePoint";
  }, []);

  useEffect(() => {
    sendExitClearing();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".app-main")?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

  /**
   * Each destination's page sits in its own error boundary, so a page that throws shows
   * the error screen in the content area and the sidebar and player bar keep working. It
   * clears when the user opens another page (REPORT-06).
   */
  const guarded = (page: ReactNode) => (
    <ErrorBoundary scope="page" resetKey={location.pathname}>
      {page}
      <E2eCrashProbe />
    </ErrorBoundary>
  );

  // DISCOVER-11: the pages every track leads to, and Similar tracks.
  const openEntity = useCallback(
    (kind: "artist" | "label", ref: string) => navigate(entityPath(kind, ref)),
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
    (trackId: number) => navigate(similarPath(trackId)),
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
  const openMissingFiles = useCallback(
    () => navigate("/clean", { state: cleanSectionState("missing") }),
    [navigate],
  );
  // "No tracks have a Beatport key yet" sends the user to matching, which Clean's
  // Review part starts (PAGES-07 puts the match window there).
  const openMatching = useCallback(
    () => navigate("/clean", { state: cleanSectionState("review") }),
    [navigate],
  );
  const prepareScreen = (
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

  /**
   * Maps a destination id to the screen that renders it.
   *
   * This lives here rather than in the registry because two of these screens
   * need callbacks that open dialogs owned by this component; putting elements
   * in the registry would drag that state into what is meant to stay data.
   */
  const screenFor = (id: string) => {
    switch (id) {
      case "library":
        // A Health count opens the Library on its rules (CLEAN-12, DEC-075);
        // they arrive in the location's state and are handed over as a prop.
        return (
          <LibraryScreen
            openWith={libraryOpening(location)}
            refreshWith={refreshOpening(location)}
            trackWith={trackOpening(location)}
            importWith={importOpening(location)}
            onOpeningApplied={clearOpening}
            onOpenRekordboxInstructions={() => setRekordboxOpen(true)}
            onOpenInClean={openInClean}
            onOpenMissingFiles={openMissingFiles}
            onOpenMatch={openMatching}
            onOpenEntity={openEntity}
            onOpenSimilar={openSimilar}
            onOpenInPrepare={openInPrepare}
          />
        );
      case "clean":
        // The Inspector's link opens one track's review (CLEAN-13).
        // The Rekordbox export's missing-file count opens Missing files (EXPORT-07).
        return (
          <CleanScreen
            openWith={cleanOpening(location)}
            openSection={cleanSectionOpening(location)}
          />
        );
      // DEC-062: Collections is a way into the Library page, not a second
      // browser. Same screen, aimed at the tree — and `destinationToRemember`
      // stores `library` for it, so the two entries never fight over which one
      // the app reopens on.
      case "collections":
        return (
          <LibraryScreen
            focus="collections"
            onOpenRekordboxInstructions={() => setRekordboxOpen(true)}
            onOpenInClean={openInClean}
            onOpenMissingFiles={openMissingFiles}
            onOpenMatch={openMatching}
            onOpenEntity={openEntity}
            onOpenSimilar={openSimilar}
            onOpenInPrepare={openInPrepare}
          />
        );
      // DISCOVER-10. inCrate retired into it in DISCOVER-12 (DEC-100).
      case "discover":
        return <DiscoverScreen />;
      // PREP-10 (DEC-104). `/prepare` reopens the last Set; each Set is a page
      // of the destination, as Discover's Artist pages are (DEC-094).
      case "prepare":
        return prepareScreen;
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
    "report-problem": () => setReportProblemOpen(true),
    diagnostics: () => setDiagnosticsOpen(true),
    "log-viewer": () => setLogViewerOpen(true),
    "support-bundle": () => setSupportOpen(true),
    "rekordbox-help": () => setRekordboxOpen(true),
    about: () => setAboutOpen(true),
    import: () => navigate("/library", { state: libraryImportState() }),
    "check-rekordbox": () => navigate("/library", { state: libraryRefreshState() }),
    "toggle-inspector": () => emitShellCommand("toggle-inspector"),
    "toggle-sidebar": () => emitShellCommand("toggle-sidebar"),
  });

  return (
    <>
      <AppShellLayout
        header={<ShellHeader />}
        sidebar={<Sidebar />}
        inspector={
          <TrackInspector>
            <InspectorSlotOutlet />
          </TrackInspector>
        }
        player={<PlayerSlot onOpenTrack={openPlayingTrack} onOpenArtist={openPlayingArtist} />}
        statusBar={<StatusStrip />}
      >
        <Routes>
          {enabledDestinations().map((destination) => (
            <Route
              key={destination.id}
              path={destination.path}
              element={guarded(screenFor(destination.id))}
            />
          ))}
          {/*
            Artist and Label pages and Similar tracks are routes under
            Discover, not destinations of their own (DEC-094): the sidebar
            keeps Discover lit on them, and the app reopens on Discover.
          */}
          {findDestinationById("discover")?.enabled && (
            <>
              <Route
                path={ARTIST_PAGE_ROUTE}
                element={guarded(<EntityScreen kind="artist" onOpenInClean={openInClean} />)}
              />
              <Route
                path={LABEL_PAGE_ROUTE}
                element={guarded(<EntityScreen kind="label" onOpenInClean={openInClean} />)}
              />
              <Route path={SIMILAR_ROUTE} element={guarded(<SimilarScreen onOpenInClean={openInClean} />)} />
            </>
          )}
          {findDestinationById("prepare")?.enabled && (
            <Route path={PREPARE_SET_ROUTE} element={guarded(prepareScreen)} />
          )}
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
        </Routes>
      </AppShellLayout>
      <SupportBundleDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ReportProblemDialog open={reportProblemOpen} onClose={() => setReportProblemOpen(false)} />
      <DiagnosticsDialog open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
      <OnboardingDialog open={onboardingOpen} onComplete={() => setOnboardingOpen(false)} />
      <RekordboxInstructionsDialog open={rekordboxOpen} onClose={() => setRekordboxOpen(false)} />
      <LogViewerDialog open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
    </>
  );
}

export default function App() {
  // Before the router mounts, not after: see `applyLaunchDestination` for why
  // restoring from an effect leaves the URL and the screen disagreeing.
  useState(applyLaunchDestination);

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
