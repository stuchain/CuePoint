"""Built-in theme palettes aligned with lab CSS token files."""

from __future__ import annotations

from typing import Dict, TypedDict

ThemeTokenMap = Dict[str, str]


class ThemeOption(TypedDict):
    id: str
    label: str


BUILT_IN_THEME_OPTIONS: list[ThemeOption] = [
    {"id": "neoDark", "label": "Neo-dark (default)"},
    {"id": "retro16", "label": "Retro 16-bit"},
    {"id": "qtEvolved", "label": "Qt evolved"},
    {"id": "clubNeon", "label": "Club neon"},
    {"id": "mutedPro", "label": "Muted pro"},
]

DEFAULT_THEME_ID = "neoDark"

# Token maps mirror apps/desktop-electron/renderer/src/tokens/themes/*.css
BUILT_IN_THEMES: dict[str, ThemeTokenMap] = {
    "neoDark": {
        "bg-app": "#18181b",
        "bg-panel": "#27272a",
        "bg-panel-alt": "#3f3f46",
        "bg-input": "#18181b",
        "bg-toolbar": "#1f1f23",
        "border-highlight": "#71717a",
        "border-shadow": "#09090b",
        "border-outline": "#000000",
        "border-light": "#a1a1aa",
        "border-muted": "#52525b",
        "bevel-highlight": "#71717a",
        "bevel-shadow": "#09090b",
        "fg-primary": "#fafafa",
        "fg-muted": "#a1a1aa",
        "fg-disabled": "#71717a",
        "fg-inverse": "#fafafa",
        "accent-primary": "#8b5cf6",
        "accent-primary-hover": "#a78bfa",
        "accent-primary-pressed": "#7c3aed",
        "accent-secondary": "#3f3f46",
        "accent-secondary-hover": "#52525b",
        "accent-success": "#22c55e",
        "accent-warning": "#eab308",
        "accent-danger": "#ef4444",
        "accent-info": "#6366f1",
        "overlay-header": "rgba(0, 0, 0, 0.25)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.72)",
    },
    "retro16": {
        "bg-app": "#1a1a2e",
        "bg-panel": "#3d5a80",
        "bg-panel-alt": "#2f4858",
        "bg-input": "#1b263b",
        "bg-toolbar": "#293241",
        "border-highlight": "#98c1d9",
        "border-shadow": "#0d1b2a",
        "border-outline": "#000000",
        "border-light": "#e0fbfc",
        "border-muted": "#415a77",
        "bevel-highlight": "#98c1d9",
        "bevel-shadow": "#0d1b2a",
        "fg-primary": "#e0fbfc",
        "fg-muted": "#98c1d9",
        "fg-disabled": "#778da9",
        "fg-inverse": "#0d1b2a",
        "accent-primary": "#ee6c4d",
        "accent-primary-hover": "#f2846b",
        "accent-primary-pressed": "#c8553d",
        "accent-secondary": "#3d5a80",
        "accent-secondary-hover": "#4d6a90",
        "accent-success": "#4caf50",
        "accent-warning": "#ffb703",
        "accent-danger": "#e63946",
        "accent-info": "#48cae4",
        "overlay-header": "rgba(0, 0, 0, 0.15)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.65)",
    },
    "qtEvolved": {
        "bg-app": "#1e1e1e",
        "bg-panel": "#252526",
        "bg-panel-alt": "#2d2d2d",
        "bg-input": "#1e1e1e",
        "bg-toolbar": "#333333",
        "border-highlight": "#5a5a5a",
        "border-shadow": "#141414",
        "border-outline": "#000000",
        "border-light": "#6a6a6a",
        "border-muted": "#3c3c3c",
        "bevel-highlight": "#5a5a5a",
        "bevel-shadow": "#141414",
        "fg-primary": "#ffffff",
        "fg-muted": "#888888",
        "fg-disabled": "#666666",
        "fg-inverse": "#ffffff",
        "accent-primary": "#0078d4",
        "accent-primary-hover": "#106ebe",
        "accent-primary-pressed": "#005a9e",
        "accent-secondary": "#3c3c3c",
        "accent-secondary-hover": "#4a4a4a",
        "accent-success": "#4caf50",
        "accent-warning": "#ff9800",
        "accent-danger": "#f44336",
        "accent-info": "#2196f3",
        "overlay-header": "rgba(0, 0, 0, 0.2)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.68)",
    },
    "clubNeon": {
        "bg-app": "#0a0a0f",
        "bg-panel": "#14141f",
        "bg-panel-alt": "#1a1a28",
        "bg-input": "#0a0a0f",
        "bg-toolbar": "#101018",
        "border-highlight": "#5a5a80",
        "border-shadow": "#050508",
        "border-outline": "#000000",
        "border-light": "#00e5ff",
        "border-muted": "#2a2a40",
        "bevel-highlight": "#5a5a80",
        "bevel-shadow": "#050508",
        "fg-primary": "#f0f0ff",
        "fg-muted": "#9090b0",
        "fg-disabled": "#606080",
        "fg-inverse": "#0a0a0f",
        "accent-primary": "#e040fb",
        "accent-primary-hover": "#ea80fc",
        "accent-primary-pressed": "#c2185b",
        "accent-secondary": "#1a1a28",
        "accent-secondary-hover": "#252538",
        "accent-success": "#00e676",
        "accent-warning": "#ffea00",
        "accent-danger": "#ff1744",
        "accent-info": "#00e5ff",
        "overlay-header": "rgba(0, 0, 0, 0.2)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.78)",
    },
    "mutedPro": {
        "bg-app": "#1c1f26",
        "bg-panel": "#2a3140",
        "bg-panel-alt": "#343d4f",
        "bg-input": "#1c1f26",
        "bg-toolbar": "#232833",
        "border-highlight": "#6b7280",
        "border-shadow": "#111318",
        "border-outline": "#000000",
        "border-light": "#9ca3af",
        "border-muted": "#3d4656",
        "bevel-highlight": "#6b7280",
        "bevel-shadow": "#111318",
        "fg-primary": "#e8eaed",
        "fg-muted": "#9ca3af",
        "fg-disabled": "#6b7280",
        "fg-inverse": "#1c1f26",
        "accent-primary": "#f59e0b",
        "accent-primary-hover": "#fbbf24",
        "accent-primary-pressed": "#d97706",
        "accent-secondary": "#343d4f",
        "accent-secondary-hover": "#3d4656",
        "accent-success": "#10b981",
        "accent-warning": "#f59e0b",
        "accent-danger": "#ef4444",
        "accent-info": "#38bdf8",
        "overlay-header": "rgba(0, 0, 0, 0.18)",
        "overlay-backdrop": "rgba(0, 0, 0, 0.7)",
    },
}


def is_built_in_theme(theme_id: str) -> bool:
    return theme_id in BUILT_IN_THEMES


def get_built_in_tokens(theme_id: str) -> ThemeTokenMap:
    if theme_id not in BUILT_IN_THEMES:
        raise KeyError(f"Unknown built-in theme: {theme_id}")
    return dict(BUILT_IN_THEMES[theme_id])
