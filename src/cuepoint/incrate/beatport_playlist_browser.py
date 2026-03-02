"""Add tracks to a Beatport playlist via browser automation (Playwright). Use when API add-to-playlist fails."""

import logging
import re
import time
from typing import List, Optional, Union

from cuepoint.incrate.beatport_api_models import DiscoveredTrack
from cuepoint.incrate.playlist_writer import PlaylistResult
from cuepoint.services.beatport_api import api_track_url_to_web

_logger = logging.getLogger(__name__)

BEATPORT_BASE = "https://www.beatport.com"
LOGIN_URL = "https://www.beatport.com/account/login"
PLAYLISTS_URL = "https://www.beatport.com/library/playlists"
PLAYLIST_NEW_URL = "https://www.beatport.com/library/playlists/new"

# Timeouts (ms)
NAV_TIMEOUT = 30_000
SELECTOR_TIMEOUT = 15_000
AFTER_ACTION_DELAY = 500
MANUAL_LOGIN_WAIT_MS = 120_000  # 2 minutes to log in manually


def _do_beatport_login(page, username: str, password: str) -> Optional[str]:
    """Fill Beatport login form and submit. Handles modal 'Log In' button if present.
    Uses timeouts and waits for load state to avoid 'Execution context was destroyed' on navigation.
    Returns None on success, or an error message string on failure.
    """
    t = SELECTOR_TIMEOUT
    try:
        page.wait_for_load_state("domcontentloaded", timeout=t)
        # If the "Create Account or Log In" modal is shown, click the "Log In" button inside the dialog first
        try:
            modal_log_in = page.locator('[role="dialog"]').get_by_role("button", name=re.compile(r"log\s*in", re.I))
            modal_log_in.first.click(timeout=5000)
            page.wait_for_timeout(1200)
            page.wait_for_load_state("domcontentloaded", timeout=t)
        except Exception:
            pass
        # Beatport login form uses id="username" and id="password" (form id="login-form")
        user_input = page.locator("#username")
        try:
            user_input.first.wait_for(state="visible", timeout=t)
        except Exception:
            user_input = page.get_by_placeholder("Username")
            try:
                user_input.first.wait_for(state="visible", timeout=5000)
            except Exception:
                user_input = page.locator('input[name="username"], input[type="text"]')
                user_input.first.wait_for(state="visible", timeout=5000)
        user_input.first.fill(username, timeout=5000)
        page.wait_for_timeout(200)
        pass_input = page.locator("#password")
        try:
            pass_input.first.wait_for(state="visible", timeout=5000)
        except Exception:
            pass_input = page.get_by_placeholder("Password")
            try:
                pass_input.first.wait_for(state="visible", timeout=5000)
            except Exception:
                pass_input = page.locator('input[type="password"], input[name="password"]')
                pass_input.first.wait_for(state="visible", timeout=5000)
        pass_input.first.fill(password, timeout=5000)
        page.wait_for_timeout(300)
        # Submit: Beatport login form id="login-form", single submit button (type="submit", Mui styled)
        login_btn = page.locator("#login-form button[type='submit']")
        login_btn.first.wait_for(state="visible", timeout=5000)
        login_btn.first.scroll_into_view_if_needed(timeout=5000)
        # Click and wait for navigation so login completes before caller continues to create playlist
        try:
            with page.expect_navigation(timeout=NAV_TIMEOUT, wait_until="domcontentloaded"):
                login_btn.first.click(timeout=5000)
        except Exception:
            # No navigation (e.g. client-side redirect); caller will wait for playlist form
            pass
        return None
    except Exception as e:
        return str(e) or "Login form failed"


def add_to_playlist_via_browser(
    name: str,
    tracks: List[DiscoveredTrack],
    username: str,
    password: str,
    headless: bool = False,
) -> PlaylistResult:
    """Open Chromium, log in to Beatport (with stored credentials or manually), then create a playlist and add tracks.

    If Beatport username and password are provided (e.g. from Settings → inCrate), the browser will
    open the login page, click "Log In" if the Create Account modal is shown, fill the form, and submit.
    Otherwise it waits for you to sign in manually (and complete 2FA if needed).
    After login, it creates the playlist and adds each track automatically.

    Args:
        name: Playlist name.
        tracks: Tracks to add (must have beatport_url).
        username: Beatport username (from config). If set with password, used to auto-login.
        password: Beatport password (from config). If set with username, used to auto-login.
        headless: If False, show the browser window (required for manual login).

    Returns:
        PlaylistResult with success, playlist_url, added_count, and error message if failed.
    """
    if not tracks:
        return PlaylistResult(
            success=True,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=None,
        )
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error="Playwright is not installed. Run: pip install playwright && playwright install chromium",
        )
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            page = context.new_page()
            page.set_default_timeout(SELECTOR_TIMEOUT)
            page.set_default_navigation_timeout(NAV_TIMEOUT)

            try:
                def _not_on_login(url: Union[str, object]) -> bool:
                    u = getattr(url, "path", None) or str(url)
                    return "/account/login" not in u

                if username and password:
                    # 1a) Go to playlist-create page first; Beatport shows "Create Account or Log In" modal there
                    _logger.info("Beatport browser: opening playlist page (login modal will appear)")
                    page.goto(PLAYLIST_NEW_URL, wait_until="domcontentloaded")
                    page.wait_for_load_state("domcontentloaded", timeout=NAV_TIMEOUT)
                    page.wait_for_timeout(2500)
                    # Wait for login UI to be present (modal or form) so we don't run during navigation
                    try:
                        page.wait_for_selector(
                            '[role="dialog"] button[name="Log In"], #username, input[placeholder="Username"]',
                            state="visible",
                            timeout=SELECTOR_TIMEOUT,
                        )
                    except Exception:
                        pass
                    page.wait_for_load_state("domcontentloaded", timeout=10000)
                    _logger.info("Beatport browser: logging in with stored credentials")
                    login_err = _do_beatport_login(page, username, password)
                    if login_err:
                        return PlaylistResult(
                            success=False,
                            playlist_url=None,
                            playlist_id=None,
                            added_count=0,
                            error=f"Auto-login failed: {login_err}. Check Settings → inCrate username/password.",
                        )
                    # Wait until we're past login: either redirected away from login URL or playlist form visible
                    try:
                        page.wait_for_url(_not_on_login, timeout=NAV_TIMEOUT)
                    except Exception:
                        pass
                    # If still on a page with login, or modal just closed, wait for playlist name field
                    name_sel = 'input[placeholder*="name" i], input[name="name"], input[id*="name" i]'
                    try:
                        page.wait_for_selector(name_sel, state="visible", timeout=NAV_TIMEOUT)
                    except Exception:
                        if "/account/login" in (getattr(page.url, "path", None) or str(page.url)):
                            return PlaylistResult(
                                success=False,
                                playlist_url=None,
                                playlist_id=None,
                                added_count=0,
                                error="Login form was submitted but still on login page (wrong credentials or captcha).",
                            )
                    page.wait_for_timeout(1500)
                else:
                    # 1b) No stored credentials: open login page and wait for manual login
                    _logger.info("Beatport browser: opening login page — log in manually in the browser window")
                    page.goto(LOGIN_URL, wait_until="domcontentloaded")
                    page.wait_for_timeout(1500)
                    try:
                        page.wait_for_url(_not_on_login, timeout=MANUAL_LOGIN_WAIT_MS)
                    except Exception:
                        return PlaylistResult(
                            success=False,
                            playlist_url=None,
                            playlist_id=None,
                            added_count=0,
                            error="Timed out waiting for you to log in. Log in to Beatport in the browser window, or set Beatport username/password in Settings → inCrate.",
                        )
                    page.wait_for_timeout(1500)
                    page.goto(PLAYLIST_NEW_URL, wait_until="domcontentloaded")
                    page.wait_for_timeout(1500)

                # 2) Create playlist
                _logger.info("Beatport browser: creating playlist %r", name)
                page.goto(PLAYLIST_NEW_URL, wait_until="domcontentloaded")
                page.wait_for_timeout(1500)
                name_sel = 'input[placeholder*="name" i], input[name="name"], input[id*="name" i]'
                name_loc = page.locator(name_sel)
                if name_loc.count() == 0:
                    # Maybe we're on a "Create playlist" button page first
                    create_btn = page.get_by_role("link", name=re.compile(r"create\s*playlist", re.I))
                    if create_btn.count() > 0:
                        create_btn.first.click()
                        page.wait_for_timeout(1500)
                    name_loc = page.locator(name_sel)
                if name_loc.count() == 0:
                    return PlaylistResult(
                        success=False,
                        playlist_url=None,
                        playlist_id=None,
                        added_count=0,
                        error="Could not find playlist name field. Create the playlist manually in the browser.",
                    )
                name_loc.first.fill(name)
                page.wait_for_timeout(300)
                save_btn = page.get_by_role("button", name=re.compile(r"save|create", re.I))
                if save_btn.count() == 0:
                    save_btn = page.locator('button[type="submit"]')
                if save_btn.count() > 0:
                    save_btn.first.click()
                else:
                    return PlaylistResult(
                        success=False,
                        playlist_url=None,
                        playlist_id=None,
                        added_count=0,
                        error="Could not find Save/Create button for playlist.",
                    )
                page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT)
                page.wait_for_timeout(1500)
                playlist_url = page.url
                if "/library/playlists" not in playlist_url and "/playlist/" not in playlist_url:
                    playlist_url = PLAYLISTS_URL

                # 3) Add each track: go to track page, click Add to playlist, select our playlist
                added = 0
                for i, track in enumerate(tracks):
                    raw_url = (track.beatport_url or "").strip()
                    # Convert API URL (e.g. https://api.beatport.com/v4/catalog/tracks/123/) to web URL
                    url = api_track_url_to_web(
                        raw_url,
                        track_id=getattr(track, "beatport_track_id", None),
                    )
                    if not url or "/track/" not in url:
                        _logger.warning("Track %s has no track URL, skipping", getattr(track, "title", i))
                        continue
                    _logger.info("Beatport browser: adding track %s/%s %s", i + 1, len(tracks), url)
                    page.goto(url, wait_until="domcontentloaded")
                    try:
                        page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    page.wait_for_timeout(1000)
                    # Beatport uses data-testid="add-to-playlist-button" on the actual button
                    add_btn = page.locator('[data-testid="add-to-playlist-button"]')
                    if add_btn.count() == 0:
                        _logger.warning("Add to playlist button not found for %s", url)
                        continue
                    btn = add_btn.first
                    btn.scroll_into_view_if_needed()
                    btn.click(force=True)
                    page.wait_for_timeout(1000)
                    # Modal "Select playlist": 1) click the select button (checkbox) for our playlist row, 2) click "Add to Playlist" to confirm
                    page.wait_for_timeout(800)
                    safe_name = name.replace('"', '\\"')[:80]
                    # Find row containing playlist name, then click its select button (button.select or icon-checkbox)
                    playlist_row = page.locator('.item-row').filter(has_text=re.compile(re.escape(safe_name), re.I))
                    if playlist_row.count() == 0:
                        playlist_row = page.locator('[role="row"]').filter(has_text=re.compile(re.escape(safe_name), re.I))
                    if playlist_row.count() == 0:
                        playlist_row = page.get_by_text(safe_name, exact=False)
                    if playlist_row.count() == 0:
                        _logger.warning("Playlist %r not found in modal for %s", name, url)
                    else:
                        select_btn = playlist_row.first.locator('button.select, [data-testid="icon-checkbox"]')
                        if select_btn.count() > 0:
                            select_btn.first.click()
                        else:
                            playlist_row.first.click()
                        page.wait_for_timeout(400)
                        # Click the modal's "Add to Playlist" confirm button (has name="Add to Playlist")
                        confirm_btn = page.locator('button[name="Add to Playlist"]')
                        if confirm_btn.count() == 0:
                            confirm_btn = page.get_by_role("button", name=re.compile(r"add\s*to\s*playlist", re.I))
                        if confirm_btn.count() > 0:
                            confirm_btn.first.click()
                            added += 1
                        else:
                            _logger.warning("Add to Playlist confirm button not found in modal for %s", url)
                    page.wait_for_timeout(AFTER_ACTION_DELAY)

                browser.close()
                return PlaylistResult(
                    success=True,
                    playlist_url=playlist_url,
                    playlist_id=None,
                    added_count=added,
                    error=None,
                )
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception as e:
        _logger.exception("Beatport browser playlist failed")
        return PlaylistResult(
            success=False,
            playlist_url=None,
            playlist_id=None,
            added_count=0,
            error=str(e) or "Browser automation failed",
        )
