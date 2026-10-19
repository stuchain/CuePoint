/**
 * Whether the Activity panel is open. The button that opens it sits at the right end of the player
 * bar (C231) while the panel itself is mounted by the status strip, so the two share this small
 * store, and Ctrl+Shift+A opens it from anywhere.
 */
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openActivity(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeActivity(): void {
  if (!open) return;
  open = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActivityOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

/** Forget the state (tests). */
export function resetActivityForTests(): void {
  open = false;
  emit();
}
