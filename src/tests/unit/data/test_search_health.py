"""``search_health``: a failed search is told apart from a search that found nothing."""

from __future__ import annotations

import contextvars
from concurrent.futures import ThreadPoolExecutor

import pytest

from cuepoint.data import search_health as sh

pytestmark = pytest.mark.unit


class TestCollect:
    def test_a_failure_noted_inside_the_block_is_recorded(self):
        with sh.collect() as log:
            sh.note("beatport.com", sh.KIND_BLOCKED, "HTTP 403")
        assert log.worst_kind() == sh.KIND_BLOCKED
        assert log.describe() == "beatport.com blocked (HTTP 403)"

    def test_a_failure_noted_outside_any_block_is_dropped(self):
        sh.note("beatport.com", sh.KIND_BLOCKED)  # must not raise

    def test_nothing_noted_means_nothing_failed(self):
        with sh.collect() as log:
            pass
        assert log.worst_kind() is None

    def test_the_worst_kind_wins(self):
        with sh.collect() as log:
            sh.note("duckduckgo", sh.KIND_UNAVAILABLE)
            sh.note("beatport.com", sh.KIND_TIMEOUT)
            sh.note("beatport.com", sh.KIND_BLOCKED)
        assert log.worst_kind() == sh.KIND_BLOCKED

    def test_the_same_failure_is_recorded_once(self):
        with sh.collect() as log:
            for _ in range(5):
                sh.note("beatport.com", sh.KIND_BLOCKED, "HTTP 403")
        assert len(log.failures) == 1

    def test_a_pool_thread_started_in_a_copied_context_reports_to_the_track(self):
        with sh.collect() as log, ThreadPoolExecutor(max_workers=2) as pool:
            future = pool.submit(
                contextvars.copy_context().run,
                sh.note,
                "beatport.com",
                sh.KIND_BLOCKED,
            )
            future.result()
        assert log.worst_kind() == sh.KIND_BLOCKED

    def test_two_tracks_do_not_share_a_record(self):
        with sh.collect() as first:
            sh.note("beatport.com", sh.KIND_BLOCKED)
        with sh.collect() as second:
            pass
        assert first.worst_kind() is not None
        assert second.worst_kind() is None


class TestCooldown:
    def test_a_backend_marked_down_is_skipped_until_the_cooldown_ends(self):
        now = [100.0]
        sh.set_clock(lambda: now[0])
        sh.mark_down("duckduckgo", sh.KIND_BLOCKED, "ratelimit", seconds=60)
        assert sh.is_down("duckduckgo") is True
        now[0] = 159.0
        assert sh.is_down("duckduckgo") is True
        now[0] = 160.0
        assert sh.is_down("duckduckgo") is False

    def test_skipping_a_down_backend_still_counts_as_a_failure_for_the_track(self):
        sh.mark_down("beatport.com", sh.KIND_BLOCKED, "HTTP 403")
        with sh.collect() as log:
            assert sh.is_down("beatport.com")
        assert log.worst_kind() == sh.KIND_BLOCKED

    def test_a_backend_never_marked_is_up(self):
        assert sh.is_down("beatport.com") is False


class TestErrorText:
    @pytest.mark.parametrize("kind", sh.KINDS)
    def test_the_error_round_trips_to_its_kind(self, kind):
        assert sh.failure_kind(sh.failure_error(kind)) == kind

    def test_the_error_starts_with_the_stable_code(self):
        assert sh.failure_error(sh.KIND_BLOCKED).startswith("search_failed:blocked: ")

    @pytest.mark.parametrize("other", [None, "", "boom", "search_failedX"])
    def test_any_other_error_is_not_a_search_failure(self, other):
        assert sh.failure_kind(other) is None
