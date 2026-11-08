#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Where an import keeps every track's marks until the tracks are written (PYTHON-1H).

An import reads each track's cue points and beat grid in the same pass as the
track, but can only write them after the tracks, because they are stored against
the row the track's TrackID names. Holding them in a dict made the import's
memory grow with the file: 7.5 GB for a 2.6 GB export with a beat-by-beat grid,
where reading the same file and keeping nothing took 21 MB.

This is the dict's replacement: an anonymous temporary file with one
length-prefixed pickle record per track. It is read back once, a chunk at a
time, so memory is the size of a chunk however large the file was. The file has
no name that outlives the process and is deleted when it is closed, on success,
error or cancel alike.

Pickle is safe here for the reason it is not elsewhere: the file is created by
this process, is never given a name, and is read only by the same import.
"""

from __future__ import annotations

import pickle
import struct
import tempfile
from types import TracebackType
from typing import IO, Iterator, List, Optional, Tuple, Type

from cuepoint.models.track_marks import ReadMarks

#: A record's length, before the record.
_LENGTH = struct.Struct("<I")


class MarksSpill:
    """A track's marks, in the order read, on disk.

    Use it as a context manager; :meth:`close` is also safe to call twice.
    """

    def __init__(self) -> None:
        self._file: Optional[IO[bytes]] = tempfile.TemporaryFile()
        self.count = 0

    @property
    def closed(self) -> bool:
        """True once the file is closed, and gone with it."""
        return self._file is None

    def add(self, rekordbox_id: str, read: ReadMarks) -> None:
        """Append one track's marks, a track with none included."""
        handle = self._open()
        record = pickle.dumps(
            (rekordbox_id, read.cues, read.grid, read.skipped),
            protocol=pickle.HIGHEST_PROTOCOL,
        )
        handle.write(_LENGTH.pack(len(record)))
        handle.write(record)
        self.count += 1

    def chunks(self, size: int) -> Iterator[List[Tuple[str, ReadMarks]]]:
        """Yield the records in the order added, ``size`` at a time.

        May be called again for a second pass; adding after a pass appends.
        """
        if size < 1:
            raise ValueError(f"size must be at least 1, got {size!r}")
        handle = self._open()
        handle.flush()
        handle.seek(0)
        try:
            chunk: List[Tuple[str, ReadMarks]] = []
            while True:
                header = handle.read(_LENGTH.size)
                if not header:
                    break
                if len(header) < _LENGTH.size:
                    raise EOFError("the marks spill file is truncated")
                (length,) = _LENGTH.unpack(header)
                record = handle.read(length)
                if len(record) < length:
                    raise EOFError("the marks spill file is truncated")
                rekordbox_id, cues, grid, skipped = pickle.loads(record)
                chunk.append((rekordbox_id, ReadMarks(cues, grid, skipped)))
                if len(chunk) >= size:
                    yield chunk
                    chunk = []
            if chunk:
                yield chunk
        finally:
            if self._file is not None:
                self._file.seek(0, 2)

    def close(self) -> None:
        """Close the file, which deletes it."""
        handle, self._file = self._file, None
        if handle is not None:
            handle.close()

    def _open(self) -> IO[bytes]:
        if self._file is None:
            raise ValueError("the marks spill file is closed")
        return self._file

    def __enter__(self) -> "MarksSpill":
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc: Optional[BaseException],
        traceback: Optional[TracebackType],
    ) -> None:
        self.close()
