/**
 * How long each call to the engine took, so a slow page can be traced to the call that made it
 * slow. `timedFetch` stands in for `fetch` in `engineClient.ts`; it measures until the headers
 * arrive. Only the method, the route (no host, no query, ids as `:id`), the time and the status
 * are kept: never a header, a body or a token.
 */

export interface FinishedCall {
  method: string;
  route: string;
  ms: number;
  status: number | "failed";
  /** `Date.now()` when the call ended. */
  endedAt: number;
}

export type EngineCallSink = (message: string, fields: Record<string, string>) => void;

const RING_SIZE = 500;
let slowMs = 1000;
let sink: EngineCallSink | null = null;
let active = 0;
let ring: FinishedCall[] = [];

/** Where slow calls are reported; `null` for nowhere. */
export function setEngineCallSink(next: EngineCallSink | null): void {
  sink = next;
}

/** Tests: the threshold, and a clean slate. */
export function resetEngineCallTiming(options?: { slowMs?: number }): void {
  slowMs = options?.slowMs ?? 1000;
  sink = null;
  active = 0;
  ring = [];
}

export function inFlight(): number {
  return active;
}

/** The finished calls that ended in `[startMs, endMs]` (`Date.now()` values), oldest first. */
export function callsBetween(startMs: number, endMs: number): FinishedCall[] {
  return ring.filter((call) => call.endedAt >= startMs && call.endedAt <= endMs);
}

function looksLikeId(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  return segment.length >= 8 && /^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment);
}

/** The pathname with id-like segments as `:id`. Anything unparseable is `?`. */
export function routeOf(input: unknown): string {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as { url?: string }).url ?? "";
    const pathname = new URL(raw, "http://engine.invalid").pathname;
    return pathname
      .split("/")
      .map((segment) => (looksLikeId(segment) ? ":id" : segment))
      .join("/");
  } catch {
    return "?";
  }
}

function methodOf(input: unknown, init?: RequestInit): string {
  const fromInit = init?.method;
  const fromRequest = typeof input === "object" && input !== null ? (input as { method?: string }).method : undefined;
  return (fromInit ?? fromRequest ?? "GET").toUpperCase();
}

function record(method: string, route: string, ms: number, status: number | "failed"): void {
  try {
    // A stream that stays open by design, and the health probe, would only be noise.
    if (route.endsWith("/events") || route === "/health") return;
    ring.push({ method, route, ms, status, endedAt: Date.now() });
    if (ring.length > RING_SIZE) ring.shift();
    if (ms > slowMs && sink !== null) {
      sink(`slow ${method} ${route} ${(ms / 1000).toFixed(1)} s`, {
        status: String(status),
        inFlight: String(active),
      });
    }
  } catch {
    // Logging is never worth a failed call.
  }
}

export const timedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const method = methodOf(input, init);
  const route = routeOf(input);
  active += 1;
  try {
    const response = await fetch(input, init);
    active -= 1;
    record(method, route, performance.now() - started, response.status);
    return response;
  } catch (error) {
    active -= 1;
    record(method, route, performance.now() - started, "failed");
    throw error;
  }
};
