#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Better error messages with actionable fixes

This module provides context-aware error messages that help users fix issues
quickly by providing specific suggestions, listing available options, and
showing relevant context.
"""

import os
import sys
from typing import List, Optional


def format_error_message(
    error_type: str,
    message: str,
    suggestions: Optional[List[str]] = None,
    context: Optional[dict] = None,
    see_also: Optional[str] = None
) -> str:
    """
    Format a comprehensive error message with context and actionable fixes
    
    Args:
        error_type: Type of error (e.g., "File Not Found", "Network Error")
        message: Primary error message
        suggestions: List of suggested fixes
        context: Additional context information (e.g., current directory, available options)
        see_also: Link or reference to documentation
    
    Returns:
        Formatted error message string
    """
    lines = []
    lines.append("=" * 80)
    lines.append(f"ERROR: {error_type}")
    lines.append("=" * 80)
    lines.append("")
    lines.append(message)
    lines.append("")
    
    if context:
        lines.append("Context:")
        for key, value in context.items():
            if isinstance(value, list):
                lines.append(f"  {key}:")
                for item in value[:10]:  # Limit to first 10 items
                    lines.append(f"    - {item}")
                if len(value) > 10:
                    lines.append(f"    ... and {len(value) - 10} more")
            else:
                lines.append(f"  {key}: {value}")
        lines.append("")
    
    if suggestions:
        lines.append("Suggested fixes:")
        for i, suggestion in enumerate(suggestions, 1):
            lines.append(f"  {i}. {suggestion}")
        lines.append("")
    
    if see_also:
        lines.append(f"See also: {see_also}")
        lines.append("")
    
    lines.append("=" * 80)
    
    return "\n".join(lines)


def error_file_not_found(
    file_path: str,
    file_type: str = "file",
    suggestion_base: Optional[str] = None
) -> str:
    """
    Generate an error message for file not found errors
    
    Args:
        file_path: Path to the file that wasn't found
        file_type: Type of file (e.g., "XML", "configuration", "YAML")
        suggestion_base: Base suggestion message (defaults to checking path)
    
    Returns:
        Formatted error message
    """
    abs_path = os.path.abspath(file_path)
    current_dir = os.getcwd()
    dir_exists = os.path.exists(os.path.dirname(abs_path)) if os.path.dirname(abs_path) else False
    file_exists = os.path.exists(file_path)
    
    context = {
        "Requested path": file_path,
        "Absolute path": abs_path,
        "Current directory": current_dir,
        "File exists": file_exists,
        "Directory exists": dir_exists
    }
    
    suggestions = []
    
    if not file_exists:
        suggestions.append(f"Verify the {file_type.lower()} file path is correct")
        
        # Check if it might be in current directory
        if not os.path.isabs(file_path):
            possible_in_current = os.path.join(current_dir, file_path)
            if os.path.exists(possible_in_current):
                suggestions.append(f"Found file in current directory: {possible_in_current}")
        
        # Check for common variations
        if file_path.endswith('.xml'):
            suggestions.append("Ensure the XML file was exported from Rekordbox")
            suggestions.append("Check if file extension is correct (.xml vs .XML)")
        elif file_path.endswith(('.yaml', '.yml')):
            suggestions.append("Check if you meant .yaml or .yml")
            suggestions.append("Copy config.yaml.template and customize it")
        
        # Suggest checking directory
        if os.path.dirname(abs_path) and not os.path.exists(os.path.dirname(abs_path)):
            suggestions.append(f"Directory does not exist: {os.path.dirname(abs_path)}")
            suggestions.append("Create the directory or use an absolute path")
    
    if suggestion_base:
        suggestions.insert(0, suggestion_base)
    
    see_also = "README.md for file path requirements"
    
    return format_error_message(
        error_type=f"{file_type} Not Found",
        message=f"Could not find {file_type.lower()} file: {file_path}",
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def error_playlist_not_found(
    playlist_name: str,
    available_playlists: List[str]
) -> str:
    """
    Generate an error message for playlist not found errors
    
    Args:
        playlist_name: Name of the playlist that wasn't found
        available_playlists: List of available playlist names
    
    Returns:
        Formatted error message
    """
    suggestions = [
        "Check the playlist name for typos or case sensitivity",
        "Ensure the playlist exists in your Rekordbox XML export"
    ]
    
    # Try to find similar playlist names
    playlist_lower = playlist_name.lower()
    similar = [
        p for p in available_playlists
        if playlist_lower in p.lower() or p.lower() in playlist_lower
    ]
    
    if similar:
        suggestions.append(f"Did you mean one of these? {', '.join(similar[:5])}")
    
    context = {
        "Requested playlist": playlist_name,
        "Available playlists": sorted(available_playlists),
        "Total playlists": len(available_playlists)
    }
    
    see_also = "Export your playlists from Rekordbox to include them in the XML file"
    
    return format_error_message(
        error_type="Playlist Not Found",
        message=f'Playlist "{playlist_name}" was not found in the XML file',
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def error_xml_parsing(
    xml_path: str,
    error: Exception,
    line_number: Optional[int] = None
) -> str:
    """
    Generate an error message for XML parsing errors
    
    Args:
        xml_path: Path to the XML file
        error: The parsing exception
        line_number: Optional line number where error occurred
    
    Returns:
        Formatted error message
    """
    suggestions = [
        "Ensure the XML file is a valid Rekordbox export",
        "Try re-exporting the XML file from Rekordbox",
        "Check if the file is corrupted or incomplete"
    ]
    
    context = {
        "XML file": xml_path,
        "Error type": type(error).__name__,
        "Error message": str(error)
    }
    
    if line_number:
        context["Line number"] = line_number
        suggestions.append(f"Check line {line_number} in the XML file for syntax errors")
    
    see_also = "Rekordbox XML export format documentation"
    
    return format_error_message(
        error_type="XML Parsing Error",
        message=f"Failed to parse XML file: {xml_path}",
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def error_network(
    url: str,
    error: Exception,
    error_type: str = "Network Error"
) -> str:
    """
    Generate an error message for network errors
    
    Args:
        url: URL that failed
        error: The network exception
        error_type: Type of network error
    
    Returns:
        Formatted error message
    """
    error_msg = str(error)
    suggestions = [
        "Check your internet connection",
        "Verify the website is accessible (beatport.com)",
        "Wait a moment and try again (rate limiting possible)"
    ]
    
    # Check for specific error types
    if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
        suggestions.append("The request timed out - try increasing timeout settings")
        suggestions.append("Check if your firewall or VPN is blocking connections")
    elif "connection" in error_msg.lower() or "resolve" in error_msg.lower():
        suggestions.append("DNS resolution failed - check your internet connection")
        suggestions.append("Try disabling VPN if active")
    elif "SSL" in error_msg or "certificate" in error_msg.lower():
        suggestions.append("SSL certificate error - check system date/time")
        suggestions.append("Verify antivirus isn't interfering with SSL")
    elif "429" in error_msg or "rate limit" in error_msg.lower():
        suggestions.append("Rate limited - wait a few minutes before retrying")
        suggestions.append("Consider using the cache (ENABLE_CACHE: true)")
    
    context = {
        "URL": url,
        "Error": error_msg
    }
    
    see_also = "Configuring timeouts in config.yaml or using --fast preset for shorter timeouts"
    
    return format_error_message(
        error_type=error_type,
        message=f"Network request failed: {url}",
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def error_config_invalid(
    config_path: str,
    error: Exception,
    invalid_key: Optional[str] = None,
    expected_type: Optional[str] = None,
    actual_value: Optional[str] = None
) -> str:
    """
    Generate an error message for configuration errors
    
    Args:
        config_path: Path to config file
        error: The configuration exception
        invalid_key: Optional key that's invalid
        expected_type: Optional expected type
        actual_value: Optional actual value that was invalid
    
    Returns:
        Formatted error message
    """
    suggestions = [
        "Check the YAML syntax (indentation, colons, quotes)",
        "Verify all setting names match SETTINGS keys (see config.py)",
        "Check that value types match (int, float, bool, string)"
    ]
    
    if invalid_key:
        suggestions.insert(0, f"Fix invalid setting: {invalid_key}")
        if expected_type and actual_value:
            suggestions.append(f"  - Expected: {expected_type}")
            suggestions.append(f"  - Got: {actual_value} ({type(actual_value).__name__})")
    
    context = {
        "Config file": config_path,
        "Error": str(error)
    }
    
    if invalid_key:
        context["Invalid key"] = invalid_key
    
    see_also = "config.yaml.template for example configuration format"
    
    return format_error_message(
        error_type="Configuration Error",
        message=f"Invalid configuration in: {config_path}",
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def error_missing_dependency(
    package_name: str,
    install_command: Optional[str] = None
) -> str:
    """
    Generate an error message for missing dependencies
    
    Args:
        package_name: Name of missing package
        install_command: Optional install command (defaults to pip install)
    
    Returns:
        Formatted error message
    """
    if not install_command:
        install_command = f"pip install {package_name}"
    
    suggestions = [
        f"Install the missing package: {install_command}",
        "Ensure you're using the correct Python environment (venv, conda, etc.)",
        "Check requirements.txt for all required packages"
    ]
    
    if package_name == "playwright":
        suggestions.append("After installing, run: playwright install chromium")
    
    context = {
        "Missing package": package_name,
        "Install command": install_command
    }
    
    see_also = "requirements.txt and requirements_optional.txt for all dependencies"
    
    return format_error_message(
        error_type="Missing Dependency",
        message=f"Required package not found: {package_name}",
        suggestions=suggestions,
        context=context,
        see_also=see_also
    )


def print_error(message: str, exit_code: int = 1) -> None:
    """
    Print error message and optionally exit
    
    Args:
        message: Error message to print
        exit_code: Exit code (None to not exit)
    """
    print(message, file=sys.stderr)
    if exit_code is not None:
        sys.exit(exit_code)

