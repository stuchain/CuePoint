/**
 * Gives the main thread back (SITE-05): the 3D starts in small steps with this between them, so no
 * single task is long and input stays responsive (INP). scheduler.yield() where the browser has it
 * (it keeps the continuation's priority), setTimeout(0) elsewhere.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
