#!/usr/bin/env python3
"""Create a Beatport playlist from discovery (Afro House, artists: Jimi Jules/Marasi/Diass/Yamil, labels: Nothing But/Kompakt).

Run from repo root:
  set PYTHONPATH=src && python scripts/create_incrate_playlist.py

Requires BEATPORT_ACCESS_TOKEN or beatporttoken.txt (token=...) for discovery.
For playlist creation: if the token lacks playlist scope, the script will ask you to sign in
(Beatport username/password). Add client_id= and client_secret= to beatporttoken.txt or set
BEATPORT_CLIENT_ID and BEATPORT_CLIENT_SECRET for the sign-in flow.
"""

import getpass
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import requests

# Add src so we can import cuepoint (same as pytest pythonpath)
repo_root = Path(__file__).resolve().parents[1]
src = repo_root / "src"
if str(src) not in sys.path:
    sys.path.insert(0, str(src))

from cuepoint.incrate.discovery import run_discovery
from cuepoint.incrate.playlist_writer import create_playlist_and_add_tracks
from cuepoint.services.beatport_api import BeatportApi
from cuepoint.services.beatport_api_client import BeatportApiClient
from cuepoint.services.inventory_service import InventoryService

TOKEN_URL = "https://api.beatport.com/v4/auth/o/token/"


def _read_token_file() -> dict:
    """Read key=value pairs from beatporttoken.txt."""
    out = {}
    token_file = repo_root / "beatporttoken.txt"
    if token_file.exists():
        for line in token_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip().lower()] = v.strip()
    return out


def _token() -> str:
    token = (os.environ.get("BEATPORT_ACCESS_TOKEN") or "").strip()
    if not token:
        out = _read_token_file()
        token = out.get("token", "")
    return token


def _client_credentials() -> tuple:
    """Return (client_id, client_secret) from env or beatporttoken.txt."""
    cid = (os.environ.get("BEATPORT_CLIENT_ID") or "").strip()
    csecret = (os.environ.get("BEATPORT_CLIENT_SECRET") or "").strip()
    if not cid or not csecret:
        out = _read_token_file()
        cid = cid or out.get("client_id", "")
        csecret = csecret or out.get("client_secret", "")
    return (cid, csecret)


def _token_via_password(client_id: str, client_secret: str, username: str, password: str) -> str:
    """Exchange username/password for an access token (OAuth2 password grant)."""
    resp = requests.post(
        TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username,
            "password": password,
            "grant_type": "password",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError("Token response had no access_token")
    return access_token


def main() -> None:
    token = _token()
    if not token:
        print("Error: Set BEATPORT_ACCESS_TOKEN or add token=... to beatporttoken.txt")
        sys.exit(1)

    base_url = os.environ.get("BEATPORT_API_BASE_URL", "https://api.beatport.com/v4")
    client = BeatportApiClient(base_url=base_url, access_token=token, timeout=60)
    api = BeatportApi(client, cache_service=None)

    # Minimal collection: Afro House artists and labels
    xml_content = """<?xml version="1.0"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION>
    <TRACK TrackID="1" Name="Track 1" Artist="Jimi Jules" Label="Nothing But"/>
    <TRACK TrackID="2" Name="Track 2" Artist="Marasi" Label="Nothing But"/>
    <TRACK TrackID="3" Name="Track 3" Artist="Diass" Label="Kompakt"/>
    <TRACK TrackID="4" Name="Track 4" Artist="Yamil" Label="Kompakt"/>
  </COLLECTION>
</DJ_PLAYLISTS>"""
    db_path = str(repo_root / "inventory_incrate_playlist.sqlite")
    xml_path = repo_root / "collection_incrate_playlist.xml"
    xml_path.write_text(xml_content, encoding="utf-8")
    inventory = InventoryService(db_path=db_path)
    inventory.import_from_xml(str(xml_path), enrich=False)

    # Afro House genre
    genres = api.list_genres()
    afro_house = next((g for g in genres if g.name and "afro house" in g.name.lower()), None)
    if not afro_house:
        print("Error: Afro House genre not found")
        sys.exit(1)
    genre_ids = [afro_house.id]

    to_date = date.today()
    from_date = to_date - timedelta(days=31)
    artist_names = ["Jimi Jules", "Marasi", "Diass", "Yamil"]
    label_names = ["Nothing But", "Kompakt"]

    print("Discovering (Afro House, artists: Jimi Jules/Marasi/Diass/Yamil, labels: Nothing But/Kompakt)...")
    tracks = run_discovery(
        inventory,
        api,
        genre_ids=genre_ids,
        charts_from_date=from_date,
        charts_to_date=to_date,
        new_releases_days=30,
        library_artist_names=artist_names,
        library_label_names=label_names,
    )
    print(f"Discovered {len(tracks)} tracks.")

    if not tracks:
        print("No tracks to add to playlist.")
        sys.exit(0)

    playlist_name = "Afro House - Nothing But Kompakt"
    print(f"Creating playlist '{playlist_name}' and adding {len(tracks)} tracks...")
    result = create_playlist_and_add_tracks(playlist_name, tracks, api_client=api)

    if not result.success and ("forbidden" in (result.error or "").lower() or "403" in (result.error or "")):
        client_id, client_secret = _client_credentials()
        if client_id and client_secret:
            print("\nToken cannot create playlists. Sign in with your Beatport account (used only to get a token, not stored).")
            try:
                username = input("Beatport username: ").strip()
                password = getpass.getpass("Beatport password: ")
            except (EOFError, KeyboardInterrupt):
                print("\nCancelled.")
                sys.exit(1)
            if not username or not password:
                print("Username and password are required.")
                sys.exit(1)
            try:
                print("Signing in...")
                new_token = _token_via_password(client_id, client_secret, username, password)
                client = BeatportApiClient(base_url=base_url, access_token=new_token, timeout=60)
                api = BeatportApi(client, cache_service=None)
                print("Retrying playlist creation with your account...")
                result = create_playlist_and_add_tracks(playlist_name, tracks, api_client=api)
            except requests.HTTPError as e:
                print(f"Sign-in failed: {e}")
                if e.response is not None and e.response.status_code == 401:
                    print("Invalid username or password.")
                sys.exit(1)
            except Exception as e:
                print(f"Sign-in failed: {e}")
                sys.exit(1)
        else:
            print("To sign in for playlist creation, add client_id= and client_secret= to beatporttoken.txt (or set BEATPORT_CLIENT_ID and BEATPORT_CLIENT_SECRET).")

    if result.success:
        print(f"Success: added {result.added_count} tracks to playlist.")
        if result.playlist_url:
            print(f"Playlist URL: {result.playlist_url}")
        if result.playlist_id:
            print(f"Playlist ID: {result.playlist_id}")
    else:
        print(f"Playlist creation failed: {result.error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
