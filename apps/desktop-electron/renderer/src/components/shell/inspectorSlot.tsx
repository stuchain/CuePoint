/**
 * How a page fills the Track Inspector (LIBUI-10, DEC-024).
 *
 * The Inspector lives in the shell, not in any page: SHELL-05 put it there so
 * it survives navigation, keeps its width and stays hideable. A page therefore
 * cannot render into it by nesting — it has to hand its content up.
 *
 * **The content is held outside React state on purpose.** The obvious version
 * of this — `useState` in the provider — spins forever: setting the content
 * re-renders everything under the provider, the page included, which builds a
 * fresh element, which sets the content again. A page whose Inspector content
 * depends on its own state can never satisfy that loop, and the app locks up.
 *
 * So the slot is a tiny store the shell subscribes to. Setting content
 * notifies the Inspector and nobody else, which is both correct and what the
 * feature actually wants: the page has not changed, only what it is saying
 * about itself. `inspectorSlot.test.tsx` renders exactly that arrangement and
 * counts the page's renders, because the failure is a hang rather than a
 * wrong pixel.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { usePageActive } from "./pageActive";

interface InspectorSlotStore {
  get: () => ReactNode;
  /** Whether the page that filled the slot lets a selection open the panel (K1). */
  getAutoOpen: () => boolean;
  set: (content: ReactNode, autoOpen?: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

function createStore(): InspectorSlotStore {
  let content: ReactNode = null;
  let autoOpen = true;
  const listeners = new Set<() => void>();
  return {
    get: () => content,
    getAutoOpen: () => autoOpen,
    set: (next, allowAutoOpen = true) => {
      content = next;
      autoOpen = allowAutoOpen;
      // No "has it changed" check: `useSyncExternalStore` compares snapshots
      // itself and bails out, and the Inspector is the only subscriber. One
      // was written here and removed — nothing could observe it.
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const InspectorSlotContext = createContext<InspectorSlotStore | null>(null);

export function InspectorSlotProvider({ children }: { children: ReactNode }) {
  // One store for the life of the provider: it is not state, so it never
  // re-renders this subtree.
  const held = useRef<InspectorSlotStore | null>(null);
  const store = (held.current ??= createStore());
  return (
    <InspectorSlotContext.Provider value={store}>
      {children}
    </InspectorSlotContext.Provider>
  );
}

const NOTHING = {
  subscribe: () => () => {},
  get: (): ReactNode => null,
  getAutoOpen: () => true,
};

/**
 * What the shell should render inside the Inspector right now.
 *
 * **Call this from inside the Inspector, not from a component that renders the
 * page.** Anything that subscribes re-renders when the content changes, and if
 * that thing is an ancestor of the page, the page re-renders too, builds fresh
 * content, sets it, and the whole thing goes round forever. `InspectorSlotOutlet`
 * is that leaf, and is what the shell should use.
 */
export function useInspectorContent(): ReactNode {
  const store = useContext(InspectorSlotContext) ?? NOTHING;
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Whether the page in the slot lets a selected track open the panel by itself (K1,
 * DEC-280). True with nothing in the slot. Like the content, read it from inside the
 * Inspector, never from an ancestor of the page.
 */
export function useInspectorAutoOpen(): boolean {
  const store = useContext(InspectorSlotContext) ?? NOTHING;
  return useSyncExternalStore(store.subscribe, store.getAutoOpen, store.getAutoOpen);
}

/**
 * Whether the page in the slot filled it at all (M490). A page with no track list (Settings) never
 * does, and the Details toggle is not drawn for it. A boolean snapshot, so this re-renders its reader
 * only when the answer flips, never for each new element the page builds. True outside a provider
 * (a page or the panel rendered on its own).
 */
export function useInspectorHasContent(): boolean {
  const store = useContext(InspectorSlotContext);
  return useSyncExternalStore(
    store?.subscribe ?? NOTHING.subscribe,
    () => (store ? store.get() !== null && store.get() !== undefined : true),
    () => true,
  );
}

/**
 * Renders whatever the current page put in the slot.
 *
 * A component rather than a hook call in the shell, so the re-render a change
 * of content causes stops here — at a leaf inside the Track Inspector, with
 * nothing under it and the page nowhere near.
 */
export function InspectorSlotOutlet({ fallback = null }: { fallback?: ReactNode }) {
  const content = useInspectorContent();
  return <>{content ?? fallback}</>;
}

/**
 * Put content in the Inspector for as long as this component is mounted and its page is
 * the one on screen.
 *
 * `autoOpen: false` keeps the content but stops a selected track opening the panel on
 * this page (K1): Discover's search page shows no track details of its own.
 *
 * Outside a provider it does nothing, which is what a page rendered on its own
 * in a test should do rather than throw. A hidden kept page (C19e) neither sets nor
 * holds the slot; React's Activity clears its effects on hide, and the page-active gate
 * says the same where Activity is not there to do it.
 */
export function useInspectorSlot(content: ReactNode, options: { autoOpen?: boolean } = {}): void {
  const store = useContext(InspectorSlotContext);
  const active = usePageActive();
  const autoOpen = options.autoOpen ?? true;

  useEffect(() => {
    if (active) store?.set(content, autoOpen);
  }, [store, content, autoOpen, active]);

  // Clearing belongs to unmounting, not to every change: a cleanup on the
  // content itself would blank the Inspector for a frame each time the page
  // re-rendered.
  useEffect(() => {
    if (!store || !active) return;
    // Leaving the page takes its content with it, so the Inspector never
    // describes a track from a screen the user has left.
    return () => store.set(null);
  }, [store, active]);
}

/** For a page that wants to clear the slot itself. */
export function useClearInspector(): () => void {
  const store = useContext(InspectorSlotContext);
  return useCallback(() => store?.set(null), [store]);
}
