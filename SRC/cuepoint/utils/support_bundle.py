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
    def generate_bundle(
        output_path: Path,
        include_logs: bool = True,
        include_config: bool = True,
        sanitize: bool = True,
    ) -> Path:
        """Generate support bundle.

        Args:
            output_path: Directory where bundle will be created.
            include_logs: Whether to include log files.
            include_config: Whether to include configuration.
            sanitize: Whether to sanitize sensitive information.

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
                if sanitize:
                    diagnostics = SupportBundleGenerator._sanitize_diagnostics(diagnostics)
                zipf.writestr(
                    "diagnostics.json",
                    json.dumps(diagnostics, indent=2, default=str, ensure_ascii=False),
                )

                # Log files
                if include_logs:
                    log_dir = AppPaths.logs_dir()
                    for log_file in log_dir.glob("*.log*"):
                        try:
                            content = log_file.read_text(encoding="utf-8", errors="ignore")
                            if sanitize:
                                content = SupportBundleGenerator._sanitize_log_content(content)
                            zipf.writestr(f"logs/{log_file.name}", content)
                        except Exception as e:
                            logger.warning(f"Could not include log file {log_file}: {e}")

                    # Crash logs
                    for crash_file in log_dir.glob("crash-*.log"):
                        try:
                            content = crash_file.read_text(encoding="utf-8", errors="ignore")
                            if sanitize:
                                content = SupportBundleGenerator._sanitize_log_content(content)
                            zipf.writestr(f"crashes/{crash_file.name}", content)
                        except Exception as e:
                            logger.warning(f"Could not include crash log {crash_file}: {e}")

                # Config file (if exists, sanitized)
                if include_config:
                    config_file = AppPaths.config_file()
                    if config_file.exists():
                        try:
                            import yaml

                            with open(config_file, "r", encoding="utf-8") as f:
                                config = yaml.safe_load(f)
                                # Remove sensitive data
                                if isinstance(config, dict):
                                    if sanitize:
                                        config = SupportBundleGenerator._sanitize_config(config)
                                    else:
                                        # Still remove obvious secrets
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
"""
                if include_logs:
                    readme += "- logs/: Application log files\n- crashes/: Crash log files (if any)\n"
                if include_config:
                    readme += "- config.yaml: Configuration"
                    if sanitize:
                        readme += " (sanitized, no secrets)"
                    readme += "\n"

                readme += "\nPlease attach this file when reporting issues."
                if sanitize:
                    readme += "\n\nNote: Sensitive information has been sanitized."
                zipf.writestr("README.txt", readme)

            logger.info(f"Support bundle created: {bundle_path}")
            return bundle_path

        except Exception as e:
            logger.error(f"Failed to generate support bundle: {e}")
            raise

    @staticmethod
    def _sanitize_diagnostics(diagnostics: dict) -> dict:
        """Sanitize sensitive information from diagnostics.

        Args:
            diagnostics: Diagnostics dictionary.

        Returns:
            Sanitized diagnostics dictionary.
        """
        sanitized = diagnostics.copy()

        # Redact file paths (keep structure, redact user names)
        if "paths" in sanitized:
            from pathlib import Path

            home = str(Path.home())
            for key, path in sanitized["paths"].items():
                if isinstance(path, str) and path.startswith(home):
                    sanitized["paths"][key] = path.replace(home, "~")

        return sanitized

    @staticmethod
    def _sanitize_log_content(content: str) -> str:
        """Sanitize sensitive information from log content.

        Args:
            content: Log file content.

        Returns:
            Sanitized log content.
        """
        from pathlib import Path

        lines = content.split("\n")
        sanitized_lines = []

        home = str(Path.home())
        for line in lines:
            # Redact file paths
            if home in line:
                line = line.replace(home, "~")
            sanitized_lines.append(line)

        return "\n".join(sanitized_lines)

    @staticmethod
    def _sanitize_config(config: dict) -> dict:
        """Sanitize sensitive configuration data.

        Args:
            config: Configuration dictionary.

        Returns:
            Sanitized configuration dictionary.
        """
        sanitized = config.copy()

        # Remove or redact sensitive keys
        sensitive_keys = ["api_key", "api_keys", "token", "tokens", "password", "secret", "secrets"]
        for key in sensitive_keys:
            if key in sanitized:
                sanitized[key] = "[REDACTED]"

        return sanitized
