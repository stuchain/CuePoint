"""Saving an audio file's tags through a copy (HARDEN-04, DEC-183).

A tag write used to rewrite the audio file in place, so a crash half way could
truncate the user's music. Now every write path works on a copy made beside the
file (named like the other temporary files, ``.<name>.cuepoint-tmp-<pid>``):

1. check there is room for the copy; if not, fail before touching anything;
2. copy the file, write the tags into the copy;
3. check the copy: the tags read back as written (the caller's ``verify``) and
   the audio payload is byte-identical to the original's (:func:`audio_fingerprint`);
4. give the copy the original's times and, on POSIX, its mode, then
   ``os.replace`` it over the original.

If anything fails the copy is removed and the original has not been touched. If
the replace is refused (Windows, with the file held open by another program) the
copy is removed and the file reported as in use.

Not kept: hard links to the file (the replaced file is a new one) and extended
attributes. A symbolic link is followed, so the file it points to is replaced
and the link stays.

The audio payload, per format, compared by position rather than by decoding
(so no decoder is needed and it works the same everywhere):

========  ====================================================================
MP3       after the ID3v2 tag, before any trailing ID3v1 and APEv2 tags
FLAC      after the last metadata block
MP4/M4A   the body of every ``mdat`` atom
WAV/AIFF  the ``fmt ``/``data`` (WAV) or ``COMM``/``SSND`` (AIFF) chunks
Ogg       every packet but the second (the comment header); packets, not pages,
          because rewriting the comment header re-pages the stream
other     not comparable: only the caller's tag check applies
========  ====================================================================
"""

from __future__ import annotations

import errno
import hashlib
import os
import shutil
import struct
import sys
from pathlib import Path
from typing import Any, BinaryIO, Callable, Dict, Optional, TypeVar, Union

from cuepoint.utils.atomic_write import (
    commit_temp,
    discard_temp,
    fsync_file,
    temp_name_for,
)

PathLike = Union[str, "os.PathLike[str]"]
T = TypeVar("T")

MESSAGE_NO_SPACE = "Not enough space to save tags safely"
MESSAGE_IN_USE = "The file is in use. Try again."
MESSAGE_TAGS_DIFFER = (
    "The saved tags did not read back as written, so the file was kept as it was"
)
MESSAGE_CHANGED = "The file changed while its tags were being saved. Try again."
MESSAGE_AUDIO_DIFFERS = (
    "The saved copy's audio did not match, so the file was kept as it was"
)

#: Room kept beyond the file's own size for the copy: tags can grow, and the
#: folder needs a little for the rename.
SPARE_BYTES = 1024 * 1024

_CHUNK = 1024 * 1024


class TagSaveError(Exception):
    """A tag save was refused or failed; the original file was not changed."""


# ------------------------------------------------------------------ fingerprint


def _hash_range(handle: BinaryIO, digest: Any, start: int, end: int) -> None:
    handle.seek(start)
    remaining = max(0, end - start)
    while remaining:
        chunk = handle.read(min(_CHUNK, remaining))
        if not chunk:
            break
        digest.update(chunk)
        remaining -= len(chunk)


def _id3v2_end(handle: BinaryIO) -> int:
    """Where the ID3v2 tag at the start ends; 0 when there is none."""
    handle.seek(0)
    header = handle.read(10)
    if len(header) < 10 or header[:3] != b"ID3":
        return 0
    size = 0
    for byte in header[6:10]:
        size = (size << 7) | (byte & 0x7F)
    footer = 10 if header[5] & 0x10 else 0
    return 10 + size + footer


def _mp3_end(handle: BinaryIO, length: int) -> int:
    """Where the MP3 frames end: before a trailing ID3v1 tag and APEv2 tag."""
    end = length
    if end >= 128:
        handle.seek(end - 128)
        if handle.read(3) == b"TAG":
            end -= 128
    if end >= 32:
        handle.seek(end - 32)
        footer = handle.read(32)
        if footer[:8] == b"APETAGEX":
            size = struct.unpack("<I", footer[12:16])[0]
            flags = struct.unpack("<I", footer[20:24])[0]
            has_header = bool(flags & (1 << 31))
            total = size + (32 if has_header else 0)
            if 32 <= total <= end:
                end -= total
    return end


def _fingerprint_mp3(handle: BinaryIO, length: int, digest: Any) -> None:
    _hash_range(handle, digest, _id3v2_end(handle), _mp3_end(handle, length))


def _fingerprint_flac(handle: BinaryIO, length: int, digest: Any) -> None:
    position = _id3v2_end(handle)
    handle.seek(position)
    if handle.read(4) != b"fLaC":
        raise TagSaveError("Not a FLAC stream")
    position += 4
    while True:
        handle.seek(position)
        header = handle.read(4)
        if len(header) < 4:
            raise TagSaveError("A FLAC file ends inside its metadata")
        last = bool(header[0] & 0x80)
        position += 4 + int.from_bytes(header[1:4], "big")
        if last:
            break
    _hash_range(handle, digest, position, length)


def _fingerprint_mp4(handle: BinaryIO, length: int, digest: Any) -> None:
    position = 0
    while position + 8 <= length:
        handle.seek(position)
        size, name = struct.unpack(">I4s", handle.read(8))
        body = position + 8
        if size == 1:
            size = struct.unpack(">Q", handle.read(8))[0]
            body += 8
        elif size == 0:
            size = length - position
        if size < body - position:
            raise TagSaveError("An MP4 atom has an impossible size")
        end = min(position + size, length)
        if name == b"mdat":
            digest.update(struct.pack(">Q", end - body))
            _hash_range(handle, digest, body, end)
        position = end


def _fingerprint_chunks(
    handle: BinaryIO,
    length: int,
    digest: Any,
    wanted: "tuple[bytes, ...]",
    order: str,
) -> None:
    """RIFF (``<``) or IFF (``>``) chunks: hash the wanted ones' bodies."""
    position = 12
    while position + 8 <= length:
        handle.seek(position)
        header = handle.read(8)
        name = header[:4]
        size = struct.unpack(order + "I", header[4:8])[0]
        body = position + 8
        end = min(body + size, length)
        if name in wanted:
            digest.update(name + struct.pack(">Q", end - body))
            _hash_range(handle, digest, body, end)
        position = body + size + (size & 1)


def _fingerprint_ogg(handle: BinaryIO, length: int, digest: Any) -> None:
    from mutagen.ogg import OggPage

    handle.seek(0)
    pending: Dict[int, bytes] = {}
    counts: Dict[int, int] = {}
    while handle.tell() < length:
        try:
            page = OggPage(handle)
        except Exception as exc:  # noqa: BLE001 - a damaged page
            raise TagSaveError("An Ogg page could not be read") from exc
        serial = page.serial
        packets = page.packets
        for index, packet in enumerate(packets):
            if index == 0 and page.continued:
                packet = pending.pop(serial, b"") + packet
            if index == len(packets) - 1 and not page.complete:
                pending[serial] = packet
                continue
            number = counts.get(serial, 0)
            counts[serial] = number + 1
            if number == 1:
                continue  # the comment header: the thing a tag write changes
            digest.update(struct.pack(">QQ", serial, len(packet)))
            digest.update(packet)


def _kind_of(handle: BinaryIO, head: bytes) -> Optional[str]:
    if head[:4] in (b"RIFF", b"RF64") and head[8:12] == b"WAVE":
        return "wav"
    if head[:4] == b"FORM" and head[8:12] in (b"AIFF", b"AIFC"):
        return "aiff"
    if head[:4] == b"OggS":
        return "ogg"
    if head[:4] == b"fLaC":
        return "flac"
    if head[4:8] == b"ftyp":
        return "mp4"
    if head[:3] == b"ID3":
        handle.seek(_id3v2_end(handle))
        return "flac" if handle.read(4) == b"fLaC" else "mp3"
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return "mp3"
    return None


def audio_fingerprint(path: PathLike) -> Optional[str]:
    """A digest of a file's audio payload, ignoring its tags; None if unknown.

    See the module docstring for what is compared per format.
    """
    digest = hashlib.blake2b(digest_size=20)
    with open(path, "rb") as handle:
        length = os.fstat(handle.fileno()).st_size
        kind = _kind_of(handle, handle.read(12))
        if kind is None:
            return None
        digest.update(kind.encode("ascii"))
        if kind == "mp3":
            _fingerprint_mp3(handle, length, digest)
        elif kind == "flac":
            _fingerprint_flac(handle, length, digest)
        elif kind == "mp4":
            _fingerprint_mp4(handle, length, digest)
        elif kind == "wav":
            _fingerprint_chunks(handle, length, digest, (b"fmt ", b"data"), "<")
        elif kind == "aiff":
            _fingerprint_chunks(handle, length, digest, (b"COMM", b"SSND"), ">")
        else:
            _fingerprint_ogg(handle, length, digest)
    return digest.hexdigest()


# ------------------------------------------------------------------------- save


def _require_room(folder: Path, size: int) -> None:
    try:
        free = shutil.disk_usage(folder).free
    except OSError:
        return  # cannot tell (some network shares): let the copy decide
    if free < size + SPARE_BYTES:
        raise TagSaveError(MESSAGE_NO_SPACE)


def _require_unchanged(original: Path, before: os.stat_result) -> None:
    """Refuse to swap in a copy of a file that has since been written to."""
    now = original.stat()
    if (now.st_size, now.st_mtime_ns) != (before.st_size, before.st_mtime_ns):
        raise TagSaveError(MESSAGE_CHANGED)


def save_via_copy(
    path: PathLike,
    operation: Callable[[Path], T],
    *,
    verify: Optional[Callable[[Path], None]] = None,
    accept: Optional[Callable[[T], bool]] = None,
) -> T:
    """Run ``operation`` on a copy of the file, check it, and swap it in.

    ``operation(copy)`` writes the tags to ``copy`` (any of mutagen's ``save()``
    calls, the WAV LIST-INFO append) and returns something. If ``accept`` is
    given and says no to it, nothing is swapped in (the writer decided not to
    write). ``verify(copy)`` raises :class:`TagSaveError` when the copy's tags do
    not read back as written.

    Raises:
        TagSaveError: Not enough room, the audio differs, the file changed or is
            in use. The original is untouched in every case.
        OSError: The file cannot be read or written (read-only, vanished).
        Exception: Whatever ``operation`` or ``verify`` raised; the original is
            untouched.
    """
    original = Path(os.path.realpath(os.fspath(path)))
    before = original.stat()
    if not os.access(original, os.W_OK):
        raise PermissionError(errno.EACCES, os.strerror(errno.EACCES), str(original))
    _require_room(original.parent, before.st_size)

    work = original.with_name(temp_name_for(original.name))
    work_taken = False
    swapped = False
    try:
        try:
            with open(original, "rb") as source, open(work, "xb") as target:
                work_taken = True
                shutil.copyfileobj(source, target, _CHUNK)
        except FileExistsError:
            raise TagSaveError(MESSAGE_IN_USE) from None
        except OSError as exc:
            if exc.errno == errno.ENOSPC:
                raise TagSaveError(MESSAGE_NO_SPACE) from exc
            raise
        if sys.platform != "win32":
            shutil.copymode(original, work)

        result = operation(work)
        if accept is not None and not accept(result):
            return result
        if verify is not None:
            verify(work)

        _require_unchanged(original, before)
        try:
            expected = audio_fingerprint(original)
        except Exception:  # noqa: BLE001 - an odd original: nothing to compare
            expected = None
        if expected is not None and audio_fingerprint(work) != expected:
            raise TagSaveError(MESSAGE_AUDIO_DIFFERS)

        try:
            fsync_file(work)
        except OSError as exc:
            if exc.errno == errno.ENOSPC:
                raise TagSaveError(MESSAGE_NO_SPACE) from exc
            raise
        os.utime(work, ns=(before.st_atime_ns, before.st_mtime_ns))

        _require_unchanged(original, before)
        try:
            commit_temp(work, original)
        except PermissionError as exc:
            raise TagSaveError(MESSAGE_IN_USE) from exc
        swapped = True
        return result
    finally:
        if work_taken and not swapped:
            discard_temp(work)


__all__ = (
    "MESSAGE_AUDIO_DIFFERS",
    "MESSAGE_CHANGED",
    "MESSAGE_IN_USE",
    "MESSAGE_NO_SPACE",
    "MESSAGE_TAGS_DIFFER",
    "TagSaveError",
    "audio_fingerprint",
    "save_via_copy",
)
