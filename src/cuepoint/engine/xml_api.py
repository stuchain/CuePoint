"""Rekordbox XML playlist discovery for engine HTTP API."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from cuepoint.data.rekordbox import parse_playlist_tree, playlist_path_for_display


def _flatten_playlists(tree: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    def walk(nodes: List[Dict[str, Any]]) -> None:
        for node in nodes:
            if node.get("type") == "playlist":
                rows.append(
                    {
                        "path": node["path"],
                        "name": node["name"],
                        "display_name": playlist_path_for_display(node["path"]),
                        "track_count": node.get("track_count", 0),
                    }
                )
            elif node.get("type") == "folder":
                walk(node.get("children") or [])

    walk(tree)
    return rows


def list_xml_playlists(xml_path: str) -> Dict[str, Any]:
    """Parse XML and return hierarchical tree plus flat playlist index."""
    path = Path(xml_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"XML not found: {path}")

    tree_roots, playlists_by_path = parse_playlist_tree(str(path))
    playlists = _flatten_playlists(tree_roots)
    return {
        "xml_path": str(path),
        "tree": tree_roots,
        "playlists": playlists,
        "count": len(playlists),
        "playlist_paths": list(playlists_by_path.keys()),
    }
