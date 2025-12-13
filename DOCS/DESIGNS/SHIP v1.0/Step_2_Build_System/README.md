# Step 2: Build System & Release Pipeline - Implementation Documents

## Overview
This folder contains **implementation-focused analytical documents** for Step 2. Each document specifies **what to build**, **how to build it**, and **where the code goes**.

## Implementation Order

1. **2.1 Goals & Principles** - Foundation and guiding principles
2. **2.2 Tooling Choices** - Tool selection and setup
3. **2.3 Repository Hygiene** - Git configuration and CI gates
4. **2.4 Version Management** - Version system implementation
5. **2.5 CI Structure** - GitHub Actions workflows
6. **2.6 Artifact Structure** - Artifact organization
7. **2.7 Secrets & Cert Handling** - Security implementation
8. **2.8 Release Gating** - Quality gates
9. **2.9 Artifact Naming** - Naming conventions

## Documents

### 2.1 Goals & Principles
**File**: `2.1_Goals_and_Principles.md`
- Define build system goals
- Establish guiding principles
- Document success criteria

### 2.2 Tooling Choices
**File**: `2.2_Tooling_Choices.md`
- PyInstaller setup
- GitHub Actions configuration
- Signing tool setup
- Installer tool setup

### 2.3 Repository Hygiene
**File**: `2.3_Repository_Hygiene.md`
- .gitignore configuration
- Large file detection
- CI gates implementation

### 2.4 Version Management
**File**: `2.4_Version_Management.md`
- Version file implementation
- Build info injection
- Version validation

### 2.5 CI Structure
**File**: `2.5_CI_Structure.md`
- GitHub Actions workflows
- Build jobs implementation
- Release workflow

### 2.6 Artifact Structure
**File**: `2.6_Artifact_Structure.md`
- Artifact organization
- Update feed structure
- Release asset management

### 2.7 Secrets & Cert Handling
**File**: `2.7_Secrets_and_Cert_Handling.md`
- Secret management
- Certificate setup
- CI secret configuration

### 2.8 Release Gating
**File**: `2.8_Release_Gating.md`
- Quality gates
- Validation checks
- Rollback procedures

### 2.9 Artifact Naming
**File**: `2.9_Artifact_Naming.md`
- Naming conventions
- Version embedding
- File organization

## Key Implementation Files

### CI/CD Files
1. `.github/workflows/build.yml` - Build workflow
2. `.github/workflows/release.yml` - Release workflow
3. `.github/workflows/large-file-check.yml` - File size gate

### Build Files
1. `build/pyinstaller.spec` - PyInstaller configuration
2. `scripts/set_build_info.py` - Build info injection
3. `scripts/validate_version.py` - Version validation

### Configuration Files
1. `.gitignore` - Repository hygiene
2. `SRC/cuepoint/version.py` - Version definition

## Implementation Dependencies

### Prerequisites
- Step 1: Product requirements (defines what to build)

### Enables
- Step 3: macOS packaging (uses build system)
- Step 4: Windows packaging (uses build system)
- Step 5: Auto-update (uses build artifacts)

## References

- Main document: `../02_Build_System_and_Release_Pipeline.md`
- Index: `../00_SHIP_V1_Index.md`

