export { AppShellLayout } from "./AppShellLayout";
export { Sidebar } from "./Sidebar";
export { GlobalSearch } from "./GlobalSearch";
export { ShellHeader } from "./ShellHeader";
export { TrackInspector } from "./TrackInspector";
export { RightColumn } from "./RightColumn";
// LIBUI-10: a page hands its Inspector content up to the shell, which owns the
// panel (SHELL-05) so it survives navigation.
export {
  InspectorSlotOutlet,
  InspectorSlotProvider,
  useInspectorContent,
  useInspectorSlot,
} from "./inspectorSlot";
export { KeptPages } from "./KeptPages";
export { usePageActive } from "./pageActive";
export { StatusStrip } from "./StatusStrip";
export { OfflineBanner } from "./OfflineBanner";
export {
  enabledDestinations,
  findDestinationById,
  homeDestination,
  retiredRedirects,
} from "./navRegistry";
export { LAST_DESTINATION_STORAGE_KEY } from "./lastDestination";
export { applyLaunchDestination, useRememberDestination } from "./useNavigationState";
