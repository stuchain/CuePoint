"""Download all pages/subpages of Beatport API docs.

Opens a browser window so you can log in first if needed. When the docs are visible,
press Enter in the terminal to start downloading.

Saves:
- beatport-openapi.json in the export folder
- index.html (main docs page)
- subpages/*.html (one per tag and per operation)

Usage:
    python scripts/download_beatport_docs.py
"""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

DOCS_URL = "https://api.beatport.com/v4/docs/"
SPEC_URL = "https://api.beatport.com/v4/swagger-ui/json/"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "feature" / "beatport-docs-export"
SUBPAGES_DIR = OUTPUT_DIR / "subpages"
STATE_PATH = Path(__file__).resolve().parents[1] / "state.json"


def slug(s: str, max_len: int = 100) -> str:
    """Safe filename from string."""
    s = re.sub(r"[^\w\-]", "_", s.strip())
    return (s[:max_len] if len(s) > max_len else s) or "index"


def get_spec_from_openapi_file() -> dict | None:
    """Load OpenAPI spec from existing export if present."""
    path = OUTPUT_DIR / "beatport-openapi.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def collect_hashes_from_spec(spec: dict) -> list[tuple[str, str]]:
    """Return list of (hash, safe_name) for each tag and each operation. Swagger UI 3 uses #/tag/Name and #/operations/opId."""
    out = []
    seen_hashes = set()
    tags = set()
    for path_str, methods in (spec.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, op in methods.items():
            if method.lower() not in ("get", "post", "put", "patch", "delete", "head", "options"):
                continue
            if not isinstance(op, dict):
                continue
            for t in op.get("tags") or []:
                tags.add(t)
            op_id = op.get("operationId")
            if op_id:
                h = f"#/operations/{op_id}"
                if h not in seen_hashes:
                    seen_hashes.add(h)
                    out.append((h, f"op_{slug(op_id)}"))
    for t in sorted(tags):
        h = f"#/tag/{t}"
        if h not in seen_hashes:
            seen_hashes.add(h)
            out.append((h, f"tag_{slug(t)}"))
    return out


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SUBPAGES_DIR.mkdir(parents=True, exist_ok=True)
    captured_spec = []

    def handle_response(response):
        url = response.url
        try:
            if response.request.resource_type in ("xhr", "fetch") and "api.beatport" in url:
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    body = response.body()
                    if body and len(body) > 100:
                        try:
                            obj = json.loads(body.decode("utf-8", errors="replace"))
                            if isinstance(obj, dict) and (
                                "openapi" in obj or "swagger" in obj or "paths" in obj or "info" in obj
                            ):
                                captured_spec.append((url, obj))
                        except json.JSONDecodeError:
                            pass
        except BaseException:
            pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context_options = {"accept_downloads": True}
        if STATE_PATH.exists():
            context_options["storage_state"] = str(STATE_PATH)
        context = browser.new_context(**context_options)
        context.set_extra_http_headers({"Accept-Language": "en-US,en;q=0.9"})
        page = context.new_page()

        page.on("response", handle_response)
        page.goto(DOCS_URL, wait_until="load", timeout=60000)
        print("\nLog in in the browser if you see the login page.")
        print("When the API docs are visible, come back here and press Enter to start downloading...")
        input()

        page.wait_for_timeout(3000)

        main_html = page.content()
        (OUTPUT_DIR / "index.html").write_text(main_html, encoding="utf-8")
        print(f"Saved index.html")

        spec = None
        if captured_spec:
            spec = captured_spec[0][1]
            (OUTPUT_DIR / "beatport-openapi.json").write_text(
                json.dumps(spec, indent=2, default=str), encoding="utf-8"
            )
            print(f"Saved beatport-openapi.json (from network)")
        else:
            try:
                r = page.goto(SPEC_URL, wait_until="commit", timeout=10000)
                if r and r.status == 200:
                    body = r.body()
                    spec = json.loads(body.decode("utf-8"))
                    (OUTPUT_DIR / "beatport-openapi.json").write_text(
                        json.dumps(spec, indent=2, default=str), encoding="utf-8"
                    )
                    print(f"Saved beatport-openapi.json (from {SPEC_URL})")
            except Exception:
                pass

        if not spec:
            spec = get_spec_from_openapi_file()
        if not spec:
            print("No OpenAPI spec available; only index.html saved.")
            browser.close()
            print(f"Done. Output in {OUTPUT_DIR}")
            return

        hashes = collect_hashes_from_spec(spec)
        base = DOCS_URL.rstrip("/")
        for i, (hash_part, safe_name) in enumerate(hashes):
            full_url = base + hash_part
            try:
                page.goto(full_url, wait_until="domcontentloaded", timeout=15000)
                page.wait_for_timeout(500)
                content = page.content()
                out_file = SUBPAGES_DIR / f"{safe_name}.html"
                out_file.write_text(content, encoding="utf-8")
                print(f"Saved subpages/{out_file.name}")
            except Exception as e:
                print(f"Skip {hash_part}: {e}")

        for a in page.query_selector_all("a[href]"):
            href = (a.get_attribute("href") or "").strip()
            if not href or href == "#" or not href.startswith("#"):
                continue
            path_key = href.split("?")[0]
            safe_name = slug(path_key.strip("#/")) or "index"
            if safe_name in ("index", "tag", "operations"):
                continue
            full_url = base + href
            try:
                page.goto(full_url, wait_until="domcontentloaded", timeout=10000)
                page.wait_for_timeout(300)
                content = page.content()
                out_file = SUBPAGES_DIR / f"link_{safe_name}.html"
                out_file.write_text(content, encoding="utf-8")
                print(f"Saved subpages/{out_file.name}")
            except Exception:
                pass

        try:
            context.storage_state(path=str(STATE_PATH))
            print("Saved login state to state.json for next time.")
        except Exception:
            pass

        browser.close()

    print(f"Done. Output in {OUTPUT_DIR}, subpages in {SUBPAGES_DIR}")


if __name__ == "__main__":
    main()
