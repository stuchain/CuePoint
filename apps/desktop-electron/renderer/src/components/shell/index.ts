export { AppShellLayout } from "./AppShellLayout";
export { Sidebar } from "./Sidebar";
export { GlobalSearch } from "./GlobalSearch";
export { TrackInspector } from "./TrackInspector";
export { PlayerRegion } from "./PlayerRegion";
export { StatusStrip } from "./StatusStrip";
export { ENGINE_POLL_MS, useEngineStatus } from "./useEngineStatus";
export { JOB_POLL_MS, jobLabel, jobPercent, useActiveJob } from "./useActiveJob";
export type { ActiveJobState } from "./useActiveJob";
export type { PlayerRegionProps } from "./PlayerRegion";
export type { TrackInspectorProps } from "./TrackInspector";
export {
  clampInspectorWidth,
  INSPECTOR_DEFAULT_STATE,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_FRACTION,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_STORAGE_KEY,
  inspectorMaxWidth,
  loadInspectorState,
  saveInspectorState,
} from "./inspectorState";
export type { InspectorState } from "./inspectorState";
export {
  MIN_QUERY_LENGTH,
  resultSummary,
  SEARCH_DEBOUNCE_MS,
  shouldSearch,
  statusFor,
  trackSubtitle,
  useLibrarySearch,
} from "./useLibrarySearch";
export type { LibrarySearchState, SearchStatus } from "./useLibrarySearch";
export type { AppShellLayoutProps } from "./AppShellLayout";
export {
  enabledDestinations,
  groupedDestinations,
  NAV_GROUPS,
  NAV_GROUP_LABELS,
  findDestinationById,
  findDestinationByPath,
  homeDestination,
  HOME_DESTINATION_ID,
  NAV_DESTINATIONS,
} from "./navRegistry";
export type { NavDestination, NavGroup, NavGroupEntry } from "./navRegistry";
export {
  destinationToRemember,
  LAST_DESTINATION_STORAGE_KEY,
  loadLastDestinationId,
  resolveLaunchDestination,
  saveLastDestinationId,
} from "./lastDestination";
export { applyLaunchDestination, useRememberDestination } from "./useNavigationState";
export {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "./sidebarState";
