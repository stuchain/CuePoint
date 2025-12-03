#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UI Migration Package

This package contains components for migrating from the old UI
(MainWindow) to the new UI (SimpleMainWindow).
"""

from cuepoint.ui.migration.feature_flags import FeatureFlags, UI_MODE
from cuepoint.ui.migration.migration_manager import MigrationManager, MigrationStatus
from cuepoint.ui.migration.migration_wizard import MigrationWizard
from cuepoint.ui.migration.migration_utils import (
    map_setting_key,
    validate_migrated_data,
    create_backup,
    restore_from_backup,
    get_migration_summary,
)

__all__ = [
    "FeatureFlags", "UI_MODE",
    "MigrationManager", "MigrationStatus",
    "MigrationWizard",
    "map_setting_key", "validate_migrated_data",
    "create_backup", "restore_from_backup",
    "get_migration_summary",
]

