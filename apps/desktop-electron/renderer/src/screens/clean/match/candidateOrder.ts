/**
 * The order the candidate panel lists Beatport results in (pure): the one in use first, then those
 * the guards did not rule out by score, highest first, then the ruled-out ones the same way.
 * Equal scores keep the matcher's own rank order.
 */
import type { MatchCandidate } from "../../../api/cuepointBridge.types";

export function orderCandidates(candidates: readonly MatchCandidate[], inUseId: number | null): MatchCandidate[] {
  const group = (candidate: MatchCandidate) => (candidate.id === inUseId ? 0 : candidate.guard_ok ? 1 : 2);
  return [...candidates].sort(
    (a, b) => group(a) - group(b) || b.score - a.score || a.rank - b.rank,
  );
}
