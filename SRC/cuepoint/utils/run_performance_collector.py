#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run Performance Collector (Design 6.48, 6.72, 6.74).

Tracks stage timings and memory for each processing run.
Stages: parse_xml, generate_queries, search_candidates, score_candidates, write_outputs.
Exports to JSON for diagnostics and benchmark comparison.
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _get_process_memory_mb() -> float:
    """Get current process memory usage in MB. Uses psutil if available."""
    try:
        import psutil
        process = psutil.Process()
        return process.memory_info().rss / (1024 * 1024)
    except Exception:
        return 0.0


# Design 6.50: Stage names
STAGE_PARSE_XML = "parse_xml"
STAGE_GENERATE_QUERIES = "generate_queries"
STAGE_SEARCH_CANDIDATES = "search_candidates"
STAGE_SCORE_CANDIDATES = "score_candidates"
STAGE_WRITE_OUTPUTS = "write_outputs"


@dataclass
class StageMetrics:
    """Metrics for a single pipeline stage (Design 6.80)."""

    stage: str
    duration_ms: float
    items_processed: int = 0
    errors: int = 0


@dataclass
class RunPerformanceReport:
    """Performance report for a single run (Design 6.72, 6.110)."""

    run_id: str
    version: str = ""
    dataset_size: int = 0
    duration_sec: float = 0.0
    memory_mb_peak: float = 0.0
    stages: Dict[str, float] = field(default_factory=dict)
    cache_hit_rate: Optional[float] = None
    tracks_processed: int = 0
    matched_count: int = 0
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Export to dictionary for JSON serialization."""
        return {
            "run_id": self.run_id,
            "version": self.version,
            "dataset_size": self.dataset_size,
            "duration_sec": round(self.duration_sec, 2),
            "memory_mb_peak": round(self.memory_mb_peak, 2),
            "stages": {k: round(v, 2) for k, v in self.stages.items()},
            "cache_hit_rate": round(self.cache_hit_rate, 2) if self.cache_hit_rate is not None else None,
            "tracks_processed": self.tracks_processed,
            "matched_count": self.matched_count,
            "created_at": self.created_at,
        }


class RunPerformanceCollector:
    """Collect performance metrics during a processing run (Design 6.48, 6.74)."""

    def __init__(self, run_id: Optional[str] = None):
        self.run_id = run_id or str(uuid.uuid4())[:8]
        self._stage_starts: Dict[str, float] = {}
        self._stage_durations: Dict[str, float] = {}
        self._start_time: Optional[float] = None
        self._end_time: Optional[float] = None
        self._memory_samples: List[float] = []
        self._dataset_size = 0
        self._tracks_processed = 0
        self._matched_count = 0
        self._cache_hits = 0
        self._cache_misses = 0

    def start_run(self, dataset_size: int = 0) -> None:
        """Start timing the run."""
        self._start_time = time.perf_counter()
        self._dataset_size = dataset_size

    def end_run(self) -> None:
        """End timing the run."""
        self._end_time = time.perf_counter()

    def start_stage(self, stage: str) -> None:
        """Start timing a stage (Design 6.49)."""
        self._stage_starts[stage] = time.perf_counter()

    def end_stage(self, stage: str, items_processed: int = 0) -> None:
        """End timing a stage and record duration."""
        if stage in self._stage_starts:
            duration_sec = time.perf_counter() - self._stage_starts[stage]
            self._stage_durations[stage] = duration_sec * 1000  # ms
            del self._stage_starts[stage]
            logger.debug("[perf] stage=%s duration_ms=%.0f", stage, duration_sec * 1000)

    def record_memory_mb(self, mb: float) -> None:
        """Record memory usage sample (Design 6.60)."""
        self._memory_samples.append(mb)

    def sample_memory(self) -> float:
        """Sample current process memory and record it. Returns MB."""
        mb = _get_process_memory_mb()
        self._memory_samples.append(mb)
        return mb

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self._cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self._cache_misses += 1

    def set_tracks_processed(self, count: int) -> None:
        """Set number of tracks processed."""
        self._tracks_processed = count

    def set_matched_count(self, count: int) -> None:
        """Set number of matched tracks."""
        self._matched_count = count

    @property
    def memory_mb_peak(self) -> float:
        """Peak memory in MB."""
        return max(self._memory_samples) if self._memory_samples else 0.0

    @property
    def cache_hit_rate(self) -> Optional[float]:
        """Cache hit rate as percentage."""
        total = self._cache_hits + self._cache_misses
        if total == 0:
            return None
        return (self._cache_hits / total) * 100

    def get_report(self, version: str = "") -> RunPerformanceReport:
        """Build final performance report (Design 6.72)."""
        duration_sec = 0.0
        if self._start_time and self._end_time:
            duration_sec = self._end_time - self._start_time

        from datetime import datetime

        return RunPerformanceReport(
            run_id=self.run_id,
            version=version,
            dataset_size=self._dataset_size,
            duration_sec=duration_sec,
            memory_mb_peak=self.memory_mb_peak,
            stages=dict(self._stage_durations),
            cache_hit_rate=self.cache_hit_rate,
            tracks_processed=self._tracks_processed,
            matched_count=self._matched_count,
            created_at=datetime.utcnow().isoformat() + "Z",
        )

    def export_json(self, path: Path, version: str = "") -> None:
        """Export report to JSON file (Design 6.65)."""
        report = self.get_report(version=version)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report.to_dict(), f, indent=2)
        logger.info("[perf] exported report to %s", path)
