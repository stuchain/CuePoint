"""Error reporting support (Phase 13): scrubbers that run before anything leaves the machine."""

from cuepoint.reporting.scrub import (
    OUTPUT_TAIL_ATTACHMENTS,
    ScrubContext,
    scrub_attachment,
    scrub_event,
    scrub_text,
)

__all__ = [
    "OUTPUT_TAIL_ATTACHMENTS",
    "ScrubContext",
    "scrub_attachment",
    "scrub_event",
    "scrub_text",
]
