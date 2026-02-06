#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Preflight validation result models.

Defines structured output for preflight checks so UI/CLI can present
errors and warnings consistently.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class PreflightIssue:
    """Represents a single preflight issue."""

    code: str
    message: str


@dataclass
class PreflightResult:
    """Preflight validation result."""

    errors: List[PreflightIssue] = field(default_factory=list)
    warnings: List[PreflightIssue] = field(default_factory=list)
    checks: Dict[str, Any] = field(default_factory=dict)
    warnings_only: bool = False
    generated_at: Optional[datetime] = None

    @property
    def can_proceed(self) -> bool:
        return len(self.errors) == 0

    def error_messages(self) -> List[str]:
        return [f"{issue.code}: {issue.message}" for issue in self.errors]

    def warning_messages(self) -> List[str]:
        return [f"{issue.code}: {issue.message}" for issue in self.warnings]

    def to_report(self) -> Dict[str, Any]:
        return {
            "generated_at": self.generated_at.isoformat()
            if self.generated_at
            else None,
            "warnings_only": self.warnings_only,
            "checks": self.checks,
            "errors": [
                {"code": issue.code, "message": issue.message} for issue in self.errors
            ],
            "warnings": [
                {"code": issue.code, "message": issue.message}
                for issue in self.warnings
            ],
        }
