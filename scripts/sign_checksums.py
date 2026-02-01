#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sign SHA256SUMS (or another checksum file) with GPG.

Design 2.17. Creates a detached ASCII-armored signature (e.g. SHA256SUMS.sig).
Requires GPG and a configured key. For CI, use the secret GPG_PRIVATE_KEY.

Usage:
    python scripts/sign_checksums.py [SHA256SUMS]
    python scripts/sign_checksums.py --file SHA256SUMS --key-id ABC123
    GPG_PASSPHRASE=... python scripts/sign_checksums.py SHA256SUMS
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def sign_file(file_path: Path, key_id: str | None, passphrase: str | None) -> Path:
    """Run gpg --detach-sign --armor. Returns path to .asc file."""
    cmd = ["gpg", "--detach-sign", "--armor", "--batch", "--yes"]
    if key_id:
        cmd.extend(["--local-user", key_id])
    cmd.append(str(file_path))

    env = os.environ.copy()
    if passphrase:
        env["GPG_TTY"] = "1"
        # Passphrase via pinentry or GPG_PASSPHRASE; gpg often reads PINENTRY or we use --passphrase-fd
        # For non-interactive: --passphrase-fd 0 with passphrase on stdin
        cmd = ["gpg", "--detach-sign", "--armor", "--batch", "--yes"]
        if key_id:
            cmd.extend(["--local-user", key_id])
        cmd.extend(["--passphrase-fd", "0", str(file_path)])
        r = subprocess.run(
            cmd,
            input=passphrase.encode(),
            capture_output=True,
            timeout=60,
            cwd=get_project_root(),
            env=env,
        )
    else:
        r = subprocess.run(
            cmd,
            capture_output=True,
            timeout=60,
            cwd=get_project_root(),
        )

    if r.returncode != 0:
        raise RuntimeError(
            f"gpg failed: {(r.stderr or r.stdout or b'').decode(errors='replace')}"
        )

    # gpg --detach-sign --armor produces file_path.asc by default
    asc_path = file_path.with_suffix(file_path.suffix + ".asc")
    if asc_path.exists():
        return asc_path
    raise RuntimeError("gpg did not produce a signature file")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sign checksum file with GPG (2.17)."
    )
    parser.add_argument(
        "file",
        nargs="?",
        type=Path,
        default=None,
        help="Checksum file (default: SHA256SUMS in project root)",
    )
    parser.add_argument(
        "-f",
        "--file-path",
        type=Path,
        dest="file_path",
        help="Checksum file path (alternative to positional)",
    )
    parser.add_argument(
        "--key-id",
        "-k",
        type=str,
        default=os.environ.get("GPG_KEY_ID"),
        help="GPG key ID (default: GPG_KEY_ID env)",
    )
    parser.add_argument(
        "--passphrase",
        action="store_true",
        help="Read passphrase from GPG_PASSPHRASE env (for CI)",
    )
    args = parser.parse_args()

    path = args.file or args.file_path
    if path is None:
        path = get_project_root() / "SHA256SUMS"
    path = path.resolve()

    if not path.exists():
        print(f"Error: File not found: {path}", file=sys.stderr)
        sys.exit(1)

    passphrase = os.environ.get("GPG_PASSPHRASE") if args.passphrase else None
    try:
        sig_path = sign_file(path, args.key_id, passphrase)
        print(f"Created: {sig_path}")
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
