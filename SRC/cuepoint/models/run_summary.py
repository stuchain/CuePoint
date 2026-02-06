#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Run summary model.

Captures key metrics from a processing run for GUI/CLI display.
"""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import uuid

from cuepoint.models.result import TrackResult


@dataclass
class RunSummary:
    """Summary of a processing run."""

    run_id: str
    playlist: str
    total_tracks: int
    matched: int
    unmatched: int
    low_confidence: int
    duration_sec: float
    input_xml_path: Optional[str] = None
    error_count: int = 0
    warning_count: int = 0
    output_paths: List[str] = field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    @classmethod
    def from_results(
        cls,
        results: List[TrackResult],
        playlist: str,
        duration_sec: float,
        output_paths: Optional[List[str]] = None,
        input_xml_path: Optional[str] = None,
        error_count: int = 0,
        warning_count: int = 0,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        redact_paths: bool = True,
    ) -> "RunSummary":
        total = len(results)
        matched = sum(1 for r in results if r.matched)
        unmatched = total - matched
        low_confidence = sum(1 for r in results if (r.match_score or 0.0) < 70.0)
        run_id = cls._generate_run_id(start_time or end_time)
        redacted_xml = cls.redact_path(input_xml_path, redact_paths)
        return cls(
            run_id=run_id,
            playlist=playlist,
            total_tracks=total,
            matched=matched,
            unmatched=unmatched,
            low_confidence=low_confidence,
            duration_sec=duration_sec,
            input_xml_path=redacted_xml,
            error_count=error_count,
            warning_count=warning_count,
            output_paths=output_paths or [],
            start_time=start_time,
            end_time=end_time,
        )

    @staticmethod
    def _generate_run_id(timestamp: Optional[datetime]) -> str:
        time_part = (timestamp or datetime.utcnow()).strftime("%Y%m%dT%H%M%S")
        return f"{time_part}_{uuid.uuid4().hex[:6]}"

    @staticmethod
    def redact_path(path: Optional[str], redact_paths: bool = True) -> Optional[str]:
        if not path:
            return path
        if not redact_paths:
            return path
        try:
            home = str(Path.home())
            return path.replace(home, "~")
        except Exception:
            return path

    def to_lines(self) -> List[str]:
        lines = [
            f"Run ID: {self.run_id}",
            f"Playlist: {self.playlist}",
            f"Input XML: {self.input_xml_path or 'N/A'}",
            f"Tracks: {self.total_tracks}",
            f"Matched: {self.matched}",
            f"Unmatched: {self.unmatched}",
            f"Low confidence: {self.low_confidence}",
            f"Duration: {self.duration_sec:.2f}s",
            f"Errors: {self.error_count}",
            f"Warnings: {self.warning_count}",
        ]
        if self.output_paths:
            lines.append("Outputs:")
            lines.extend([f"  - {path}" for path in self.output_paths])
        return lines

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "playlist": self.playlist,
            "input_xml_path": self.input_xml_path,
            "total_tracks": self.total_tracks,
            "matched": self.matched,
            "unmatched": self.unmatched,
            "low_confidence": self.low_confidence,
            "duration_sec": self.duration_sec,
            "errors": self.error_count,
            "warnings": self.warning_count,
            "output_paths": self.output_paths,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
        }
