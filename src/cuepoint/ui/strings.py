#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UX Strings Module (Step 8 - Localization Readiness)

Centralized user-facing strings for the CuePoint UI. All strings are
externalized here to support future localization. Use tr() for translation
when i18n is enabled.

Design 8.38: Use Qt translations. Store strings in resource files.
Design 8.65-8.68: Short, direct sentences. Use "you" language.
"""

from cuepoint.utils.i18n import tr


# --- Empty States (Design 8.19, 8.76-8.78) ---
class EmptyState:
    """Empty state copy for UX consistency."""

    NO_XML_TITLE = tr(
        "empty_no_xml_title", "Select a Rekordbox XML to start.", "EmptyState"
    )
    NO_XML_ACTION = tr("empty_no_xml_action", "Browse", "EmptyState")
    NO_PLAYLIST_TITLE = tr(
        "empty_no_playlist_title", "Choose a playlist to continue.", "EmptyState"
    )
    NO_PLAYLIST_ACTION = tr("empty_no_playlist_action", "Select playlist", "EmptyState")
    NO_RESULTS_TITLE = tr("empty_no_results_title", "No results yet", "EmptyState")
    NO_RESULTS_ACTION = tr("empty_no_results_action", "Start processing", "EmptyState")
    GET_STARTED_TITLE = tr(
        "get_started_title",
        "Get started by selecting your Collection XML",
        "EmptyState",
    )
    GET_STARTED_BODY = tr(
        "get_started_body",
        "Export your Rekordbox collection as XML, then select it here.\n"
        "After loading, choose Single or Batch mode to continue.",
        "EmptyState",
    )
    BROWSE_FOR_XML = tr("browse_xml", "Browse for XML…", "EmptyState")
    VIEW_INSTRUCTIONS = tr("view_instructions", "View instructions…", "EmptyState")
    NO_PLAYLISTS_IN_XML = tr(
        "empty_no_playlists_in_xml", "No playlists found in XML", "EmptyState"
    )
    XML_NOT_FOUND = tr("empty_xml_not_found", "XML file not found", "EmptyState")
    ERROR_LOADING_XML = tr("empty_error_loading_xml", "Error loading XML", "EmptyState")
    NO_XML_LOADED = tr("empty_no_xml_loaded", "No XML file loaded", "EmptyState")


# --- Error Messages (Design 8.21, 8.67, 8.169) ---
class ErrorCopy:
    """User-friendly error copy - actionable, avoid jargon."""

    FILE_NOT_FOUND = tr(
        "error_file_not_found",
        "The XML file could not be found. It may have been moved or deleted.",
        "ErrorCopy",
    )
    XML_UNREADABLE = tr(
        "error_xml_unreadable",
        "We couldn't read the XML. Please re-export from Rekordbox.",
        "ErrorCopy",
    )
    PLAYLIST_MISSING = tr(
        "error_playlist_missing",
        "The playlist could not be found. It may have been removed or renamed.",
        "ErrorCopy",
    )
    OUTPUT_UNWRITABLE = tr(
        "error_output_unwritable",
        "We couldn't write the output file. Check folder permissions.",
        "ErrorCopy",
    )
    RETRY = tr("error_retry", "Retry", "ErrorCopy")
    CHOOSE_ANOTHER_FILE = tr("error_choose_another", "Choose another file", "ErrorCopy")


# --- Loading States (Design 8.79-8.80) ---
class LoadingCopy:
    """Loading/progress copy."""

    PARSING_XML = tr("loading_parsing", "Parsing XML...", "LoadingCopy")
    SEARCHING_BEATPORT = tr("loading_searching", "Searching Beatport...", "LoadingCopy")
    WRITING_OUTPUTS = tr("loading_writing", "Writing outputs...", "LoadingCopy")
    PROCESSING = tr("loading_processing", "Processing...", "LoadingCopy")
    PROCESSING_COUNT = tr(
        "loading_count", "Processing {current}/{total}", "LoadingCopy"
    )


# --- Status (Design 8.55-8.56) ---
class StatusCopy:
    """Status bar and progress copy."""

    READY = tr("status_ready", "Ready", "StatusCopy")
    DONE = tr("status_done", "Done", "StatusCopy")
    STATUS_PROCESSING = tr("status_processing", "Status: Processing", "StatusCopy")
    ETA = tr("status_eta", "ETA: {eta}", "StatusCopy")


# --- Success / Run Summary (Design 8.26, 8.74-8.75) ---
class SuccessCopy:
    """Success criteria and next steps."""

    NEXT_STEPS_DEFAULT = tr(
        "success_next_steps",
        "Next steps: review low-confidence matches and export outputs if needed.",
        "SuccessCopy",
    )
    OPEN_OUTPUT_FOLDER = tr("success_open_folder", "Open output folder", "SuccessCopy")
    OPEN_REVIEW_FILE = tr("success_open_review", "Open review file", "SuccessCopy")
    COPY_SUMMARY = tr("success_copy_summary", "Copy summary", "SuccessCopy")
    CLOSE = tr("success_close", "Close", "SuccessCopy")
    RUN_SUMMARY_TITLE = tr("success_run_summary", "Run summary", "SuccessCopy")
    REVIEW_LOW_CONFIDENCE = tr(
        "success_review",
        "Review low-confidence matches below.",
        "SuccessCopy",
    )
    WHAT_TO_DO_NEXT = tr(
        "success_what_next",
        "What to do next:",
        "SuccessCopy",
    )
    STEP_REVIEW = tr(
        "success_step_review",
        "1. Review low-confidence matches in the Results tab.",
        "SuccessCopy",
    )
    STEP_EXPORT = tr(
        "success_step_export",
        "2. Export results when satisfied (File → Export or Ctrl+E).",
        "SuccessCopy",
    )
    STEP_REKORDBOX = tr(
        "success_step_rekordbox",
        "3. Import the CSV into Rekordbox to update your collection.",
        "SuccessCopy",
    )
    STEP_UNDO_GUIDANCE = tr(
        "success_step_undo",
        "To undo: Rekordbox does not auto-revert. Re-import your original XML or restore from backup if needed.",
        "SuccessCopy",
    )
    STEP_NEXT_SHORT = tr(
        "success_step_next_short",
        "Export (Ctrl+E) then import the CSV into Rekordbox.",
        "SuccessCopy",
    )


# --- Tooltips (Design 8.128) ---
class TooltipCopy:
    """Contextual help tooltips."""

    XML_PATH = tr(
        "tooltip_xml",
        "Select your Rekordbox XML file.",
        "TooltipCopy",
    )
    PLAYLIST = tr(
        "tooltip_playlist",
        "Select a playlist to process.",
        "TooltipCopy",
    )
    START_PROCESSING = tr(
        "tooltip_start",
        "Start processing the selected playlist(s).\n"
        "Searches Beatport for each track and enriches with metadata.",
        "TooltipCopy",
    )
    SEARCH_RESULTS = tr("tooltip_search", "Search tracks...", "TooltipCopy")


# --- Buttons (Design 8.199) ---
class ButtonCopy:
    """Button labels."""

    START = tr("btn_start", "Start", "ButtonCopy")
    PAUSE = tr("btn_pause", "Pause", "ButtonCopy")
    EXPORT = tr("btn_export", "Export", "ButtonCopy")
    BROWSE = tr("btn_browse", "Browse...", "ButtonCopy")
    CLOSE = tr("btn_close", "Close", "ButtonCopy")
    COPY_DETAILS = tr("btn_copy_details", "Copy details", "ButtonCopy")
    OPEN_LOGS = tr("btn_open_logs", "Open logs", "ButtonCopy")


# --- Export Preview (Design 8.9) ---
class ExportCopy:
    """Export and preview copy."""

    PREVIEW_TITLE = tr("export_preview_title", "Preview outputs", "ExportCopy")
    PREVIEW_MESSAGE = tr(
        "export_preview_message",
        "The following files will be created:",
        "ExportCopy",
    )
    CONFIRM_EXPORT = tr("export_confirm", "Confirm export", "ExportCopy")
    CANCEL = tr("export_cancel", "Cancel", "ExportCopy")


# --- Warnings (Design 8.68) ---
class WarningCopy:
    """Warning messages."""

    LARGE_LIBRARY = tr(
        "warn_large_library",
        "Large library detected. Processing may take longer.",
        "WarningCopy",
    )
