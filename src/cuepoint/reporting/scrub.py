"""Scrub a report of everything personal before it leaves the machine (REPORT-02, DEC-127).

Pure functions over plain event dicts shaped like Sentry events. Nothing here sends anything and
no SDK is imported. ``apps/desktop-electron/electron/reportScrub.ts`` is the same rule in
TypeScript; both are held to ``src/tests/fixtures/reporting/scrub_corpus.json`` and must give the
same output on every entry. Change one, change the other, and add the example to the corpus.

The home folder is replaced first (rule 2, even with spaces in it, either separator, any case for
Windows-style homes) and paths continue from ``<home>``. Rules below are numbered after that: 3 quotes,
4 paths, 5 the user's name, 6 URLs. A path may start after ``:`` or ``>``, may carry a ``:line:col``
suffix that is kept, and an API route keeps its path but loses its query values.

Text rules, in this order (``scrub_text``):

1. Tokens: literals in ``ScrubContext.tokens``, ``Bearer x``, ``token=x`` style pairs, JWTs
   (``eyJ...`` with three dot-separated parts), and runs of 32 or more hex characters or of 32 or
   more base64 characters with at least one digit (so a long word or a slug is not hit). The key
   stays and the value becomes ``<token>``: ``Bearer <token>``, ``token=<token>``.
2. Quoted values: text inside ``'...'``, ``"..."``, curly double quotes and curly single quotes
   becomes ``<value>`` and the quotes stay. When the inside is a path, rule 3 shapes it instead.
   An apostrophe inside a word (``don't``) is not a quote: an opening quote is not preceded by a
   letter or digit and a closing one is not followed by one. A quote does not span lines.
3. Paths keep their shape: ``C:\\Users\\anna\\Music\\a.flac`` becomes ``<home>\\<dir>\\<dir>\\<file>.flac``.
   Windows drive paths, UNC paths, POSIX paths with two or more segments, ``~/...``, ``file://``
   URLs and percent-encoded forms are recognised. Under the home folder the path starts with
   ``<home>``; elsewhere it keeps its drive, its leading ``/`` or its UNC prefix (``\\\\<host>\\<share>``).
   Under an app root it starts with ``<app>`` and keeps its real segments. The final extension
   stays when it is 1 to 5 letters or digits. A ``file://`` prefix stays. API routes
   (``/api/v1/...``) are not files and are left alone.
   **An unquoted path ends at whitespace**, so a path with spaces is only safe when quoted (or when
   it is a whole field value, as ``abs_path`` and ``transaction`` are). Raise sites quote theirs.
4. The home folder anywhere else, and the user's name as a whole word (case-insensitive).
5. http and https URLs: scheme, host and first path segment stay, later non-numeric segments and
   every query value become ``<value>``. Loopback URLs keep the whole path. User info and the
   fragment are removed.

Event rules (``scrub_event``) are described on that function. Both functions return new objects and
never touch their input.
"""

from __future__ import annotations

import copy
import getpass
import os
import re
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

__all__ = [
    "KEY_SUFFIXES",
    "OUTPUT_TAIL_ATTACHMENTS",
    "STANDARD_CONTEXTS",
    "ScrubContext",
    "scrub_attachment",
    "scrub_event",
    "scrub_text",
]

#: Attachments the reporter adds on purpose (REPORT-05); every other attachment is dropped.
OUTPUT_TAIL_ATTACHMENTS = ("engine-output.txt", "player-output.txt")

#: A key in ``extra``, a non-standard context or breadcrumb ``data`` whose lower-cased form, with
#: ``_`` and ``-`` removed, ends with one of these has its value replaced. Plurals are included so
#: ``notes`` and ``playlists`` are covered as well as ``note`` and ``playlist``.
KEY_SUFFIXES = (
    "title",
    "artist",
    "label",
    "album",
    "remixer",
    "playlist",
    "name",
    "note",
    "tag",
    "tags",
    "comment",
    "query",
    "search",
    "path",
    "file",
    "location",
    "token",
    "password",
    "secret",
    "titles",
    "artists",
    "labels",
    "albums",
    "remixers",
    "playlists",
    "names",
    "notes",
    "comments",
    "queries",
    "searches",
    "paths",
    "files",
    "locations",
    "tokens",
    "passwords",
    "secrets",
)

#: Contexts the SDKs fill in themselves. They are kept as they are, except a device name.
STANDARD_CONTEXTS = (
    "os",
    "runtime",
    "app",
    "device",
    "browser",
    "trace",
    "culture",
    "gpu",
    "chrome",
    "node",
    "electron",
)

_DROPPED_EVENT_KEYS = frozenset({"server_name", "user", "request"})
_DROPPED_BREADCRUMB_CATEGORIES = frozenset({"ui.click", "ui.input", "console"})
_DEVICE_NAME_KEYS = frozenset({"device_name", "hostname"})
#: Top-level keys that describe the SDK, the build or the event itself and are kept untouched.
_KEPT_EVENT_KEYS = frozenset(
    {
        "event_id",
        "timestamp",
        "level",
        "platform",
        "release",
        "dist",
        "environment",
        "sdk",
        "modules",
        "fingerprint",
        "type",
        "debug_meta",
    }
)
_FRAME_KEYS = (
    "filename",
    "module",
    "function",
    "lineno",
    "colno",
    "in_app",
    "context_line",
    "pre_context",
    "post_context",
)

VALUE = "<value>"
TOKEN = "<token>"


@dataclass(frozen=True)
class ScrubContext:
    """What this machine knows that a report must not carry.

    ``app_roots`` are the install and resources folders whose paths keep their names.
    """

    home: str | None = None
    user_name: str | None = None
    app_roots: tuple[str, ...] = ()
    tokens: tuple[str, ...] = ()

    @classmethod
    def from_environment(cls) -> ScrubContext:
        """Build the context for this process: home, user, the frozen app's folder, the token."""
        try:
            home: str | None = str(Path.home())
        except (RuntimeError, KeyError, OSError):
            home = None
        try:
            user_name: str | None = getpass.getuser()
        except (KeyError, OSError, ImportError):
            user_name = None
        roots: tuple[str, ...] = ()
        if getattr(sys, "frozen", False) and sys.executable:
            roots = (str(Path(sys.executable).parent),)
        token = os.environ.get("CUEPOINT_TOKEN")
        return cls(
            home=home,
            user_name=user_name or None,
            app_roots=roots,
            tokens=(token,) if token else (),
        )


# ---------------------------------------------------------------------------
# Character classes shared by every pattern. Whitespace is an explicit set, the same in the
# TypeScript scrubber, so the two never disagree about where an unquoted path ends.
# ---------------------------------------------------------------------------

_WS = " \\t\\n\\r\\f\\v\\u00a0\\u2028\\u2029"
_S = "[" + _WS + "]"
_NS = "[^" + _WS + "]"

# ---------------------------------------------------------------------------
# Rule 1: tokens
# ---------------------------------------------------------------------------

_BEARER = re.compile(r"(?i)(?<![A-Za-z0-9])(Bearer" + _S + r"+)[A-Za-z0-9._~+/=-]+")
_AUTH_SCHEME = re.compile(
    r"(?i)(?<![A-Za-z0-9])(Authorization"
    + _S
    + r"*:"
    + _S
    + r"*(?:Basic|Digest|Negotiate)"
    + _S
    + r"+)"
    + _NS
    + "+"
)
_COOKIE = re.compile(
    r"(?i)(?<![A-Za-z0-9-])((?:Set-)?Cookie" + _S + r"*:[ \t]*)[^\r\n]+"
)
_KEY_VALUE = re.compile(
    r"(?i)(?<![A-Za-z0-9])((?:access[_-]?token|refresh[_-]?token|api[_-]?key|token|password"
    r"|secret|credentials?)" + _S + r"*[=:]" + _S + r"*)(['\"]?)([^&" + _WS + r"'\"]+)"
)
_JWT = re.compile(
    r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"
)
_HEX_RUN = re.compile(r"(?<![A-Za-z0-9])[0-9A-Fa-f]{32,}(?![A-Za-z0-9])")
_BASE64_RUN = re.compile(
    r"(?<![A-Za-z0-9+])(?=[A-Za-z+]*[0-9])[A-Za-z0-9+]{32,}(?![A-Za-z0-9+])"
)
_MIN_TOKEN_LITERAL = 4


def _scrub_tokens(text: str, ctx: ScrubContext) -> str:
    for literal in sorted(
        {t for t in ctx.tokens if len(t) >= _MIN_TOKEN_LITERAL}, key=len, reverse=True
    ):
        text = text.replace(literal, TOKEN)
    text = _BEARER.sub(lambda m: m.group(1) + TOKEN, text)
    text = _AUTH_SCHEME.sub(lambda m: m.group(1) + TOKEN, text)
    text = _COOKIE.sub(lambda m: m.group(1) + TOKEN, text)
    text = _KEY_VALUE.sub(lambda m: m.group(1) + m.group(2) + TOKEN, text)
    text = _JWT.sub(TOKEN, text)
    text = _HEX_RUN.sub(TOKEN, text)
    return _BASE64_RUN.sub(TOKEN, text)


# ---------------------------------------------------------------------------
# The home folder, replaced before anything else reads the text
# ---------------------------------------------------------------------------

_HOME_PATTERNS: dict[str, re.Pattern[str] | None] = {}


def _case_insensitive(char: str) -> str:
    if ("a" <= char <= "z") or ("A" <= char <= "Z"):
        return "[" + char.lower() + char.upper() + "]"
    return re.escape(char)


def _home_pattern(home: str) -> re.Pattern[str] | None:
    """The home folder as a pattern: either separator, case-insensitive for Windows-style homes."""
    if home in _HOME_PATTERNS:
        return _HOME_PATTERNS[home]
    bare = home.rstrip("\\/")
    pattern: re.Pattern[str] | None = None
    if len(bare) >= 3:
        windows = _is_windows_style(bare)
        pieces = [
            "".join(_case_insensitive(c) if windows else re.escape(c) for c in part)
            for part in re.split(r"[\\/]+", bare)
        ]
        lead = "[\\\\/]" if pieces[0] == "" else ""
        pattern = re.compile(
            lead + "[\\\\/]+".join(p for p in pieces if p) + r"(?![A-Za-z0-9_])"
        )
    _HOME_PATTERNS[home] = pattern
    return pattern


def _replace_home(text: str, ctx: ScrubContext) -> str:
    """Rule 2: the home folder wherever it appears, even with spaces in it. Paths continue from it."""
    pattern = _home_pattern(ctx.home) if ctx.home else None
    return pattern.sub("<home>", text) if pattern else text


# ---------------------------------------------------------------------------
# Rule 4: paths
# ---------------------------------------------------------------------------

_SEPARATOR = re.compile(r"([\\/])")
_WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:[\\/]")
_UNC = re.compile(r"^(\\\\|//)([^\\/]+)([\\/])([^\\/]+)")
_ROUTE = re.compile(r"^/api/v[0-9]+(?:/|\Z)")
_PATH_START = re.compile(
    r"^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+\\[^\\/]+|//[^/]+/[^/]+|~[\\/]|[Ff][Ii][Ll][Ee]://"
    r"|<home>[\\/]|/[^/]+/[^/]+)"
)
_EXTENSION = re.compile(r"^[A-Za-z0-9]{1,5}\Z")
_LINE_COL = re.compile(r"(?::[0-9]+){1,2}\Z")
_PERCENT_RUN = re.compile(r"(?:%[0-9A-Fa-f]{2})+")
_TRAILING_PUNCTUATION = ".,;:!?)]}'\"’”"


def _percent_decode(text: str) -> str:
    def decode(match: re.Match[str]) -> str:
        raw = bytes(
            int(h, 16) for h in re.findall(r"%([0-9A-Fa-f]{2})", match.group(0))
        )
        return raw.decode("utf-8", errors="replace")

    return _PERCENT_RUN.sub(decode, text)


def _is_path(text: str) -> bool:
    return _PATH_START.match(text) is not None


def _is_windows_style(text: str) -> bool:
    return _WINDOWS_DRIVE.match(text) is not None or text.startswith("\\\\")


def _under(path: str, root: str, windows: bool | None = None) -> str | None:
    """The part of ``path`` after ``root`` (empty or starting with a separator), else None."""
    root = root.rstrip("\\/")
    if not root:
        return None
    if windows is None:
        windows = _is_windows_style(root)

    def norm(value: str) -> str:
        value = value.replace("\\", "/")
        return value.lower() if windows else value

    a, b = norm(path), norm(root)
    if a.startswith(b) and (len(a) == len(b) or a[len(b)] == "/"):
        return path[len(root) :]
    return None


def _shape_rest(rest: str) -> str:
    parts = _SEPARATOR.split(rest)
    last = len(parts) - 1
    for i in range(0, len(parts), 2):
        segment = parts[i]
        if not segment:
            continue
        if i == last:
            dot = segment.rfind(".")
            ext = segment[dot + 1 :] if dot > 0 else ""
            parts[i] = f"<file>.{ext}" if _EXTENSION.match(ext) else "<file>"
        else:
            parts[i] = "<dir>"
    return "".join(parts)


def _scrub_query(query: str) -> str:
    """Every query value becomes ``<value>``; keys stay."""
    params = []
    for param in query.split("&"):
        key, eq, value = param.partition("=")
        params.append(f"{key}={VALUE}" if eq and value and value != TOKEN else param)
    return "&".join(params)


def _scrub_route(raw: str) -> str:
    base, mark, query = raw.partition("?")
    return base + mark + _scrub_query(query) if mark else raw


def _app_root_rest(rest: str, ctx: ScrubContext) -> tuple[str, str] | None:
    """For the text after ``<home>``: an app root inside the home folder, as (prefix, remainder)."""
    if not ctx.home:
        return None
    windows = _is_windows_style(ctx.home)
    for root in ctx.app_roots:
        relative = _under(root, ctx.home)
        if relative:
            remainder = _under(rest, relative, windows)
            if remainder is not None:
                return "<app>", remainder
    return None


def _shape_path(raw: str, ctx: ScrubContext) -> str:
    """Rule 4 for one path. Anything that turns out not to be a path comes back unchanged."""
    suffix = _LINE_COL.search(raw)
    if suffix and suffix.start() > 0 and _is_path(raw[: suffix.start()]):
        return _shape_path(raw[: suffix.start()], ctx) + suffix.group(0)
    path = _percent_decode(raw) if "%" in raw else raw
    prefix = ""
    slash_unc = False
    if path[:7].lower() == "file://":
        prefix = "file://"
        path = path[7:]
        if re.match(r"^/[A-Za-z]:[\\/]", path) or path.startswith("/<home>"):
            prefix += "/"
            path = path[1:]
        elif not path.startswith(("/", "<home>")):
            path = "//" + path
            slash_unc = True
    if _ROUTE.match(path):
        return _scrub_route(raw)
    for root in ctx.app_roots:
        rest = _under(path, root)
        if rest is not None:
            return f"{prefix}<app>{rest}"
    if path.startswith("<home>") and (len(path) == 6 or path[6] in "\\/"):
        rest = path[6:]
        found = _app_root_rest(rest, ctx)
        if found is not None:
            return f"{prefix}{found[0]}{found[1]}"
        return f"{prefix}<home>{_shape_rest(rest)}"
    if path.startswith("~/") or path.startswith("~\\"):
        return f"{prefix}<home>{_shape_rest(path[1:])}"
    if ctx.home:
        rest = _under(path, ctx.home)
        if rest is not None:
            return f"{prefix}<home>{_shape_rest(rest)}"
    if _WINDOWS_DRIVE.match(path):
        return f"{prefix}{path[:2]}{_shape_rest(path[2:])}"
    unc = _UNC.match(path)
    if unc:
        lead = "" if slash_unc else unc.group(1)
        head = f"{lead}<host>{unc.group(3)}<share>"
        return f"{prefix}{head}{_shape_rest(path[unc.end() :])}"
    if path.startswith("/"):
        return f"{prefix}{_shape_rest(path)}"
    return raw


# ---------------------------------------------------------------------------
# Rule 6: URLs
# ---------------------------------------------------------------------------

_URL = re.compile(
    r"^([Hh][Tt][Tt][Pp][Ss]?)://([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?\Z", re.DOTALL
)
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})
_DIGITS = re.compile(r"^[0-9]+\Z")


def _scrub_url(url: str) -> str:
    match = _URL.match(url)
    if match is None:
        return url
    scheme, authority, path, query, fragment = match.groups()
    authority = authority.rsplit("@", 1)[-1]
    host = (
        authority[: authority.find("]") + 1]
        if authority.startswith("[")
        else authority.split(":")[0]
    )
    if host.lower() not in _LOOPBACK_HOSTS:
        segments = path.split("/")
        for i in range(2, len(segments)):
            if segments[i] and segments[i] != TOKEN and not _DIGITS.match(segments[i]):
                segments[i] = VALUE
        path = "/".join(segments)
    out = f"{scheme}://{authority}{path}"
    if query:
        out += "?" + _scrub_query(query[1:])
    if fragment and len(fragment) > 1:
        out += "#" + VALUE
    return out


# ---------------------------------------------------------------------------
# Plain text (rules 4, 5, 6) and quotes (rule 3)
# ---------------------------------------------------------------------------

_BEFORE = r"(?<![A-Za-z0-9_/\\.~%-])"
_PLAIN = re.compile(
    r"(?<![A-Za-z0-9])([Hh][Tt][Tt][Pp][Ss]?://[^" + _WS + r"\"]+)"
    r"|(?<![A-Za-z0-9])([Ff][Ii][Ll][Ee]://" + _NS + r"+)"
    r"|(?<![A-Za-z0-9\\])(\\\\[^" + _WS + r"\\/]+\\" + _NS + r"+)"
    r"|(?<![A-Za-z0-9])([A-Za-z]:[\\/]" + _NS + r"*)"
    r"|" + _BEFORE + r"(~[\\/]" + _NS + r"*)"
    r"|" + _BEFORE + r"(/[^" + _WS + r"/]+/[^" + _WS + r"/]+" + _NS + r"*)"
    r"|(<home>[\\/]" + _NS + r"*)"
    r"|(?<![A-Za-z0-9_:/\\.~%-])(//[^" + _WS + r"/]+/[^" + _WS + r"/]+" + _NS + r"*)"
    r"|(?<![A-Za-z0-9%])((?:[A-Za-z]%3[Aa])?%(?:2[Ff]|5[Cc])" + _NS + r"*)"
)
_PLACEHOLDER = re.compile(r"(<(?:home|dir|file|app|user|value|token|host|share)>)")
_PERCENT_PATH_GROUP = 9


def _scrub_match(match: re.Match[str], ctx: ScrubContext) -> str:
    whole = match.group(0)
    core = whole.rstrip(_TRAILING_PUNCTUATION)
    tail = whole[len(core) :]
    if match.lastindex == 1:
        return _scrub_url(core) + tail
    if match.lastindex == _PERCENT_PATH_GROUP:
        core = _percent_decode(core)
    if not core or not _is_path(core):
        return whole
    return _shape_path(core, ctx) + tail


def _fold(char: str) -> str:
    lowered = char.lower()
    return lowered if len(lowered) == 1 else char


def _is_word_char(char: str) -> bool:
    return (
        ("a" <= char <= "z")
        or ("A" <= char <= "Z")
        or ("0" <= char <= "9")
        or char == "_"
    )


def _replace_user_in(text: str, name: str) -> str:
    folded_text = "".join(_fold(c) for c in text)
    folded_name = "".join(_fold(c) for c in name)
    out: list[str] = []
    start = 0
    at = folded_text.find(folded_name)
    while at != -1:
        end = at + len(folded_name)
        before_ok = at == 0 or not _is_word_char(text[at - 1])
        after_ok = end >= len(text) or not _is_word_char(text[end])
        if before_ok and after_ok and at >= start:
            out.append(text[start:at])
            out.append("<user>")
            start = end
            at = folded_text.find(folded_name, end)
        else:
            at = folded_text.find(folded_name, at + 1)
    out.append(text[start:])
    return "".join(out)


def _replace_user(text: str, name: str) -> str:
    parts = _PLACEHOLDER.split(text)
    for i in range(0, len(parts), 2):
        parts[i] = _replace_user_in(parts[i], name)
    return "".join(parts)


def _scrub_plain(text: str, ctx: ScrubContext) -> str:
    text = _PLAIN.sub(lambda m: _scrub_match(m, ctx), text)
    if ctx.user_name and len(ctx.user_name) >= 2:
        text = _replace_user(text, ctx.user_name)
    return text


_CLOSING = {"'": "'", '"': '"', "“": "”", "‘": "’"}
_CLOSERS = ("'", '"', "”", "’")


def _scrub_inside(inner: str, ctx: ScrubContext) -> str:
    if inner == "" or inner == TOKEN:
        return inner
    if _is_path(inner):
        return _shape_path(inner, ctx)
    return VALUE


def _scrub_quotes(text: str, ctx: ScrubContext) -> str:
    if not any(c in text for c in _CLOSING):
        return _scrub_plain(text, ctx)
    n = len(text)
    # One right-to-left pass: the next valid closer of each kind, and the next newline, at every
    # position. A closer is valid when the character after it is not a letter or digit. This keeps
    # the whole scan linear, whatever the input.
    next_closer = {c: [-1] * (n + 2) for c in _CLOSERS}
    next_newline = [-1] * (n + 2)
    current = dict.fromkeys(_CLOSERS, -1)
    newline = -1
    for j in range(n - 1, -1, -1):
        char = text[j]
        if char == "\n":
            newline = j
        if char in current and (j + 1 >= n or not text[j + 1].isalnum()):
            current[char] = j
        for c in _CLOSERS:
            next_closer[c][j] = current[c]
        next_newline[j] = newline
    out: list[str] = []
    plain_from = 0
    i = 0
    while i < n:
        if text[i] in _CLOSING and (i == 0 or not text[i - 1].isalnum()):
            close = next_closer[_CLOSING[text[i]]][i + 1]
            if close != -1 and (
                next_newline[i + 1] == -1 or close < next_newline[i + 1]
            ):
                out.append(_scrub_plain(text[plain_from:i], ctx))
                out.append(
                    text[i] + _scrub_inside(text[i + 1 : close], ctx) + text[close]
                )
                i = plain_from = close + 1
                continue
        i += 1
    out.append(_scrub_plain(text[plain_from:], ctx))
    return "".join(out)


def scrub_text(text: str, ctx: ScrubContext) -> str:
    """Apply the text rules to free text such as a message or a log line."""
    return _scrub_quotes(_replace_home(_scrub_tokens(text, ctx), ctx), ctx)


def _scrub_path_value(text: str, ctx: ScrubContext) -> str:
    """A whole field that holds a path (it may contain spaces), else ordinary text."""
    text = _replace_home(text, ctx)
    return _shape_path(text, ctx) if _is_path(text) else scrub_text(text, ctx)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

_CONTEXT_TYPES = frozenset(
    {"runtime", "os", "browser", "app", "device", "gpu", "trace", "culture"}
)
_ID_KEYS = frozenset({"reportid", "eventid", "traceid", "spanid"})
_ID_VALUE = re.compile(r"[0-9A-Fa-f]{32}")


def _flat_key(key: object) -> str:
    return str(key).lower().replace("_", "").replace("-", "")


def _is_library_key(key: object) -> bool:
    return _flat_key(key).endswith(KEY_SUFFIXES)


def _blank(value: Any) -> Any:
    """A library value is replaced when it is text or a collection; a number or flag is not data."""
    if isinstance(value, (str, Mapping, list, tuple)):
        return VALUE
    return copy.deepcopy(value)


def _walk_item(key: object, value: Any, ctx: ScrubContext) -> Any:
    if _is_library_key(key):
        return _blank(value)
    if (
        _flat_key(key) in _ID_KEYS
        and isinstance(value, str)
        and _ID_VALUE.fullmatch(value)
    ):
        return value
    return _walk(value, ctx)


def _walk(value: Any, ctx: ScrubContext) -> Any:
    """Strings are scrubbed; a dict's library-named keys lose their values at every depth."""
    if isinstance(value, str):
        return scrub_text(value, ctx)
    if isinstance(value, Mapping):
        return {k: _walk_item(k, v, ctx) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_walk(v, ctx) for v in value]
    return copy.deepcopy(value)


def _scrub_frame(frame: Any, ctx: ScrubContext) -> Any:
    if not isinstance(frame, Mapping):
        return copy.deepcopy(frame)
    out = {k: copy.deepcopy(frame[k]) for k in _FRAME_KEYS if k in frame}
    for key in ("filename", "abs_path"):
        if isinstance(frame.get(key), str):
            out[key] = _scrub_path_value(frame[key], ctx)
    return out


def _scrub_stacktrace(stacktrace: Any, ctx: ScrubContext) -> Any:
    if not isinstance(stacktrace, Mapping):
        return copy.deepcopy(stacktrace)
    out = {k: copy.deepcopy(v) for k, v in stacktrace.items() if k != "frames"}
    if "frames" in stacktrace:
        frames = stacktrace["frames"]
        out["frames"] = (
            [_scrub_frame(f, ctx) for f in frames]
            if isinstance(frames, list)
            else copy.deepcopy(frames)
        )
    return out


def _scrub_mechanism(mechanism: Any, ctx: ScrubContext) -> Any:
    if not isinstance(mechanism, Mapping):
        return copy.deepcopy(mechanism)
    return {
        k: _walk(v, ctx) if k == "data" else copy.deepcopy(v)
        for k, v in mechanism.items()
    }


def _scrub_value_list(container: Any, ctx: ScrubContext) -> Any:
    """``exception`` and ``threads``: ``{"values": [...]}`` whose items carry a ``value`` and a stack."""
    if not isinstance(container, Mapping):
        return copy.deepcopy(container)
    out = {k: copy.deepcopy(v) for k, v in container.items() if k != "values"}
    if "values" in container:
        items = container["values"]
        if not isinstance(items, list):
            out["values"] = copy.deepcopy(items)
            return out
        scrubbed = []
        for item in items:
            if not isinstance(item, Mapping):
                scrubbed.append(copy.deepcopy(item))
                continue
            entry = {
                k: copy.deepcopy(v)
                for k, v in item.items()
                if k not in ("value", "stacktrace", "mechanism")
            }
            if "value" in item:
                entry["value"] = (
                    scrub_text(item["value"], ctx)
                    if isinstance(item["value"], str)
                    else item["value"]
                )
            if "stacktrace" in item:
                entry["stacktrace"] = _scrub_stacktrace(item["stacktrace"], ctx)
            if "mechanism" in item:
                entry["mechanism"] = _scrub_mechanism(item["mechanism"], ctx)
            scrubbed.append(entry)
        out["values"] = scrubbed
    return out


def _scrub_breadcrumb_list(crumbs: list[Any], ctx: ScrubContext) -> list[Any]:
    out = []
    for crumb in crumbs:
        if not isinstance(crumb, Mapping):
            out.append(copy.deepcopy(crumb))
            continue
        category = crumb.get("category")
        if isinstance(category, str) and category in _DROPPED_BREADCRUMB_CATEGORIES:
            continue
        entry = {
            k: copy.deepcopy(v)
            for k, v in crumb.items()
            if k not in ("message", "data")
        }
        if "message" in crumb:
            entry["message"] = (
                scrub_text(crumb["message"], ctx)
                if isinstance(crumb["message"], str)
                else crumb["message"]
            )
        if "data" in crumb:
            entry["data"] = _walk(crumb["data"], ctx)
        out.append(entry)
    return out


def _scrub_breadcrumbs(breadcrumbs: Any, ctx: ScrubContext) -> Any:
    if isinstance(breadcrumbs, list):
        return _scrub_breadcrumb_list(breadcrumbs, ctx)
    if isinstance(breadcrumbs, Mapping) and isinstance(breadcrumbs.get("values"), list):
        out = {k: copy.deepcopy(v) for k, v in breadcrumbs.items() if k != "values"}
        out["values"] = _scrub_breadcrumb_list(breadcrumbs["values"], ctx)
        return out
    return copy.deepcopy(breadcrumbs)


def _context_kind(name: str, value: Any) -> str | None:
    """Which standard context this is: by its name, or by the ``type`` it declares."""
    if name in STANDARD_CONTEXTS:
        return name
    if isinstance(value, Mapping):
        declared = value.get("type")
        if isinstance(declared, str) and declared in _CONTEXT_TYPES:
            return declared
    return None


def _scrub_contexts(contexts: Any, ctx: ScrubContext) -> Any:
    if not isinstance(contexts, Mapping):
        return copy.deepcopy(contexts)
    out: dict[str, Any] = {}
    for name, value in contexts.items():
        kind = _context_kind(name, value)
        if kind is not None:
            if isinstance(value, Mapping):
                drop = _DEVICE_NAME_KEYS | ({"name"} if kind == "device" else set())
                out[name] = {
                    k: copy.deepcopy(v) for k, v in value.items() if k not in drop
                }
            else:
                out[name] = copy.deepcopy(value)
        elif _is_library_key(name):
            out[name] = _blank(value)
        elif isinstance(value, Mapping):
            out[name] = {
                k: _walk_item(k, v, ctx)
                for k, v in value.items()
                if k not in _DEVICE_NAME_KEYS
            }
        else:
            out[name] = _walk(value, ctx)
    return out


# A logging call's arguments are values, whatever the template says: a path keeps its shape and
# anything else is replaced.
_FORMAT = re.compile(r"%(?:\(([^)]*)\))?([^A-Za-z%]*)([A-Za-z%])")


def _scrub_param(value: Any, ctx: ScrubContext) -> Any:
    if isinstance(value, str):
        value = _replace_home(value, ctx)
        return _shape_path(value, ctx) if _is_path(value) else VALUE
    if isinstance(value, Mapping):
        return {k: _scrub_param(v, ctx) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_scrub_param(v, ctx) for v in value]
    return copy.deepcopy(value)


def _render_param(value: Any, conversion: str) -> str | None:
    if isinstance(value, str):
        return f"'{value}'" if conversion in "ra" else value
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        if conversion in "diu":
            return str(int(value))
        if conversion == "f":
            return f"{value:.6f}"
        return str(value)
    return None


def _format_message(template: str, params: Any) -> str | None:
    """Fill ``%s``-style conversions (``s r a d i u f``, no flags or width), else None."""
    positional = isinstance(params, (list, tuple))
    mapping = isinstance(params, Mapping)
    if not (positional or mapping):
        return None
    used = 0
    failed = False

    def fill(match: re.Match[str]) -> str:
        nonlocal used, failed
        key, flags, conversion = match.group(1), match.group(2), match.group(3)
        if conversion == "%" and key is None and not flags:
            return "%"
        if flags or conversion not in "sradiuf":
            failed = True
            return ""
        if key is not None:
            if not mapping or key not in params:
                failed = True
                return ""
            value = params[key]
        else:
            if not positional or used >= len(params):
                failed = True
                return ""
            value = params[used]
            used += 1
        rendered = _render_param(value, conversion)
        if rendered is None:
            failed = True
            return ""
        return rendered

    out = _FORMAT.sub(fill, template)
    if failed or (positional and used != len(params)):
        return None
    return out


def _scrub_logentry(logentry: Any, ctx: ScrubContext) -> Any:
    """``params`` become values; ``formatted`` is rebuilt from the template and them, else dropped."""
    if not isinstance(logentry, Mapping):
        return copy.deepcopy(logentry)
    params = logentry.get("params")
    scrubbed_params = _scrub_param(params, ctx) if params is not None else None
    out = {}
    for key, value in logentry.items():
        if key == "message" and isinstance(value, str):
            out[key] = scrub_text(value, ctx)
        elif key == "params":
            out[key] = scrubbed_params if params is not None else copy.deepcopy(value)
        elif key == "formatted" and isinstance(value, str):
            if params is None:
                out[key] = scrub_text(value, ctx)
                continue
            template = logentry.get("message")
            rebuilt = (
                _format_message(template, scrubbed_params)
                if isinstance(template, str)
                else None
            )
            if rebuilt is not None:
                out[key] = scrub_text(rebuilt, ctx)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _scrub_tags(tags: Any, ctx: ScrubContext) -> Any:
    """Tags are keyed like ``extra``: a dict, or a list of ``[key, value]`` pairs."""
    if isinstance(tags, Mapping):
        return _walk(tags, ctx)
    if isinstance(tags, list):
        out = []
        for item in tags:
            if (
                isinstance(item, (list, tuple))
                and len(item) == 2
                and isinstance(item[0], str)
            ):
                out.append([item[0], _walk_item(item[0], item[1], ctx)])
            else:
                out.append(_walk(item, ctx))
        return out
    return _walk(tags, ctx)


def _scrub_event_attachments(attachments: Any, ctx: ScrubContext) -> list[Any]:
    """Keep only the output tails, scrubbed. An item is a dict naming itself ``filename`` or ``name``."""
    kept: list[Any] = []
    if not isinstance(attachments, list):
        return kept
    for item in attachments:
        if not isinstance(item, Mapping):
            continue
        name = item.get("filename", item.get("name"))
        if not isinstance(name, str) or name not in OUTPUT_TAIL_ATTACHMENTS:
            continue
        entry = {
            k: copy.deepcopy(v)
            for k, v in item.items()
            if k not in ("data", "text", "bytes")
        }
        for field in ("data", "text"):
            if isinstance(item.get(field), str):
                entry[field] = scrub_attachment(name, item[field], ctx) or ""
        kept.append(entry)
    return kept


def _path_field(value: Any, ctx: ScrubContext) -> Any:
    return (
        _scrub_path_value(value, ctx)
        if isinstance(value, str)
        else copy.deepcopy(value)
    )


def _text_field(value: Any, ctx: ScrubContext) -> Any:
    return scrub_text(value, ctx) if isinstance(value, str) else copy.deepcopy(value)


_IMAGE_PATH_KEYS = ("code_file", "debug_file")


def _scrub_debug_meta(debug_meta: Any, ctx: ScrubContext) -> Any:
    """Keep ``debug_meta`` (debug ids tie a frame to its source map), but its images' file paths
    go through the path rule, as a frame's ``filename`` does: a loaded module's path names the user."""
    if not isinstance(debug_meta, Mapping):
        return copy.deepcopy(debug_meta)
    out = copy.deepcopy(dict(debug_meta))
    images = debug_meta.get("images")
    if isinstance(images, list):
        out["images"] = [
            {
                k: (
                    _scrub_path_value(v, ctx)
                    if k in _IMAGE_PATH_KEYS and isinstance(v, str)
                    else copy.deepcopy(v)
                )
                for k, v in image.items()
            }
            if isinstance(image, Mapping)
            else copy.deepcopy(image)
            for image in images
        ]
    return out


_EVENT_HANDLERS: dict[str, Callable[[Any, ScrubContext], Any]] = {
    "debug_meta": _scrub_debug_meta,
    "message": _text_field,
    "logentry": _scrub_logentry,
    "exception": _scrub_value_list,
    "threads": _scrub_value_list,
    "breadcrumbs": _scrub_breadcrumbs,
    "tags": _scrub_tags,
    "transaction": _path_field,
    "culprit": _path_field,
    "contexts": _scrub_contexts,
    "extra": _walk,
    "attachments": _scrub_event_attachments,
}


def scrub_event(event: dict[str, Any], ctx: ScrubContext) -> dict[str, Any]:
    """Return a scrubbed copy of a Sentry-shaped event. The input is not changed.

    Removed whatever their content: ``server_name``, ``user``, ``request``, the device's name, every
    frame's local variables, breadcrumbs of category ``ui.click``, ``ui.input`` and ``console``,
    and every attachment but the output tails. Text-scrubbed: ``message``, exception values,
    breadcrumb messages. ``logentry.params`` become paths or ``<value>`` and ``formatted`` is
    rebuilt from them. ``transaction``, ``culprit`` and a frame's ``abs_path`` and ``filename`` and a
    debug image's ``code_file`` go through the path rule. Library-named keys lose their string and collection values in
    ``extra``, ``tags``, non-standard ``contexts``, breadcrumb ``data`` and ``mechanism.data``
    (numbers and flags stay; a 32-hex value under ``event_id``, ``trace_id``, ``span_id`` or
    ``report_id`` stays). Event, SDK and build fields (``_KEPT_EVENT_KEYS``) and the standard
    contexts, including any context declaring a standard ``type``, are kept; any other top-level
    key is walked like ``extra``.
    """
    out: dict[str, Any] = {}
    for key, value in event.items():
        if key in _DROPPED_EVENT_KEYS:
            continue
        handler = _EVENT_HANDLERS.get(key)
        if handler is not None:
            out[key] = handler(value, ctx)
        elif key in _KEPT_EVENT_KEYS:
            out[key] = copy.deepcopy(value)
        else:
            out[key] = _walk(value, ctx)
    return out


def scrub_attachment(name: str, text: str, ctx: ScrubContext) -> str | None:
    """Scrub a process-output tail line by line. Any other attachment is dropped (None)."""
    if name not in OUTPUT_TAIL_ATTACHMENTS:
        return None
    return "\n".join(scrub_text(line, ctx) for line in text.split("\n"))


def scrub_breadcrumb(
    crumb: Mapping[str, Any], ctx: ScrubContext
) -> dict[str, Any] | None:
    """Scrub one breadcrumb as ``scrub_event`` would, or None when its category is dropped.

    For an SDK's ``before_breadcrumb`` hook, which sees breadcrumbs one at a time.
    """
    scrubbed = _scrub_breadcrumb_list([crumb], ctx)
    return scrubbed[0] if scrubbed else None
