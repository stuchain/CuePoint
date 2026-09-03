#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The suite must never read or write the user's real CuePoint state.

``conftest.py`` installs two autouse guards for this. They are asserted here
rather than trusted, because the failure mode is silent and expensive: a test
run that writes into ``~/.cuepoint/cuepoint.db`` damages a real library, and one
that *reads* ``~/.cuepoint/config.yaml`` behaves differently on a developer's
machine than in CI for reasons nothing in the test output explains.

Both of those have happened. The second one hid the first: the database guard
redirects ``default_database_path()``, which ``DatabaseService`` consults
**last**, so a ``database.path`` in the developer's real configuration took
precedence and the guard did nothing at all. It was found when an unrelated test
run silently resolved to a 3,880-track library sitting outside the sandbox.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock

import pytest

from cuepoint.services import config_service as config_service_module
from cuepoint.services import database_service as database_service_module
from cuepoint.services.config_service import ConfigService
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.interfaces import IConfigService


def _real_cuepoint_home() -> Path:
    return Path.home() / ".cuepoint"


@pytest.mark.unit
class TestTheRealUserDirectoryIsOutOfReach:
    def test_the_default_database_path_is_redirected(self):
        resolved = database_service_module.default_database_path()
        assert _real_cuepoint_home() not in resolved.parents

    def test_the_default_config_file_is_redirected(self):
        resolved = config_service_module.default_config_file()
        assert _real_cuepoint_home() not in resolved.parents

    def test_a_config_service_built_with_no_arguments_is_sandboxed(
        self, _user_config_sandbox
    ):
        """This is the object bootstrap_services() builds."""
        assert ConfigService().config_file == _user_config_sandbox

    def test_the_bootstrapped_container_resolves_to_the_sandbox(
        self, _library_database_sandbox
    ):
        """The path that actually broke, and the only one that could break.

        A bare ``DatabaseService()`` has no config service, so it never consults
        ``database.path`` and was never at risk. The service the *container*
        builds is injected with the real ``ConfigService``, and that is what
        every engine endpoint, repository and job resolves — so this is where a
        configured path silently replaces the sandbox.

        Asserted as equality rather than "not under ~/.cuepoint": a configured
        path can point anywhere, and the one that exposed this pointed at a
        scratch directory nowhere near the real home.
        """
        from cuepoint.services.bootstrap import bootstrap_services
        from cuepoint.services.interfaces import IDatabaseService
        from cuepoint.utils.di_container import get_container, reset_container

        reset_container()
        try:
            bootstrap_services()
            service = get_container().resolve(IDatabaseService)
            assert service.db_path == _library_database_sandbox
        finally:
            reset_container()


@pytest.mark.unit
class TestConfiguredPathsStillWin:
    """The guards must not break the behaviour they are protecting.

    Redirecting the defaults is not allowed to turn into ignoring an explicit
    path, or the CLI's ``--config`` and the tests that supply their own database
    would stop working.
    """

    def test_an_explicit_database_path_is_honoured(self, tmp_path):
        assert DatabaseService(db_path=tmp_path / "x.db").db_path == tmp_path / "x.db"

    def test_an_explicit_config_file_is_honoured(self, tmp_path):
        config_file = tmp_path / "custom.yaml"
        assert ConfigService(config_file=config_file).config_file == config_file

    def test_a_configured_database_path_still_takes_precedence(self, tmp_path):
        """The precedence that made the database guard insufficient on its own.

        It is correct behaviour — this is how the CLI redirects the database —
        which is exactly why the *config* has to be sandboxed too rather than
        this rule being weakened.
        """
        configured = tmp_path / "from-config.db"
        config = Mock(spec=IConfigService)
        config.get.side_effect = lambda key, default=None: {
            "database.path": str(configured),
            "database.busy_timeout_seconds": 5.0,
        }.get(key, default)

        assert DatabaseService(config_service=config).db_path == configured
