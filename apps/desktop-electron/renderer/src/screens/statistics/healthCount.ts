import type { StatisticsHealth } from "../../api/cuepointBridge.types";

/** What needs fixing: the tracks and files the page's tab chip counts. */
export function healthToFix(health: StatisticsHealth): number {
  return (
    health.files.missing.count +
    health.files.unreadable.count +
    health.beatport.needs_review.count +
    health.other.duplicates.count +
    health.other.disputed.count +
    health.analyzed.failed
  );
}
