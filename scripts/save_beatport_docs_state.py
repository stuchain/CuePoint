"""Save Beatport docs login state for reuse (e.g. capturing OpenAPI spec).

Usage:
    python scripts/save_beatport_docs_state.py

- Opens https://api.beatport.com/v4/docs/ in Chromium (visible window).
- You log in manually, then press Enter in the terminal.
- Saves cookies/storage to state.json (gitignored).

Reuse the state in another script with:
    context = browser.new_context(storage_state="state.json")
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    page.goto("https://api.beatport.com/v4/docs/")
    print("Log in manually, then close the tab or press Enter here...")
    input()

    context.storage_state(path="state.json")
    browser.close()
    print("Saved state to state.json")
