#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export Service Implementation

Service for exporting results to various formats.
"""

import os
from typing import List, Optional

from cuepoint.exceptions.cuepoint_exceptions import ExportError
from cuepoint.services.interfaces import IExportService, ILoggingService
from cuepoint.services.output_writer import write_csv_files
from cuepoint.models.result import TrackResult


class ExportService(IExportService):
    """Service for exporting track results to various file formats.

    Supports exporting to CSV, JSON, and Excel formats. Handles file
    creation, directory creation, and formatting.

    Attributes:
        logging_service: Service for logging operations.
    """

    def __init__(self, logging_service: Optional[ILoggingService] = None) -> None:
        """Initialize export service.

        Args:
            logging_service: Optional logging service. If None, errors are raised without logging.
        """
        self.logging_service = logging_service

    def export_to_csv(
        self, results: List[TrackResult], filepath: str, delimiter: str = ","
    ) -> None:
        """Export results to CSV file.

        Exports track results to CSV format using the output_writer module.
        Creates output directory if needed.

        Args:
            results: List of TrackResult objects to export.
            filepath: Full path to output CSV file.
            delimiter: CSV delimiter (default: ",").

        Example:
            >>> results = [TrackResult(...), TrackResult(...)]
            >>> service.export_to_csv(results, "output/results.csv")
        Raises:
            ExportError: If export fails (file permission, disk full, etc.).

        """
        try:
            base_filename = os.path.splitext(os.path.basename(filepath))[0]
            output_dir = os.path.dirname(filepath) or "output"

            write_csv_files(
                results=results,
                base_filename=base_filename,
                output_dir=output_dir,
                delimiter=delimiter,
            )
            if self.logging_service:
                self.logging_service.info(
                    f"Exported {len(results)} tracks to CSV: {filepath}",
                    extra={"filepath": filepath, "track_count": len(results)},
                )
        except Exception as e:
            error_msg = f"Failed to export CSV to {filepath}: {str(e)}"
            if self.logging_service:
                self.logging_service.error(error_msg, exc_info=e, extra={"filepath": filepath})
            raise ExportError(
                message=error_msg,
                error_code="EXPORT_CSV_ERROR",
                context={"filepath": filepath, "track_count": len(results)},
            ) from e

    def export_to_json(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to JSON file.

        Exports track results to JSON format with pretty printing.
        Creates output directory if needed.

        Args:
            results: List of TrackResult objects to export.
            filepath: Full path to output JSON file.

        Example:
            >>> results = [TrackResult(...), TrackResult(...)]
            >>> service.export_to_json(results, "output/results.json")
        Raises:
            ExportError: If export fails (file permission, disk full, etc.).

        """
        try:
            os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

            import json

            data = [result.to_dict() for result in results]
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            if self.logging_service:
                self.logging_service.info(
                    f"Exported {len(results)} tracks to JSON: {filepath}",
                    extra={"filepath": filepath, "track_count": len(results)},
                )
        except Exception as e:
            error_msg = f"Failed to export JSON to {filepath}: {str(e)}"
            if self.logging_service:
                self.logging_service.error(error_msg, exc_info=e, extra={"filepath": filepath})
            raise ExportError(
                message=error_msg,
                error_code="EXPORT_JSON_ERROR",
                context={"filepath": filepath, "track_count": len(results)},
            ) from e

    def export_to_excel(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to Excel file.

        Exports track results to Excel format with styled headers.
        Requires openpyxl package.

        Args:
            results: List of TrackResult objects to export.
            filepath: Full path to output Excel file.

        Raises:
            ExportError: If export fails (missing openpyxl, file permission, disk full, etc.).

        Example:
            >>> results = [TrackResult(...), TrackResult(...)]
            >>> service.export_to_excel(results, "output/results.xlsx")
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Alignment, Font, PatternFill
        except ImportError as e:
            error_msg = "Excel export requires openpyxl. Install with: pip install openpyxl"
            if self.logging_service:
                self.logging_service.error(error_msg, exc_info=e)
            raise ExportError(
                message=error_msg,
                error_code="EXPORT_EXCEL_MISSING_DEPENDENCY",
                context={"filepath": filepath},
            ) from e

        try:
            os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

            wb = Workbook()
            ws = wb.active
            ws.title = "Results"

            # Write headers
            if results:
                headers = list(results[0].to_dict().keys())
                ws.append(headers)

                # Style header row
                header_fill = PatternFill(
                    start_color="366092", end_color="366092", fill_type="solid"
                )
                header_font = Font(bold=True, color="FFFFFF")
                for cell in ws[1]:
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = Alignment(horizontal="center")

            # Write data
            for result in results:
                row_data = list(result.to_dict().values())
                ws.append(row_data)

            wb.save(filepath)
            if self.logging_service:
                self.logging_service.info(
                    f"Exported {len(results)} tracks to Excel: {filepath}",
                    extra={"filepath": filepath, "track_count": len(results)},
                )
        except Exception as e:
            error_msg = f"Failed to export Excel to {filepath}: {str(e)}"
            if self.logging_service:
                self.logging_service.error(error_msg, exc_info=e, extra={"filepath": filepath})
            raise ExportError(
                message=error_msg,
                error_code="EXPORT_EXCEL_ERROR",
                context={"filepath": filepath, "track_count": len(results)},
            ) from e
