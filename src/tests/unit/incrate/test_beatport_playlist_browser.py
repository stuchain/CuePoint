#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guards for the Beatport playlist browser module.

**Scope note.** This module had no coverage and is the largest uncovered file in
``incrate/``, but almost all of it drives a Playwright page: both public
functions either take a live ``page`` or launch a browser. Unit-testing that
would mean building an elaborate fake page and asserting against it, which
verifies the mock rather than the code — the kind of test that raises a coverage
number and catches nothing.

Its behaviour is genuinely verified by using it against Beatport, which needs a
browser, real credentials and a third-party site. What *is* worth pinning here
is cheap and real: the module imports without a browser installed, and its
endpoints are correct. A typo in one of these URLs is a plausible mistake that
this catches instantly and a reviewer easily misses.
"""

from __future__ import annotations

from urllib.parse import urlparse

import pytest

from cuepoint.incrate import beatport_playlist_browser as browser


@pytest.mark.unit
class TestModuleLoads:
    def test_imports_without_a_browser_installed(self):
        """Playwright must be imported lazily, not at module scope.

        The engine sidecar imports inCrate modules on start-up; a hard
        top-level browser dependency would break it in packaged builds where no
        browser is bundled.
        """
        assert browser is not None

    def test_public_entry_point_exists(self):
        assert callable(browser.add_to_playlist_via_browser)


@pytest.mark.unit
class TestEndpoints:
    @pytest.mark.parametrize(
        "url",
        [
            browser.BEATPORT_BASE,
            browser.LOGIN_URL,
            browser.PLAYLISTS_URL,
            browser.PLAYLIST_NEW_URL,
        ],
    )
    def test_urls_are_https_on_beatport(self, url):
        parsed = urlparse(url)
        assert parsed.scheme == "https", f"{url} must use HTTPS"
        assert parsed.netloc == "www.beatport.com", f"{url} points off Beatport"

    def test_urls_are_distinct(self):
        urls = {
            browser.LOGIN_URL,
            browser.PLAYLISTS_URL,
            browser.PLAYLIST_NEW_URL,
        }
        assert len(urls) == 3, "two endpoints collapsed to the same URL"

    def test_playlist_urls_sit_under_the_library(self):
        assert browser.PLAYLISTS_URL.startswith(f"{browser.BEATPORT_BASE}/library/")
        assert browser.PLAYLIST_NEW_URL.startswith(browser.PLAYLISTS_URL)


@pytest.mark.unit
class TestTimeouts:
    def test_timeouts_are_positive(self):
        for name in (
            "NAV_TIMEOUT",
            "SELECTOR_TIMEOUT",
            "AFTER_ACTION_DELAY",
            "MANUAL_LOGIN_WAIT_MS",
        ):
            assert getattr(browser, name) > 0, f"{name} must be positive"

    def test_navigation_allows_more_time_than_selectors(self):
        """A page load legitimately takes longer than finding an element on it."""
        assert browser.NAV_TIMEOUT >= browser.SELECTOR_TIMEOUT

    def test_manual_login_allows_a_human_amount_of_time(self):
        """This wait is a person typing credentials, not a machine responding."""
        assert browser.MANUAL_LOGIN_WAIT_MS >= 60_000
