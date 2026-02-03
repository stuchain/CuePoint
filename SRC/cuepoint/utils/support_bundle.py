#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Support Bundle Generator Utility

Generates comprehensive support bundle ZIP files for diagnostics.
Implements diagnostics from Step 1.9.
Design 7.6, 7.23, 7.57: Support bundle with diagnostics, logs, crashes, config.
"""

import json
import logging
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from cuepoint.utils.diagnostics import DiagnosticCollector
from cuepoint.utils.paths import AppPaths
from cuepoint.utils.run_context import get_current_run_id

logger = logging.getLogger(__name__)

# Design 7.28: Max bundle size 50MB
MAX_BUNDLE_SIZE_BYTES = 50 * 1024 * 1024


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
        run_id: Optional[str] = None,
    ) -> Path:
        """Generate support bundle (Design 7.6, 7.23, 7.57).

        Args:
            output_path: Directory where bundle will be created.
            include_logs: Whether to include log files.
            include_config: Whether to include configuration.
            sanitize: Whether to sanitize sensitive information.
            run_id: Optional run ID for bundle naming (Design 7.57).

        Returns:
            Path to created bundle file.

        Raises:
            OSError: If bundle creation fails.
        """
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        run_id = run_id or get_current_run_id() or timestamp
        bundle_name = f"cuepoint-support-{run_id}.zip"
        bundle_path = output_path / bundle_name

        logger.info(f"Generating support bundle: {bundle_path}")

        try:
            with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                total_size = 0

                # Diagnostics JSON (Design 7.24 schema)
                diagnostics = DiagnosticCollector.collect_all()
                if sanitize:
                    diagnostics = SupportBundleGenerator._sanitize_diagnostics(diagnostics)
                diag_json = json.dumps(diagnostics, indent=2, default=str, ensure_ascii=False)
                zipf.writestr("diagnostics.json", diag_json)
                total_size += len(diag_json.encode("utf-8"))

                # Log files
                if include_logs:
                    log_dir = AppPaths.logs_dir()
                    for log_file in log_dir.glob("*.log*"):
                        if total_size >= MAX_BUNDLE_SIZE_BYTES:
                            break
                        try:
                            content = log_file.read_text(encoding="utf-8", errors="ignore")
                            if sanitize:
                                content = SupportBundleGenerator._sanitize_log_content(content)
                            zipf.writestr(f"logs/{log_file.name}", content)
                            total_size += len(content.encode("utf-8"))
                        except Exception as e:
                            logger.warning(f"Could not include log file {log_file}: {e}")

                    # Crash logs (Design 7.23: also check crashes/ subdir)
                    crash_dirs = [log_dir, log_dir / "crashes"]
                    for crash_dir in crash_dirs:
                        if not crash_dir.exists():
                            continue
                        for crash_file in crash_dir.glob("crash-*.log"):
                            if total_size >= MAX_BUNDLE_SIZE_BYTES:
                                break
                            try:
                                content = crash_file.read_text(encoding="utf-8", errors="ignore")
                                if sanitize:
                                    content = SupportBundleGenerator._sanitize_log_content(content)
                                zipf.writestr(f"crashes/{crash_file.name}", content)
                                total_size += len(content.encode("utf-8"))
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
        """Sanitize sensitive information from diagnostics (Design 7.29).

        Args:
            diagnostics: Diagnostics dictionary.

        Returns:
            Sanitized diagnostics dictionary.
        """
        import copy

        sanitized = copy.deepcopy(diagnostics)
        home = str(Path.home())
        user_profile = __import__("os").environ.get("USERPROFILE", "")

        def redact_path(s: str) -> str:
            if not isinstance(s, str):
                return s
            out = s
            if home and home in out:
                out = out.replace(home, "~")
            if user_profile and user_profile in out:
                out = out.replace(user_profile, "~")
            # Design 7.17: No C:\Users\ or /Users/ in logs
            if "C:\\Users\\" in out:
                out = out.replace("C:\\Users\\", "~\\")
            if "/Users/" in out and not out.startswith("~"):
                out = out.replace("/Users/", "~/")
            return out

        # Redact paths in storage (paths and status)
        if "storage" in sanitized and isinstance(sanitized["storage"], dict):
            st = sanitized["storage"]
            if "paths" in st and isinstance(st["paths"], dict):
                for k, v in st["paths"].items():
                    if isinstance(v, str):
                        st["paths"][k] = redact_path(v)
            if "status" in st and isinstance(st["status"], dict):
                for k, v in st["status"].items():
                    if isinstance(v, dict) and "path" in v and isinstance(v.get("path"), str):
                        st["status"][k]["path"] = redact_path(v["path"])

        return sanitized

    @staticmethod
    def _sanitize_log_content(content: str) -> str:
        """Sanitize sensitive information from log content (Design 7.16, 7.17).

        Redacts home dir, C:\\Users\\, /Users/ to avoid PII in support bundles.
        """
        from pathlib import Path

        lines = content.split("\n")
        sanitized_lines = []
        home = str(Path.home())
        user_profile = __import__("os").environ.get("USERPROFILE", "")

        for line in lines:
            if home and home in line:
                line = line.replace(home, "~")
            if user_profile and user_profile in line:
                line = line.replace(user_profile, "~")
            # Design 7.17: No C:\Users\ or /Users/ in logs
            if "C:\\Users\\" in line:
                line = line.replace("C:\\Users\\", "~\\")
            if "/Users/" in line and "~" not in line[: line.find("/Users/")]:
                line = line.replace("/Users/", "~/")
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
