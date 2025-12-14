#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Validate macOS signing certificate

This script validates that:
1. Certificate exists in keychain
2. Certificate type is correct (Developer ID Application)
3. Certificate is not expired
4. Certificate identity matches expected

Usage:
    python scripts/validate_certificate.py [--identity <identity>]
"""

import argparse
import re
import subprocess
import sys
from datetime import datetime


def find_certificate_identity(identity_pattern=None):
    """Find certificate identity in keychain
    
    Args:
        identity_pattern: Optional pattern to match identity
        
    Returns:
        List of matching identities
    """
    try:
        result = subprocess.run(
            ['security', 'find-identity', '-v', '-p', 'codesigning'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return []
        
        identities = []
        for line in result.stdout.split('\n'):
            if 'Developer ID Application' in line:
                # Extract identity from line like:
                # "   1) ABC123DEF4 "Developer ID Application: Name (TEAM_ID)""
                match = re.search(r'"([^"]+)"', line)
                if match:
                    identity = match.group(1)
                    if not identity_pattern or identity_pattern in identity:
                        identities.append(identity)
        
        return identities
    except Exception as e:
        print(f"Error finding certificate: {e}", file=sys.stderr)
        return []


def check_certificate_expiry(identity):
    """Check if certificate is expired
    
    Args:
        identity: Certificate identity string
        
    Returns:
        Tuple of (is_valid, expiry_date, error_message)
    """
    try:
        result = subprocess.run(
            ['security', 'find-certificate', '-c', identity, '-p'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return False, None, "Could not find certificate"
        
        # Get certificate details
        cert_result = subprocess.run(
            ['openssl', 'x509', '-noout', '-dates'],
            input=result.stdout,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if cert_result.returncode != 0:
            return False, None, "Could not parse certificate"
        
        # Parse expiry date
        match = re.search(r'notAfter=(.+)', cert_result.stdout)
        if match:
            expiry_str = match.group(1)
            try:
                expiry_date = datetime.strptime(expiry_str, '%b %d %H:%M:%S %Y %Z')
                now = datetime.now()
                if expiry_date < now:
                    return False, expiry_date, f"Certificate expired on {expiry_date}"
                return True, expiry_date, None
            except ValueError:
                return False, None, f"Could not parse expiry date: {expiry_str}"
        
        return False, None, "Could not find expiry date"
    except Exception as e:
        return False, None, f"Error checking certificate: {e}"


def validate_certificate(identity_pattern=None):
    """Validate certificate
    
    Args:
        identity_pattern: Optional pattern to match identity
        
    Returns:
        Tuple of (is_valid, list_of_errors)
    """
    errors = []
    warnings = []
    
    # Find certificate
    identities = find_certificate_identity(identity_pattern)
    
    if not identities:
        errors.append("No Developer ID Application certificate found in keychain")
        return False, errors, warnings
    
    if len(identities) > 1:
        warnings.append(f"Multiple certificates found: {identities}")
    
    identity = identities[0]
    print(f"Found certificate: {identity}")
    
    # Check expiry
    is_valid, expiry_date, error_msg = check_certificate_expiry(identity)
    if not is_valid:
        if error_msg:
            errors.append(error_msg)
        else:
            errors.append("Certificate validation failed")
    else:
        if expiry_date:
            days_until_expiry = (expiry_date - datetime.now()).days
            print(f"Certificate expires on: {expiry_date}")
            if days_until_expiry < 30:
                warnings.append(f"Certificate expires in {days_until_expiry} days")
    
    # Check identity format
    if 'Developer ID Application' not in identity:
        errors.append("Certificate is not a Developer ID Application certificate")
    
    return len(errors) == 0, errors, warnings


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Validate macOS signing certificate'
    )
    parser.add_argument('--identity',
                       help='Identity pattern to match (optional)')
    
    args = parser.parse_args()
    
    valid, errors, warnings = validate_certificate(args.identity)
    
    if warnings:
        for warning in warnings:
            print(f"WARNING: {warning}")
    
    if not valid:
        print("Certificate validation failed:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    
    print("✓ Certificate validation passed")
    sys.exit(0)


if __name__ == '__main__':
    main()
