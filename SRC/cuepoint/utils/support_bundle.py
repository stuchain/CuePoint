#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Support Bundle Generator Utility

Generates comprehensive support bundle ZIP files for diagnostics.
Implements diagnostics from Step 1.9.
"""

import json
import logging
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from cuepoint.utils.diagnostics import DiagnosticCollector
from cuepoint.utils.paths import AppPaths

logger = logging.getLogger(__name__)


class SupportBundleGenerator:
    """Generate support bundle ZIP file.

    Creates a ZIP file containing:
    - Diagnostics JSON
    - Log files
    - Crash logs
    - Configuration (sanitized)
    - README
    """

    @staticmethod
    def generate_bundle(output_path: Path) -> Path:
        """Generate support bundle.

        Args:
            output_path: Directory where bundle will be created.

        Returns:
            Path to created bundle file.

        Raises:
            OSError: If bundle creation fails.
        """
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        bundle_path = output_path / f"cuepoint-support-{timestamp}.zip"

        logger.info(f"Generating support bundle: {bundle_path}")

        try:
            with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                # Diagnostics JSON
                diagnostics = DiagnosticCollector.collect_all()
                zipf.writestr(
                    "diagnostics.json",
                    json.dumps(diagnostics, indent=2, default=str, ensure_ascii=False),
                )

                # Log files
                log_dir = AppPaths.logs_dir()
                for log_file in log_dir.glob("*.log*"):
                    try:
                        zipf.write(log_file, f"logs/{log_file.name}")
                    except Exception as e:
                        logger.warning(f"Could not include log file {log_file}: {e}")

                # Crash logs
                for crash_file in log_dir.glob("crash-*.log"):
                    try:
                        zipf.write(crash_file, f"crashes/{crash_file.name}")
                    except Exception as e:
                        logger.warning(f"Could not include crash log {crash_file}: {e}")

                # Config file (if exists, sanitized)
                config_file = AppPaths.config_file()
                if config_file.exists():
                    try:
                        import yaml

                        with open(config_file, "r", encoding="utf-8") as f:
                            config = yaml.safe_load(f)
                            # Remove sensitive data
                            if isinstance(config, dict):
                                config.pop("api_keys", None)
                                config.pop("secrets", None)
                                config.pop("password", None)
                        zipf.writestr(
                            "config.yaml",
                            yaml.dump(config, default_flow_style=False, allow_unicode=True),
                        )
                    except ImportError:
                        logger.warning("yaml module not available, skipping config")
                    except Exception as e:
                        logger.warning(f"Could not include config: {e}")

                # README
                readme = f"""CuePoint Support Bundle
Generated: {datetime.now().isoformat()}

This bundle contains diagnostic information to help diagnose issues.

Contents:
- diagnostics.json: System and application information
- logs/: Application log files
- crashes/: Crash log files (if any)
- config.yaml: Configuration (sanitized, no secrets)

Please attach this file when reporting issues.
"""
                zipf.writestr("README.txt", readme)

            logger.info(f"Support bundle created: {bundle_path}")
            return bundle_path

        except Exception as e:
            logger.error(f"Failed to generate support bundle: {e}")
            raise
