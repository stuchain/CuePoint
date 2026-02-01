"""
Custom exceptions.
"""

from cuepoint.exceptions.cuepoint_exceptions import (
    BeatportAPIError,
    CacheError,
    ConfigurationError,
    CuePointException,
    ExportError,
    ProcessingError,
    ReliabilityError,
    ValidationError,
    R001_NETWORK_TIMEOUT,
    R002_DISK_FULL,
    R003_OUTPUT_UNWRITABLE,
    R004_CHECKPOINT_INVALID,
)

__all__ = [
    "CuePointException",
    "ProcessingError",
    "BeatportAPIError",
    "ValidationError",
    "ConfigurationError",
    "ExportError",
    "CacheError",
    "ReliabilityError",
    "R001_NETWORK_TIMEOUT",
    "R002_DISK_FULL",
    "R003_OUTPUT_UNWRITABLE",
    "R004_CHECKPOINT_INVALID",
]
