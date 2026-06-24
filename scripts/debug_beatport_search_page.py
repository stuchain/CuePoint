#!/usr/bin/env python3
"""Debug Beatport search page structure."""
import json
import sys
from pathlib import Path
from urllib.parse import quote_plus

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cuepoint.data.beatport import request_html

QUERY = "The Night is Blue Tim Green"
url = f"https://www.beatport.com/search?q={quote_plus(QUERY)}"
print("Fetching:", url)
soup = request_html(url)
if not soup:
    print("soup is None")
    sys.exit(1)

links = soup.select('a[href^="/track/"]')
print("track links (old selector):", len(links))

all_links = [a.get("href", "") for a in soup.find_all("a", href=True)]
track_hrefs = [h for h in all_links if "/track/" in str(h)]
print("any /track/ links:", len(track_hrefs))
for h in track_hrefs[:8]:
    print(" ", h[:120])

nd = soup.find("script", id="__NEXT_DATA__")
if nd and nd.string:
    data = json.loads(nd.string)
    s = json.dumps(data)
    print("__NEXT_DATA__ size:", len(s))
    print("track mentions in JSON:", s.count("/track/"))
    # Save for fixture
    out = Path(__file__).resolve().parents[1] / "src" / "tests" / "fixtures" / "beatport"
    out.mkdir(parents=True, exist_ok=True)
    html_out = out / "search_page_sample.html"
    html_out.write_text(str(soup), encoding="utf-8")
    json_out = out / "search_next_data_sample.json"
    json_out.write_text(s, encoding="utf-8")
    print("saved fixtures to", out)
else:
    print("no __NEXT_DATA__")

print("title:", soup.title.string if soup.title else None)
