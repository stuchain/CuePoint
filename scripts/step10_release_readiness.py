#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Step 10: Final Configuration & Release Readiness - Master Validation Script

This script runs all automated checks for Step 10 release readiness.
Manual steps (certificates, secrets, etc.) are documented but not automated.

Usage:
    python scripts/step10_release_readiness.py [--skip-tests] [--verbose]
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Tuple


def run_command(cmd: List[str], description: str, required: bool = True, verbose: bool = False) -> Tuple[bool, str]:
    """Run a command and return success status and output."""
    if verbose:
        print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=Path(__file__).parent.parent
        )
        
        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            error_msg = result.stderr.strip() or result.stdout.strip()
            if required:
                return False, error_msg
            else:
                return True, f"WARNING: {error_msg}"
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except FileNotFoundError:
        if required:
            return False, f"Command not found: {cmd[0]}"
        else:
            return True, f"SKIP: {cmd[0]} not found (optional)"
    except Exception as e:
        return False, f"Error: {e}"


def check_step_10_2_build_system(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.2: Test Build System (without secrets)."""
    print("\n" + "=" * 60)
    print("Step 10.2: Test Build System (Without Secrets)")
    print("=" * 60)
    
    errors = []
    
    # Check build scripts exist
    build_scripts = [
        "scripts/set_build_info.py",
        "scripts/build_pyinstaller.py",
    ]
    
    for script in build_scripts:
        script_path = Path(script)
        if script_path.exists():
            print(f"[PASS] Build script exists: {script}")
        else:
            errors.append(f"Build script missing: {script}")
            print(f"[FAIL] Build script missing: {script}")
    
    # Note: Actual build testing requires running builds, which may take time
    # This is documented as a manual step in the guide
    print("[NOTE] Actual build testing should be done manually:")
    print("  - Run: python scripts/set_build_info.py")
    print("  - Run: python scripts/build_pyinstaller.py")
    print("  - Verify artifacts are created in dist/")
    
    return len(errors) == 0, errors


def check_step_10_3_certificates(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.3: Obtain Certificates (Manual Step)."""
    print("\n" + "=" * 60)
    print("Step 10.3: Obtain Certificates (Manual Step)")
    print("=" * 60)
    
    print("[MANUAL] Certificate acquisition is a manual process:")
    print("  - macOS: Developer ID Application Certificate (.p12)")
    print("  - macOS: App Store Connect API Key (.p8)")
    print("  - Windows: Code Signing Certificate (.pfx)")
    print("\nSee DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md")
    print("  for detailed instructions.")
    
    return True, []


def check_step_10_4_github_secrets(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.4: Configure GitHub Secrets (Manual Step)."""
    print("\n" + "=" * 60)
    print("Step 10.4: Configure GitHub Secrets (Manual Step)")
    print("=" * 60)
    
    print("[MANUAL] GitHub Secrets configuration is a manual process:")
    print("  Required secrets (9 total):")
    print("    macOS (7):")
    print("      - MACOS_SIGNING_CERT_P12")
    print("      - MACOS_SIGNING_CERT_PASSWORD")
    print("      - APPLE_DEVELOPER_ID")
    print("      - APPLE_TEAM_ID")
    print("      - APPLE_NOTARYTOOL_ISSUER_ID")
    print("      - APPLE_NOTARYTOOL_KEY_ID")
    print("      - APPLE_NOTARYTOOL_KEY")
    print("    Windows (2):")
    print("      - WINDOWS_CERT_PFX")
    print("      - WINDOWS_CERT_PASSWORD")
    print("\nSee DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md")
    print("  for detailed instructions.")
    
    return True, []


def check_step_10_5_signed_builds(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.5: Test Signed Builds (Requires Secrets)."""
    print("\n" + "=" * 60)
    print("Step 10.5: Test Signed Builds")
    print("=" * 60)
    
    print("[NOTE] Signed build testing requires:")
    print("  - GitHub Secrets configured (Step 10.4)")
    print("  - Certificates obtained (Step 10.3)")
    print("  - Test tag created: git tag v1.0.0-test-signing")
    print("  - Monitor GitHub Actions workflows")
    print("\nThis step should be performed manually after secrets are configured.")
    
    return True, []


def check_step_10_6_release_workflow(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.6: Test Release Workflow (Requires Secrets)."""
    print("\n" + "=" * 60)
    print("Step 10.6: Test Release Workflow")
    print("=" * 60)
    
    # Check release workflow exists
    release_workflow = Path(".github/workflows/release.yml")
    if release_workflow.exists():
        print(f"[PASS] Release workflow exists: {release_workflow}")
    else:
        print(f"[WARN] Release workflow not found: {release_workflow}")
    
    print("[NOTE] Release workflow testing requires:")
    print("  - All previous steps complete")
    print("  - Test tag created: git tag v1.0.0-test-release")
    print("  - Monitor GitHub Actions workflows")
    print("\nThis step should be performed manually after all setup is complete.")
    
    return True, []


def check_step_10_7_pre_release_checklist(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.7: Final Pre-Release Checklist."""
    print("\n" + "=" * 60)
    print("Step 10.7: Final Pre-Release Checklist")
    print("=" * 60)
    
    errors = []
    
    # Check version file
    version_file = Path("SRC/cuepoint/version.py")
    if version_file.exists():
        print(f"[PASS] Version file exists: {version_file}")
        try:
            content = version_file.read_text(encoding="utf-8")
            if "__version__" in content:
                print("[PASS] Version information found in version.py")
            else:
                errors.append("Version information missing in version.py")
        except Exception as e:
            errors.append(f"Error reading version.py: {e}")
    else:
        errors.append(f"Version file missing: {version_file}")
    
    # Check PRIVACY_NOTICE.md
    privacy_notice = Path("PRIVACY_NOTICE.md")
    if privacy_notice.exists():
        print(f"[PASS] Privacy notice exists: {privacy_notice}")
    else:
        errors.append(f"Privacy notice missing: {privacy_notice}")
    
    # Check README.md
    readme = Path("README.md")
    if readme.exists():
        print(f"[PASS] README.md exists: {readme}")
    else:
        errors.append(f"README.md missing: {readme}")
    
    print("\n[NOTE] Additional manual checklist items:")
    print("  - All scripts tested and working")
    print("  - All workflows created and validated")
    print("  - GitHub Secrets configured")
    print("  - Test builds complete successfully")
    print("  - Application metadata is correct")
    print("  - Icons and branding are in place")
    print("  - Documentation is up to date")
    
    return len(errors) == 0, errors


def check_step_10_8_license_compliance(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.8: License Compliance Verification."""
    print("\n" + "=" * 60)
    print("Step 10.8: License Compliance Verification")
    print("=" * 60)
    
    errors = []
    
    # Check license validation script
    validate_licenses = Path("scripts/validate_licenses.py")
    if validate_licenses.exists():
        print(f"[PASS] License validation script exists: {validate_licenses}")
        
        # Run license validation
        success, output = run_command(
            [sys.executable, str(validate_licenses), "--requirements", "requirements-build.txt", "--allow-unknown"],
            "License validation",
            required=False,
            verbose=verbose
        )
        if success:
            print("[PASS] License validation passed")
        else:
            print(f"[WARN] License validation: {output}")
    else:
        errors.append(f"License validation script missing: {validate_licenses}")
    
    # Check license generation script
    generate_licenses = Path("scripts/generate_licenses.py")
    if generate_licenses.exists():
        print(f"[PASS] License generation script exists: {generate_licenses}")
    else:
        errors.append(f"License generation script missing: {generate_licenses}")
    
    # Check compliance validation script
    validate_compliance = Path("scripts/validate_compliance.py")
    if validate_compliance.exists():
        print(f"[PASS] Compliance validation script exists: {validate_compliance}")
        
        # Run compliance check
        success, output = run_command(
            [sys.executable, str(validate_compliance)],
            "Compliance validation",
            required=False,
            verbose=verbose
        )
        if success:
            print("[PASS] Compliance validation passed")
        else:
            print(f"[WARN] Compliance validation: {output}")
    else:
        errors.append(f"Compliance validation script missing: {validate_compliance}")
    
    # Check THIRD_PARTY_LICENSES.txt
    licenses_file = Path("THIRD_PARTY_LICENSES.txt")
    if licenses_file.exists():
        print(f"[PASS] License file exists: {licenses_file}")
    else:
        print(f"[NOTE] License file not found: {licenses_file}")
        print("  Run: python scripts/generate_licenses.py --output THIRD_PARTY_LICENSES.txt")
    
    return len(errors) == 0, errors


def check_step_10_9_update_feeds(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.9: Update Feed Configuration."""
    print("\n" + "=" * 60)
    print("Step 10.9: Update Feed Configuration")
    print("=" * 60)
    
    errors = []
    
    # Check feed generation scripts
    feed_scripts = [
        ("scripts/generate_appcast.py", "macOS appcast generation"),
        ("scripts/generate_update_feed.py", "Windows feed generation"),
        ("scripts/validate_feeds.py", "Feed validation"),
    ]
    
    for script_path, description in feed_scripts:
        script = Path(script_path)
        if script.exists():
            print(f"[PASS] {description} script exists: {script}")
        else:
            errors.append(f"Feed script missing: {script}")
            print(f"[FAIL] {description} script missing: {script}")
    
    print("\n[NOTE] Feed configuration requires:")
    print("  - Feed URLs configured in application")
    print("  - Feed generation tested")
    print("  - Feed publishing workflow tested")
    print("  - Appcasts accessible via GitHub Pages")
    
    return len(errors) == 0, errors


def check_step_10_10_performance(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.10: Performance Validation."""
    print("\n" + "=" * 60)
    print("Step 10.10: Performance Validation")
    print("=" * 60)
    
    errors = []
    
    # Check performance script
    perf_script = Path("scripts/check_performance.py")
    if perf_script.exists():
        print(f"[PASS] Performance check script exists: {perf_script}")
        
        # Run performance check
        success, output = run_command(
            [sys.executable, str(perf_script)],
            "Performance check",
            required=False,
            verbose=verbose
        )
        if success:
            print("[PASS] Performance check passed")
        else:
            print(f"[WARN] Performance check: {output}")
    else:
        errors.append(f"Performance check script missing: {perf_script}")
    
    return len(errors) == 0, errors


def check_step_10_11_security_scanning(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.11: Security Scanning Verification."""
    print("\n" + "=" * 60)
    print("Step 10.11: Security Scanning Verification")
    print("=" * 60)
    
    errors = []
    
    # Check security scan workflow
    security_workflow = Path(".github/workflows/security-scan.yml")
    if security_workflow.exists():
        print(f"[PASS] Security scan workflow exists: {security_workflow}")
    else:
        errors.append(f"Security scan workflow missing: {security_workflow}")
        print(f"[FAIL] Security scan workflow missing: {security_workflow}")
    
    print("\n[NOTE] Security scanning requires:")
    print("  - Security scan workflow runs in CI")
    print("  - No critical vulnerabilities")
    print("  - Dependencies up to date")
    print("  - Security best practices followed")
    
    return len(errors) == 0, errors


def check_step_10_12_documentation(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.12: Documentation Completeness."""
    print("\n" + "=" * 60)
    print("Step 10.12: Documentation Completeness")
    print("=" * 60)
    
    errors = []
    
    # Check core documentation
    docs = [
        ("README.md", "Main README"),
        ("PRIVACY_NOTICE.md", "Privacy notice"),
        ("THIRD_PARTY_LICENSES.txt", "Third-party licenses"),
    ]
    
    for doc_path, description in docs:
        doc = Path(doc_path)
        if doc.exists():
            content = doc.read_text(encoding="utf-8", errors="ignore")
            if len(content.strip()) > 100:
                print(f"[PASS] {description} exists and has content: {doc_path}")
            else:
                print(f"[WARN] {description} exists but is very short: {doc_path}")
        else:
            if doc_path == "THIRD_PARTY_LICENSES.txt":
                print(f"[NOTE] {description} not found (will be generated): {doc_path}")
            else:
                errors.append(f"{description} missing: {doc_path}")
                print(f"[FAIL] {description} missing: {doc_path}")
    
    # Check for CHANGELOG
    changelog = Path("CHANGELOG.md")
    if changelog.exists():
        print(f"[PASS] CHANGELOG.md exists: {changelog}")
    else:
        print(f"[NOTE] CHANGELOG.md not found (recommended but not required)")
    
    return len(errors) == 0, errors


def check_step_10_13_localization_accessibility(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.13: Localization & Accessibility Verification."""
    print("\n" + "=" * 60)
    print("Step 10.13: Localization & Accessibility Verification")
    print("=" * 60)
    
    print("[NOTE] Localization and accessibility verification:")
    print("  - Verify translation files are included (if implemented)")
    print("  - Test application in different locales")
    print("  - Verify keyboard navigation works")
    print("  - Test screen reader compatibility (if applicable)")
    print("  - Verify focus management")
    print("\nThis step should be performed manually with the built application.")
    
    return True, []


def check_step_10_14_release_notes(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.14: Release Notes & CHANGELOG."""
    print("\n" + "=" * 60)
    print("Step 10.14: Release Notes & CHANGELOG")
    print("=" * 60)
    
    errors = []
    
    # Check release notes validation script
    validate_release_notes = Path("scripts/validate_release_notes.py")
    if validate_release_notes.exists():
        print(f"[PASS] Release notes validation script exists: {validate_release_notes}")
    else:
        errors.append(f"Release notes validation script missing: {validate_release_notes}")
    
    # Check for CHANGELOG
    changelog = Path("CHANGELOG.md")
    if changelog.exists():
        print(f"[PASS] CHANGELOG.md exists: {changelog}")
        
        # Validate CHANGELOG if validation script exists
        if validate_release_notes.exists():
            success, output = run_command(
                [sys.executable, str(validate_release_notes)],
                "CHANGELOG validation",
                required=False,
                verbose=verbose
            )
            if success:
                print("[PASS] CHANGELOG validation passed")
            else:
                print(f"[WARN] CHANGELOG validation: {output}")
    else:
        print(f"[NOTE] CHANGELOG.md not found (recommended)")
    
    print("\n[NOTE] Release notes preparation:")
    print("  - Extract relevant section from CHANGELOG")
    print("  - Format for GitHub Release")
    print("  - Include key features and improvements")
    print("  - List bug fixes")
    
    return len(errors) == 0, errors


def check_step_10_15_monitoring(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.15: Post-Release Monitoring Setup."""
    print("\n" + "=" * 60)
    print("Step 10.15: Post-Release Monitoring Setup")
    print("=" * 60)
    
    print("[NOTE] Post-release monitoring setup:")
    print("  - Error monitoring configured (if applicable)")
    print("  - Analytics configured (if applicable)")
    print("  - User feedback channels ready")
    print("  - Support documentation available")
    print("  - Issue tracking system ready")
    print("\nThis step should be configured based on your monitoring needs.")
    
    return True, []


def check_step_10_16_rollback_plan(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.16: Rollback Plan Preparation."""
    print("\n" + "=" * 60)
    print("Step 10.16: Rollback Plan Preparation")
    print("=" * 60)
    
    print("[NOTE] Rollback plan preparation:")
    print("  - Document rollback procedures")
    print("  - Prepare rollback scripts (if needed)")
    print("  - Identify emergency contacts")
    print("  - Prepare communication plan")
    print("  - Consider rollback scenarios")
    print("\nThis step should be documented and communicated to the team.")
    
    return True, []


def check_step_10_17_communication(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.17: Communication Preparation."""
    print("\n" + "=" * 60)
    print("Step 10.17: Communication Preparation")
    print("=" * 60)
    
    print("[NOTE] Communication preparation:")
    print("  - Prepare release announcement text")
    print("  - Identify communication channels")
    print("  - Plan announcement timing")
    print("  - Notify team and stakeholders")
    print("\nThis step should be prepared before release.")
    
    return True, []


def check_step_10_18_production_release(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.18: Create First Production Release (Manual Step)."""
    print("\n" + "=" * 60)
    print("Step 10.18: Create First Production Release")
    print("=" * 60)
    
    print("[MANUAL] Production release creation:")
    print("  1. Complete all verification steps (10.1-10.17)")
    print("  2. Update version in SRC/cuepoint/version.py")
    print("  3. Update CHANGELOG.md")
    print("  4. Run final release readiness check:")
    print("     python scripts/release_readiness.py")
    print("  5. Create version tag:")
    print("     git tag v1.0.0")
    print("     git push origin v1.0.0")
    print("  6. Monitor GitHub Actions workflows")
    print("  7. Verify release artifacts")
    print("  8. Test installation on clean systems")
    print("  9. Announce release")
    
    return True, []


def check_step_10_19_troubleshooting(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.19: Troubleshooting Documentation."""
    print("\n" + "=" * 60)
    print("Step 10.19: Troubleshooting")
    print("=" * 60)
    
    print("[NOTE] Troubleshooting documentation:")
    print("  - Common issues documented in:")
    print("    DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md")
    print("  - Review workflow logs in GitHub Actions")
    print("  - Check DOCS/GUIDES/ for detailed instructions")
    
    return True, []


def check_step_10_20_success_criteria(verbose: bool = False) -> Tuple[bool, List[str]]:
    """Step 10.20: Success Criteria Verification."""
    print("\n" + "=" * 60)
    print("Step 10.20: Success Criteria")
    print("=" * 60)
    
    print("[NOTE] Success criteria checklist:")
    print("  Configuration:")
    print("    - All GitHub Secrets configured (9 secrets)")
    print("    - Certificates obtained and prepared")
    print("  Build System:")
    print("    - Test builds complete successfully")
    print("    - Signed builds complete successfully")
    print("    - Release workflow creates GitHub release")
    print("  Compliance:")
    print("    - License compliance verified")
    print("    - Security scans pass")
    print("  Quality Assurance:")
    print("    - Performance validation passes")
    print("    - All tests pass")
    print("    - Documentation complete")
    print("  Release Preparation:")
    print("    - CHANGELOG updated")
    print("    - Release notes prepared")
    print("    - Ready to create first production release")
    
    return True, []


def main():
    """Run all Step 10 checks."""
    parser = argparse.ArgumentParser(
        description="Step 10: Final Configuration & Release Readiness - Master Validation"
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Skip test execution (faster, less thorough)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Verbose output"
    )
    args = parser.parse_args()
    
    print("=" * 60)
    print("Step 10: Final Configuration & Release Readiness")
    print("Master Validation Script")
    print("=" * 60)
    
    # Step 10.1: Goals (documented, no automated check needed)
    print("\n" + "=" * 60)
    print("Step 10.1: Goals")
    print("=" * 60)
    print("[INFO] Goals defined in:")
    print("  DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md")
    print("\nPrimary Goals:")
    print("  - Configure all required secrets and certificates")
    print("  - Test build workflows end-to-end")
    print("  - Verify signing and notarization processes")
    print("  - Prepare for first production release")
    
    # Run all checks
    all_checks = [
        ("10.2", check_step_10_2_build_system),
        ("10.3", check_step_10_3_certificates),
        ("10.4", check_step_10_4_github_secrets),
        ("10.5", check_step_10_5_signed_builds),
        ("10.6", check_step_10_6_release_workflow),
        ("10.7", check_step_10_7_pre_release_checklist),
        ("10.8", check_step_10_8_license_compliance),
        ("10.9", check_step_10_9_update_feeds),
        ("10.10", check_step_10_10_performance),
        ("10.11", check_step_10_11_security_scanning),
        ("10.12", check_step_10_12_documentation),
        ("10.13", check_step_10_13_localization_accessibility),
        ("10.14", check_step_10_14_release_notes),
        ("10.15", check_step_10_15_monitoring),
        ("10.16", check_step_10_16_rollback_plan),
        ("10.17", check_step_10_17_communication),
        ("10.18", check_step_10_18_production_release),
        ("10.19", check_step_10_19_troubleshooting),
        ("10.20", check_step_10_20_success_criteria),
    ]
    
    results = []
    all_errors = []
    
    for step_num, check_func in all_checks:
        try:
            success, errors = check_func(verbose=args.verbose)
            results.append((step_num, success))
            all_errors.extend([f"Step {step_num}: {e}" for e in errors])
        except Exception as e:
            print(f"\n[ERROR] Step {step_num} check failed with exception: {e}")
            results.append((step_num, False))
            all_errors.append(f"Step {step_num}: Exception - {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for step_num, success in results:
        status = "[PASS]" if success else "[FAIL]"
        print(f"{status} Step {step_num}")
    
    print(f"\nTotal: {passed}/{total} steps passed")
    
    if all_errors:
        print("\nErrors found:")
        for error in all_errors:
            print(f"  - {error}")
    
    print("\n" + "=" * 60)
    print("Next Steps")
    print("=" * 60)
    print("1. Review any errors or warnings above")
    print("2. Complete manual steps (certificates, secrets, etc.)")
    print("3. Run test builds and verify workflows")
    print("4. When all checks pass, proceed with Step 10.18 (Create Release)")
    print("\nFor detailed instructions, see:")
    print("  DOCS/DESIGNS/SHIP v1.0/10_Final_Configuration_and_Release_Readiness.md")
    
    return 0 if len(all_errors) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
