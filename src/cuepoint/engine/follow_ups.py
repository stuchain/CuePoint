#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Jobs that follow other jobs, started once, never lost (CLEAN-07, CLEAN-08).

A file check follows every import and refresh (DEC-073); a duplicate scan
follows those and every match job (DEC-074). Each follow-up has the same one
problem. The job it follows can finish while a job of the follow-up's own kind
is still running, which read the library before it changed and cannot be joined
by a second one. So the follow-up is remembered, and the running job starts it
as it finishes.

Remembering and finishing meet under one lock, per kind of follow-up: the
request sees the running job and records the follow-up atomically, and the
running job only looks for one after it has set its terminal state. Between
them the follow-up can be neither lost nor started twice. Written once here,
because two copies of that argument would be two places for it to break.
"""

from __future__ import annotations

import logging
import threading
import weakref
from typing import Callable, Optional

from cuepoint.engine.jobs import Job, JobStore, JobTypeBusyError

_logger = logging.getLogger(__name__)


class FollowUps:
    """One kind of job that follows other jobs.

    Args:
        job_type: The follow-up's job type.
        noun: What to call it in the log.
        start: Starts one over the whole library, given the store and the
            trigger; raises :class:`JobTypeBusyError` when it cannot start.
    """

    def __init__(
        self, job_type: str, noun: str, start: Callable[[JobStore, str], Job]
    ) -> None:
        self._job_type = job_type
        self._noun = noun
        self._start = start
        # Weakly keyed, so a store a test threw away is not kept alive by a
        # follow-up it will never run.
        self._waiting: "weakref.WeakKeyDictionary[JobStore, str]" = (
            weakref.WeakKeyDictionary()
        )
        self._lock = threading.Lock()

    def request(self, store: JobStore, trigger: str) -> Optional[Job]:
        """Start the follow-up now, or once the running one of its kind finishes.

        Never raises: the job it follows has already finished, and nothing about
        starting a follow-up may turn that into a failure.

        Returns:
            The job, or None when it could not start now. A running job of the
            same kind means the follow-up waits for it; any other conflicting
            job is rewriting the library and will ask for its own.
        """
        try:
            with self._lock:
                try:
                    return self._start(store, trigger)
                except JobTypeBusyError as exc:
                    if exc.job_type == self._job_type:
                        self._waiting[store] = trigger
                        _logger.info(
                            "[follow-up] a %s is running; the %s one follows it",
                            self._noun,
                            trigger,
                        )
                    else:
                        _logger.info(
                            "[follow-up] the %s %s is left to the %s job now running",
                            trigger,
                            self._noun,
                            exc.job_type,
                        )
                    return None
        except Exception as exc:  # noqa: BLE001 — must not fail a finished job
            _logger.warning(
                "[follow-up] could not start the %s %s: %s", trigger, self._noun, exc
            )
            return None

    def job_finished(self, store: JobStore) -> None:
        """Start the follow-up that waited for a job of this kind, if any.

        Called by that job once its terminal state is set.
        """
        with self._lock:
            trigger = self._waiting.pop(store, None)
        if trigger is not None:
            self.request(store, trigger)

    def pending(self, store: JobStore) -> Optional[str]:
        """The trigger of a follow-up waiting on ``store``, or None."""
        with self._lock:
            return self._waiting.get(store)


__all__ = ("FollowUps",)
