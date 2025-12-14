#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Security utilities (Step 8.2 / Step 8.1).

CuePoint v1.0 intentionally does **not** store secrets (no auth required).
This module provides forward-looking scaffolding so that if secrets are ever
introduced, they have a single, auditable place to live and can be stored
securely (e.g., OS keychain via `keyring`).
"""

from __future__ import annotations

from typing import Optional


class SecretManager:
    """Secure secret storage manager (future use).

    In v1.0, these operations are not used. If a future version introduces
    secrets, we should implement this using the platform keychain via `keyring`.
    """

    @staticmethod
    def store_secret(service: str, username: str, secret: str) -> None:
        """Store a secret securely."""
        try:
            import keyring  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Secret storage requires the optional 'keyring' dependency."
            ) from e

        keyring.set_password(service, username, secret)

    @staticmethod
    def get_secret(service: str, username: str) -> Optional[str]:
        """Retrieve a secret from secure storage."""
        try:
            import keyring  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Secret storage requires the optional 'keyring' dependency."
            ) from e

        return keyring.get_password(service, username)

    @staticmethod
    def delete_secret(service: str, username: str) -> None:
        """Delete a secret from secure storage."""
        try:
            import keyring  # type: ignore
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Secret storage requires the optional 'keyring' dependency."
            ) from e

        keyring.delete_password(service, username)


