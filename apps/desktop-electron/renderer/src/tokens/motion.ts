/**
 * The ten kinds of motion (DEC-134, with DEC-154's tenth), each behind its own
 * switch in Settings → Motion (SET-2). The ids are stable: they name the
 * stored value and the `data-motion-<id>` attribute CSS gates on.
 */

export type MotionKindId =
  | "micro"
  | "interaction"
  | "state"
  | "page"
  | "entrance"
  | "hover"
  | "scroll"
  | "loading"
  | "shared"
  | "feedback";

export type MotionGroupTitle = "When you act" | "When things change" | "While you wait or scroll";

export interface MotionKind {
  id: MotionKindId;
  label: string;
  description: string;
  group: MotionGroupTitle;
}

export const MOTION_KINDS: readonly MotionKind[] = [
  {
    id: "micro",
    label: "Button presses",
    description: "A button moves down a notch while you press it.",
    group: "When you act",
  },
  {
    id: "interaction",
    label: "Things you drag and drop",
    description: "Rows and items move as you pick them up and put them down.",
    group: "When you act",
  },
  {
    id: "state",
    label: "Changing state",
    description: "A control shifts when it turns on, off, selected or disabled.",
    group: "When things change",
  },
  {
    id: "page",
    label: "Changing page",
    description: "The page slides or fades in when you go to another one.",
    group: "When things change",
  },
  {
    id: "entrance",
    label: "Opening and closing panels and dialogs",
    description: "Dialogs, panels and messages slide in and out instead of appearing at once.",
    group: "When things change",
  },
  {
    id: "hover",
    label: "Hover and keyboard focus",
    description: "Things react when the pointer is over them or the keyboard lands on them.",
    group: "When you act",
  },
  {
    id: "scroll",
    label: "Scrolling",
    description: "Items ease in as a list scrolls past.",
    group: "While you wait or scroll",
  },
  {
    id: "loading",
    label: "Loading",
    description: "A spinner turns and placeholder rows shimmer while something loads.",
    group: "While you wait or scroll",
  },
  {
    id: "shared",
    label: "Moving between views",
    description: "An item glides to its place when you open it in another view.",
    group: "When things change",
  },
  {
    id: "feedback",
    label: "Alerts and confirmations",
    description: "A save that fails shakes, and new results pulse.",
    group: "When things change",
  },
];

/** The kinds as Settings shows them: three groups, each in the order the page lists. */
const GROUP_ORDER: readonly MotionGroupTitle[] = [
  "When you act",
  "When things change",
  "While you wait or scroll",
];
const IN_GROUP_ORDER: readonly MotionKindId[] = [
  "micro",
  "interaction",
  "hover",
  "state",
  "entrance",
  "page",
  "shared",
  "feedback",
  "loading",
  "scroll",
];

export const MOTION_GROUPS: readonly { title: MotionGroupTitle; kinds: readonly MotionKind[] }[] =
  GROUP_ORDER.map((title) => ({
    title,
    kinds: IN_GROUP_ORDER.map((id) => MOTION_KINDS.find((k) => k.id === id)!).filter(
      (k) => k.group === title,
    ),
  }));

export type MotionSwitches = Record<MotionKindId, boolean>;
/** Only the kinds the user changed, so later defaults still reach the rest. */
export type MotionOverrides = Partial<MotionSwitches>;

export const MOTION_STORAGE_KEY = "cuepoint-motion";

/** Every kind on, until PAGES-13 settles the defaults after testing. */
export const MOTION_DEFAULTS: MotionSwitches = {
  micro: true,
  interaction: true,
  state: true,
  page: true,
  entrance: true,
  hover: true,
  scroll: true,
  loading: true,
  shared: true,
  feedback: true,
};

const KIND_IDS = new Set<string>(MOTION_KINDS.map((k) => k.id));

/**
 * What the user changed. A missing, unreadable, corrupt or partial value, a key
 * that is not a kind and a value that is not a boolean all read as "unchanged";
 * storage that throws reads as no changes.
 */
export function readMotionOverrides(): MotionOverrides {
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(MOTION_STORAGE_KEY);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const overrides: MotionOverrides = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (KIND_IDS.has(key) && typeof value === "boolean") overrides[key as MotionKindId] = value;
  }
  return overrides;
}

export function mergeMotion(overrides: MotionOverrides): MotionSwitches {
  return { ...MOTION_DEFAULTS, ...overrides };
}

/** The switches: the defaults with what the user changed over them. */
export function readMotion(): MotionSwitches {
  return mergeMotion(readMotionOverrides());
}

/** Remember the changed kinds where storage allows; still applied for the session if not. */
export function writeMotionOverrides(overrides: MotionOverrides): void {
  try {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Not remembered across a restart.
  }
}

export function clearStoredMotion(): void {
  try {
    localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch {
    // Nothing stored that we could remove.
  }
}
