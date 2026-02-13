# Design: Two Appcast Feeds (Stable vs Test)

**Status:** Design  
**Goal:** Test builds receive updates only from the test feed; stable builds only from the stable feed. Website continues to offer only normal (stable) releases for download.

---

## 1. Requirements analysis

### 1.1 Functional requirements (must hold after implementation)

| ID | Requirement | Verification |
|----|-------------|--------------|
| FR1 | A build whose version string is a **test** version (e.g. contains `-test`) shall receive update checks from **only** the test appcast feed(s). | App requests `…/test/appcast.xml` when `is_test_version(current_version)` is True. |
| FR2 | A build whose version string is **not** a test version shall receive update checks from **only** the stable (or user-chosen) feed(s), never the test feed. | App requests `…/stable/appcast.xml` (or `…/beta/…`) when `is_test_version(current_version)` is False. |
| FR3 | The **stable** appcast feed shall contain **only** releases from normal (non-test) tags. | Workflow: stable appcast steps run iff tag does not contain `-test`; only those steps write to `updates/*/stable/`. |
| FR4 | The **test** appcast feed shall contain **only** releases from test tags. | Workflow: test appcast steps run iff tag contains `-test`; only those steps write to `updates/*/test/`. |
| FR5 | The website download buttons shall offer **only** normal (non-draft, non-prerelease) releases. | index.html uses GitHub `releases/latest`; test releases remain draft → excluded. |

### 1.2 Safety invariants (must never be violated)

| ID | Invariant | Rationale |
|----|-----------|-----------|
| I1 | **Stable feed disjoint from test feed:** No tag type may write to both stable and test appcasts in the same run. | Prevents cross-contamination. |
| I2 | **Channel follows version:** The HTTP request for the appcast URL is determined by the **built-in** version string (test vs non-test), not solely by user-editable preferences. | Prevents stable users from being pointed at test feed by preference. |
| I3 | **Test tag must not mutate stable or index:** A push with a test tag must not modify `updates/*/stable/*` or gh-pages root files (index.html, logo). | Preserves production integrity. |
| I4 | **Normal tag must not mutate test appcasts:** A push with a normal tag must not modify `updates/*/test/*`. | Test channel remains isolated. |

### 1.3 Current state (as-built)

| Component | Behavior | Relevant for |
|-----------|----------|--------------|
| **Tag naming** | `v*` = normal; `v*-test*` = test. | Workflow branching. |
| **GitHub Release** | Test tag → draft + prerelease; normal → published. | Website “latest” and visibility. |
| **Appcast today** | Only normal tags run appcast steps; output: `updates/macos/stable/`, `updates/windows/stable/`. Test tags do **not** run any appcast step. | FR3 satisfied; FR4 fails (no test feed). |
| **UpdateChecker** | `get_feed_url(platform)` = `{feed_url}/{platform}/{channel}/appcast.xml`. Channel from preferences only. `_find_latest_update()` filters same track (test↔test, non-test↔non-test). | FR2 satisfied if channel=stable; FR1 fails (no test feed URL). |
| **Website** | `releases/latest` → excludes draft. | FR5 satisfied. |

### 1.4 Gap analysis

| Requirement | Current | Gap |
|-------------|---------|-----|
| FR1 | Test builds use preference channel (stable/beta); no test feed exists. | Add test feed; make **effective channel** = `"test"` when `is_test_version(current_version)`. |
| FR4 | Test tags do not run appcast generation. | Add workflow branch for test tag: generate and publish only `updates/*/test/` appcasts. |
| I3, I4 | Not explicitly enforced; workflow only has one appcast path (stable). | Enforce by: (1) stable steps run only on non-test tag; (2) new test steps run only on test tag; (3) test publish does not pass `--index`. |

### 1.5 Test releases remain drafts (no change)

- **GitHub Release creation** in the release workflow **does not change**: test tags continue to create **draft** (and prerelease) releases; normal tags create published releases.
- **Rationale:** Draft test releases stay hidden from the public Releases list and from `releases/latest`. The **only** addition is the **test appcast feed** on gh-pages, so that test builds can discover updates in-app. The website and “latest” behavior remain unchanged; test releases are still not offered for download on the site.

---

## 2. Decision analysis

### 2.1 Option comparison

| Criterion | Two feeds (chosen) | Single feed + client filter | Single feed + channel tag in XML |
|-----------|--------------------|-----------------------------|-----------------------------------|
| **Stable feed purity** | Stable feed is only stable entries. | Feed contains both; client must filter. Bug in filter could show test to stable users. | Same as single feed. |
| **Server logic** | Two write paths (stable vs test); no filtering. | One write path; all releases in one file. | One write path; schema extended. |
| **Client logic** | Choose URL by version (test → test URL). No per-item filter. | One URL; must filter items by version type. | One URL; must filter items by channel. |
| **Failure mode** | Wrong feed URL → 404 or empty; no wrong-version update. | Filter bug → stable user could see test update (or vice versa). | Same as single feed. |
| **Rollback** | Revert test branch; test feed stops updating. | Revert filter; all items visible to all. | Revert schema + filter. |

**Conclusion:** Two feeds give strict isolation (invariants I1–I4) with minimal client logic and no filter bug surface. Chosen option.

### 2.2 Rejected alternatives

- **Single feed, filter in app:** Rejected due to risk of filter bug (I2 violation) and larger feed for stable users.
- **User-selectable “test” channel in preferences:** Rejected; test channel must be derived from build version so stable builds cannot be switched to test feed by preference alone (I2).

### 2.3 Effective channel (formal)

Let:

- `V` = current application version string (from build).
- `P` = user preference channel (`"stable"` or `"beta"`).

Then:

```
effective_channel(V, P) = "test"   if is_test_version(V)
                        = P        otherwise
```

- **Domain of `V`:** Any string; `is_test_version` is defined in `version_utils` (e.g. prerelease segment starts with `"test"`).
- **Implication:** Test builds **always** use `"test"`; preference is ignored when `is_test_version(V)` is True.

---

## 3. Target architecture

### 3.1 Feed layout (gh-pages)

```
updates/
  macos/
    stable/
      appcast.xml   ← written only by workflow on normal tag
    test/
      appcast.xml   ← written only by workflow on test tag
  windows/
    stable/
      appcast.xml
    test/
      appcast.xml
```

**Invariant:** For each path `updates/{platform}/{channel}/appcast.xml`, the **only** workflow branch that may write to it is the one whose condition matches that channel (normal tag → stable; test tag → test).

### 3.2 Control flow: tag → workflow

| Tag pattern | Condition | Steps run | Files written |
|-------------|-----------|-----------|----------------|
| No `-test` in ref | `!contains(github.ref_name, '-test')` | Fetch stable appcasts, generate stable, validate stable, publish stable + index | `updates/macos/stable/appcast.xml`, `updates/windows/stable/appcast.xml`, index.html, logo |
| `-test` in ref | `contains(github.ref_name, '-test')` | Fetch test appcasts, generate test, validate test, publish test only | `updates/macos/test/appcast.xml`, `updates/windows/test/appcast.xml` |

**Mutual exclusion:** Each tag matches exactly one of the two conditions; therefore exactly one of the two appcast branches runs per push.

### 3.3 Data flow: app → feed URL

```
current_version (from build)
        │
        ▼
is_test_version(current_version) ──► True  ──► channel = "test"
        │
        └──────────────────────────► False ──► channel = preferences.get_channel()
        │
        ▼
get_feed_url(platform) = "{feed_url}/{platform}/{channel}/appcast.xml"
        │
        ▼
HTTP GET → appcast.xml (single feed per channel; no cross-channel request)
```

### 3.4 Website

- **No change.** Continue using GitHub API `releases/latest` for download buttons. Test releases remain draft → excluded from “latest.” FR5 remains satisfied.

### 3.5 Version string conventions

- **Normal (stable) versions:** `X.Y.Z` or `X.Y.Z-prerelease` where prerelease does **not** start with `"test"` (e.g. `1.0.0`, `1.0.0-alpha`, `1.0.0-beta.1`). Tag examples: `v1.0.4`, `v1.0.0-alpha`.
- **Test versions:** Prerelease segment starts with `"test"` (e.g. `1.0.3-test1`, `1.0.4-test4.2`). Tag examples: `v1.0.3-test1.1`, `v1.0.5-test2`.
- **Detection:** `is_test_version(version)` in `version_utils` parses the version and returns True iff the prerelease part (after `-`) exists and `prerelease.lower().startswith("test")`.

### 3.6 Append / single-entry semantics

- Both macOS and Windows appcast generators support `--append` and read existing appcast if present. **Current behavior:** they replace all existing `<item>` elements with a single new item (the release being added), so each feed effectively contains **one** entry (the latest for that channel). No change required for test channel; same semantics apply to `updates/*/test/appcast.xml`.

---

## 4. Implementation steps (ordered, with pre/post conditions)

### Phase A: Scripts and channel support

**Precondition:** Current scripts support `--channel stable|beta` and output to `updates/{platform}/{channel}/appcast.xml`.  
**Postcondition:** Scripts accept `--channel test` and can produce `updates/*/test/appcast.xml`; validate and publish remain path-agnostic.

#### Step A.1 – Add `test` to macOS appcast generator

| Item | Detail |
|------|--------|
| **File** | `scripts/generate_appcast.py` |
| **Change** | `--channel` choices: `['stable', 'beta']` → `['stable', 'beta', 'test']`. Default unchanged. |
| **Path logic** | Already `updates/macos/{channel}/appcast.xml`; no change. |
| **Postcondition** | `--channel test` produces valid appcast under `updates/macos/test/appcast.xml`. |
| **Check** | `python scripts/generate_appcast.py --dmg <dmg> --version 1.0.0-test1 --url <url> --channel test --output updates/macos/test/appcast.xml` → file created and valid. |

#### Step A.2 – Add `test` to Windows update feed generator

| Item | Detail |
|------|--------|
| **File** | `scripts/generate_update_feed.py` |
| **Change** | `--channel` choices: add `'test'`. |
| **Postcondition** | `--channel test` produces valid feed under `updates/windows/test/appcast.xml`. |
| **Check** | Analogous to A.1 for Windows. |

#### Step A.3 – Validate script

| Item | Detail |
|------|--------|
| **File** | `scripts/validate_feeds.py` |
| **Change** | None (path-based; no channel enum). |
| **Check** | `validate_feeds.py --macos updates/macos/test/appcast.xml --windows updates/windows/test/appcast.xml` succeeds for valid test appcasts. |

#### Step A.4 – Publish script

| Item | Detail |
|------|--------|
| **File** | `scripts/publish_feeds.py` |
| **Change** | None. It copies given paths into gh-pages; which paths are passed is determined by the workflow. |
| **Invariant** | When workflow passes only test paths (and no `--index`), only those paths are updated (I3). |

---

### Phase B: App – effective channel from version

**Precondition:** UpdateManager uses `preferences.get_channel()` for UpdateChecker; UpdateChecker builds URL from `channel`.  
**Postcondition:** UpdateChecker receives `effective_channel` as defined in §2.3; test builds use `"test"` regardless of preference.

#### Step B.1 – Compute effective channel in UpdateManager

| Item | Detail |
|------|--------|
| **File** | `src/cuepoint/update/update_manager.py` |
| **Current** | `channel = self.preferences.get_channel()`; `UpdateChecker(..., channel=channel)`. |
| **New** | `effective_channel = "test" if is_test_version(self.current_version) else self.preferences.get_channel()`; `UpdateChecker(..., channel=effective_channel)`. |
| **Import** | `from cuepoint.update.version_utils import is_test_version` (if missing). |
| **Postcondition** | FR1 and FR2 satisfied; I2 satisfied. |
| **Check** | Version `1.0.3-test1` → checker.get_feed_url(...) contains `/test/`; version `1.0.0` → contains `/stable/` (or `/beta/`). |

#### Step B.2 – UpdateChecker and preferences

| Item | Detail |
|------|--------|
| **UpdateChecker** | `get_feed_url` is `{feed_url}/{platform}/{self.channel}/appcast.xml`; no restriction on `channel`. Value `"test"` is valid. No change. |
| **UpdatePreferences** | Optional: add `CHANNEL_TEST = "test"` for clarity. Do **not** expose “test” as user-selectable; it is derived from version. |

---

### Phase C: Release workflow – normal vs test branches

**Precondition:** Only one appcast branch exists (stable, on normal tag).  
**Postcondition:** Two mutually exclusive branches; each tag updates only the appcasts for its channel; index updated only on normal tag (I3, I4).

#### Step C.1 – Normal tag (unchanged)

| Item | Detail |
|------|--------|
| **Condition** | `if: ${{ !contains(github.ref_name, '-test') }}` on all existing appcast steps. |
| **Steps** | Fetch stable appcasts → Generate stable (`--channel stable`) → Validate stable → Publish stable appcasts **and** index (`--index`). |
| **Postcondition** | Only `updates/*/stable/*` and root index/logo touched; `updates/*/test/*` untouched (I4). |

#### Step C.2 – Test tag (new block)

| Item | Detail |
|------|--------|
| **Condition** | `if: ${{ contains(github.ref_name, '-test') }}`. Place after release creation and checksum upload. |
| **Steps** | (1) Fetch existing test appcasts from gh-pages (create dirs; `git show origin/gh-pages:...` for each test appcast; tolerate missing file). (2) Generate test appcasts with `--channel test` and output paths `updates/macos/test/appcast.xml`, `updates/windows/test/appcast.xml`. (3) Validate with those paths. (4) Publish **only** those two paths; **do not** pass `--index`. |
| **Postcondition** | Only `updates/*/test/*` touched; stable and index untouched (I3). |

#### Step C.3 – Mutual exclusion

| Item | Detail |
|------|--------|
| **Check** | For every tag, exactly one of the two conditions is true. No step may run without the correct condition. |
| **Verification** | Normal tag: stable steps run, test steps do not. Test tag: test steps run, stable steps do not. |

---

### Phase D: Verification and risk

#### D.1 Pre-merge verification conditions

| # | Condition | How to verify |
|---|-----------|----------------|
| V1 | Scripts accept `--channel test` and produce files under `updates/*/test/`. | Run generators with `--channel test`. |
| V2 | UpdateManager uses channel `"test"` when `is_test_version(current_version)` is True. | Unit test or debug log. |
| V3 | Normal tag in CI: only stable appcasts and index updated. | Push normal tag; inspect gh-pages commit. |
| V4 | Test tag in CI: only test appcasts updated; stable and index unchanged. | Push test tag; inspect gh-pages commit. |
| V5 | Website still uses `releases/latest`. | No change to index.html. |

#### D.2 Risk and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Test branch writes to stable path (typo/wrong path) | High | Use explicit paths in workflow; no variable that could expand to `stable` in test branch. |
| Normal branch writes to test path | High | Do not add any step in normal branch that references `updates/*/test/`. |
| First test release: missing test appcast on gh-pages | Low | Fetch step tolerates missing file; generate creates new; publish adds new file. Confirm publish_feeds adds untracked files. |
| effective_channel wrong (e.g. preference overrides version) | High | Implement B.1 exactly: test version ⇒ `"test"`; no preference in that branch. |
| Index updated on test tag | Medium | Do not pass `--index` in test publish call. |

#### D.3 Edge cases (analytic)

| Case | System state | Expected behavior | Guarantee |
|------|--------------|-------------------|-----------|
| First test release ever | No `updates/*/test/appcast.xml` on gh-pages | Fetch fails for missing file (or creates empty); generate creates new appcast; publish adds new files. | publish_feeds must support adding new paths; git add for untracked. |
| Same base version, stable and test | e.g. v1.0.5 and v1.0.5-test1 | Stable feed has 1.0.5; test feed has 1.0.5-test1. | Separate feeds and separate workflow branches. |
| Checksums in test artifacts | Test build produces DMG/EXE with checksums | Generate scripts already embed checksums; no change. | None. |

#### D.4 Rollback (ordered)

1. **Workflow:** Revert C.2 so test tag no longer runs test appcast steps. Test builds will get no update (404 or empty) until reintroduced.
2. **App:** Revert B.1 so channel comes only from preferences. Test builds would again use stable/beta URL (and see no test entries if we later remove test feed).
3. **Scripts:** Revert A.1, A.2 (remove `test` from choices). Optional: remove test appcast files from gh-pages manually if desired.

---

## 5. File change summary

| File | Change | Phase |
|------|--------|-------|
| `scripts/generate_appcast.py` | Add `'test'` to `--channel` choices. | A.1 |
| `scripts/generate_update_feed.py` | Add `'test'` to `--channel` choices. | A.2 |
| `src/cuepoint/update/update_manager.py` | Compute `effective_channel` per §2.3; pass to UpdateChecker. | B.1 |
| `.github/workflows/release.yml` | Add test-tag-only block: fetch/generate/validate/publish test appcasts (no `--index`). Keep stable steps conditioned on non-test tag. | C.1–C.3 |
| `scripts/validate_feeds.py` | No change. | A.3 |
| `scripts/publish_feeds.py` | No change. | A.4 |
| `gh-pages-root/index.html` | No change. | — |

---

## 6. References

- Update checker: `src/cuepoint/update/update_checker.py` (`get_feed_url`, `_find_latest_update`).
- Version utils: `src/cuepoint/update/version_utils.py` (`is_test_version`).
- Release workflow: `.github/workflows/release.yml`.
- Update manager: `src/cuepoint/update/update_manager.py`.

---

## 7. Testing

Tests are required to ensure FR1, FR2, I2, and script channel behavior. The following tests are implemented in the codebase and should be run before merge and in CI.

### 7.1 Unit tests – version and channel

| Test | Location | What it verifies |
|------|----------|-------------------|
| **is_test_version** | `src/cuepoint/update/test_update_system.py` and/or `src/tests/unit/update/` | `1.0.3-test1` → True; `1.0.0`, `1.0.0-alpha`, `1.0.0-beta.1` → False. Covers FR1/FR2 precondition. |
| **effective_channel in UpdateManager** | `src/tests/unit/update/test_two_appcast_channels.py` (new) | When `current_version` is a test version (e.g. `1.0.3-test1`), `UpdateManager`’s internal `checker.channel` is `"test"` regardless of preferences. When `current_version` is not test (e.g. `1.0.0`), `checker.channel` equals preferences (e.g. `stable` or `beta`). Verifies FR1, FR2, I2. |
| **UpdateChecker get_feed_url for channel "test"** | `src/tests/unit/update/test_two_appcast_channels.py` (new) | `UpdateChecker(feed_url, version, channel="test")` → `get_feed_url("macos")` and `get_feed_url("windows")` return URLs containing `/test/appcast.xml`. Verifies feed URL shape for test channel. |
| **_find_latest_update test vs non-test** | `src/tests/unit/update/test_update_security.py` | Already present: non-test current does not see test item; test current sees test item and does not see non-test item. Ensures in-feed filtering remains correct when both feeds exist. |

### 7.2 Unit tests – appcast generators (scripts)

| Test | Location | What it verifies |
|------|----------|-------------------|
| **generate_appcast accepts --channel test** | `src/tests/unit/scripts/test_appcast_channels.py` (new) | Running `generate_appcast.py` with `--channel test` and required args (e.g. dummy DMG, URL) exits 0 and produces output path under `updates/macos/test/` (or specified `--output` contains `test`). Ensures A.1. |
| **generate_update_feed accepts --channel test** | Same file or separate | Running `generate_update_feed.py` with `--channel test` and required args (e.g. dummy EXE, URL) exits 0 and produces output under `updates/windows/test/`. Ensures A.2. |

Implementation note: Use temporary directories and minimal fake DMG/EXE files (e.g. empty or small fixed content) so scripts run without real artifacts.

### 7.3 Integration / manual checks

| Check | How | Requirement |
|-------|-----|-------------|
| Normal tag in CI | Push a normal tag (e.g. `v1.0.5`); inspect gh-pages commit: only `updates/*/stable/*` and index/logo changed. | V3, I4 |
| Test tag in CI | Push a test tag (e.g. `v1.0.5-test1`); inspect gh-pages commit: only `updates/*/test/*` changed; stable and index unchanged. | V4, I3 |
| Website | Confirm index.html still uses `releases/latest` for download buttons. | V5, FR5 |

### 7.4 Test run commands

- Run all unit tests for update system and two-channel behavior:
  - `pytest src/tests/unit/update/ -v`
- Run standalone update system script (version utils, preferences, checker init):
  - `python src/cuepoint/update/test_update_system.py`
- Run script channel tests (after adding them):
  - `pytest src/tests/unit/scripts/test_appcast_channels.py -v`

### 7.5 Traceability: requirements → tests

| ID | Requirement / invariant | Test(s) |
|----|--------------------------|---------|
| FR1 | Test build uses test feed only | effective_channel test (test version → channel `"test"`); get_feed_url test (channel test → URL with `/test/`). |
| FR2 | Non-test build uses stable/beta only | effective_channel test (non-test version → channel from preferences). |
| I2 | Channel follows version | effective_channel test (preference not used when version is test). |
| A.1 / A.2 | Scripts accept `--channel test` | generate_appcast and generate_update_feed script tests. |
| In-feed filtering | Test vs non-test item visibility | test_find_latest_update_test_vs_nontest_tracks in test_update_security.py. |

### 7.6 Additional test cases for is_test_version (edge cases)

The following version strings should be covered by unit tests to avoid regressions:

| Version string | Expected is_test_version |
|----------------|---------------------------|
| `1.0.0` | False |
| `1.0.0-test` | True |
| `1.0.0-test1` | True |
| `1.0.0-test1.1` | True |
| `1.0.0-TEST2` | True (case: prerelease lowercased before startswith check) |
| `1.0.0-alpha` | False |
| `1.0.0-beta.1` | False |
| `2.1.0-test-unsigned42` | True (prerelease is typically the part after first `-`; implementation-dependent) |

Ensure `version_utils.is_test_version` and any callers behave correctly for these inputs.

### 7.7 Negative tests (script channel)

- Passing `--channel invalid` to `generate_appcast.py` or `generate_update_feed.py` should result in an error (argparse invalid choice), not silent fallback to stable. This confirms that `test` is an explicit allowed value and the script does not accept arbitrary channels.

### 7.8 Test implementation locations

| Test class / file | Purpose |
|-------------------|---------|
| `src/tests/unit/update/test_two_appcast_channels.py` | `TestEffectiveChannel`: UpdateManager uses channel `"test"` when version is test, else preference. `TestUpdateCheckerTestChannelFeedUrl`: feed URL contains `/test/` for channel test. `TestIsTestVersionEdgeCases`: is_test_version for stable, test, alpha, beta, case, test-unsigned. |
| `src/tests/unit/scripts/test_appcast_channels.py` | `TestGenerateAppcastChannelTest`: generate_appcast.py accepts `--channel test` and writes to test path; `--channel invalid` fails. `TestGenerateUpdateFeedChannelTest`: same for generate_update_feed.py. |
| `src/tests/unit/update/test_update_security.py` | `test_find_latest_update_test_vs_nontest_tracks`: in-feed filtering so non-test current does not see test item, test current sees test item and not non-test item. |

Run all update and script channel tests: `pytest src/tests/unit/update/test_two_appcast_channels.py src/tests/unit/update/test_update_security.py src/tests/unit/scripts/test_appcast_channels.py -v`.

### 7.9 CI recommendation

- In CI, run the unit tests in §7.8 on every PR that touches `update_manager.py`, `update_checker.py`, `version_utils.py`, or the appcast/update-feed scripts. This keeps FR1, FR2, I2 and script channel behaviour regression-free.

---

## 8. Detailed workflow step list (reference)

The following is an exhaustive list of steps for the **test tag** branch only. Use it as a checklist when implementing or auditing the workflow.

1. **Condition:** Step runs only when `contains(github.ref_name, '-test')` is true.
2. **Fetch existing test appcasts:**
   - Create directories: `updates/macos/test`, `updates/windows/test`.
   - `git fetch origin gh-pages:gh-pages` (if not already done).
   - For `updates/macos/test/appcast.xml`: `git show origin/gh-pages:updates/macos/test/appcast.xml > updates/macos/test/appcast.xml` (tolerate failure if file does not exist on gh-pages).
   - For `updates/windows/test/appcast.xml`: same with windows path.
   - If `git show` fails (e.g. file missing), ensure the directory exists and leave no file or empty; the generate step will create a new appcast.
3. **Generate test appcasts:**
   - Set `VERSION` from `github.ref_name`, `VERSION_NUM` = version without leading `v`.
   - Locate DMG and EXE artifacts (same as stable path).
   - macOS: `python scripts/generate_appcast.py --dmg <DMG> --version <VERSION_NUM> --url <DMG_URL> --notes <RELEASE_NOTES_URL> --output updates/macos/test/appcast.xml --append --channel test`.
   - Windows: `python scripts/generate_update_feed.py --exe <EXE> --version <VERSION_NUM> --url <EXE_URL> --notes <RELEASE_NOTES_URL> --output updates/windows/test/appcast.xml --append --channel test`.
4. **Validate test appcasts:** `python scripts/validate_feeds.py --macos updates/macos/test/appcast.xml --windows updates/windows/test/appcast.xml`.
5. **Publish test appcasts only:** `python scripts/publish_feeds.py updates/macos/test/appcast.xml updates/windows/test/appcast.xml --branch gh-pages --message "Update appcast feeds (test) for <TAG>" --github-token "${{ secrets.GITHUB_TOKEN }}"`. Do **not** pass `--index` or any path to index.html.

**Stable branch** (unchanged): same as today; condition `!contains(github.ref_name, '-test')`; paths use `stable` and publish step includes `--index gh-pages-root/index.html`.

---

## 9. Definitions and glossary

| Term | Definition |
|------|-------------|
| **Normal tag** | A git tag matching `v*` that does **not** contain the substring `-test` (e.g. `v1.0.4`, `v2.0.0-alpha`). |
| **Test tag** | A git tag matching `v*` that **does** contain the substring `-test` (e.g. `v1.0.3-test1.1`, `v1.0.5-test2`). |
| **Stable feed** | The appcast at `updates/macos/stable/appcast.xml` and `updates/windows/stable/appcast.xml`. Contains only releases from normal tags. |
| **Test feed** | The appcast at `updates/macos/test/appcast.xml` and `updates/windows/test/appcast.xml`. Contains only releases from test tags. |
| **Effective channel** | The channel used by the app to build the appcast URL: `"test"` if the current app version is a test version, otherwise the user's preference (e.g. `stable`, `beta`). |
| **Test version** | A version string for which `is_test_version(version)` returns True (prerelease segment starts with `"test"`). |
| **Draft release** | A GitHub Release created with `draft: true`. Not shown in the public "Releases" list as latest; excluded from `releases/latest` API. Test releases are created as drafts. |

---

## 10. Summary

- **Two feeds:** stable (`updates/*/stable/`) and test (`updates/*/test/`). Workflow writes to one or the other per tag type; app chooses feed URL from effective channel (test if version is test, else preference).
- **Test releases stay drafts;** only the test appcast is added so test builds can update. Website and “latest” unchanged.
- **Implementation:** Phase A (scripts + test channel), Phase B (effective_channel in UpdateManager), Phase C (workflow branches). Tests in §7 must pass before merge.

---

## Appendix A. Example tag and ref names

| Tag / ref name | Type | Workflow branch | Draft release? |
|----------------|------|-----------------|----------------|
| `v1.0.4` | Normal | Stable appcast steps | No |
| `v2.0.0-alpha` | Normal | Stable appcast steps | No |
| `v1.0.3-test1.1` | Test | Test appcast steps only | Yes |
| `v1.0.5-test2` | Test | Test appcast steps only | Yes |

In GitHub Actions, `github.ref_name` for a tag push is the tag name without the `refs/tags/` prefix (e.g. `v1.0.3-test1.1`). The condition `contains(github.ref_name, '-test')` is true for any tag whose name contains the literal substring `-test`.

---

## Appendix B. Revision history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | (initial) | Full design: requirements, invariants, two feeds, effective channel, implementation phases, testing (§7), workflow reference (§8), glossary (§9). Implementation: Phase A (scripts), Phase B (UpdateManager effective_channel), unit tests in `test_two_appcast_channels.py` and `test_appcast_channels.py`. |

---

## Appendix C. Quick reference – what runs where

| Where | What runs |
|-------|-----------|
| **Local / PR** | Unit tests: `pytest src/tests/unit/update/test_two_appcast_channels.py src/tests/unit/scripts/test_appcast_channels.py src/tests/unit/update/test_update_security.py -v`. Manual: run `generate_appcast.py` / `generate_update_feed.py` with `--channel test` and inspect output path. |
| **CI (on normal tag)** | Release workflow: build artifacts → create published release → fetch stable appcasts → generate stable appcasts → validate → publish stable appcasts + index. Test appcast steps do **not** run. |
| **CI (on test tag)** | Release workflow: build artifacts → create **draft** release → fetch test appcasts → generate test appcasts → validate → publish **only** test appcasts (no index). Stable appcast steps do **not** run. |
| **Installed app (test build)** | Update check: app sends request to `…/updates/{platform}/test/appcast.xml`. Only test releases appear in that feed. |
| **Installed app (stable build)** | Update check: app sends request to `…/updates/{platform}/stable/appcast.xml` (or beta). Only normal releases in that feed. |
| **Website** | JavaScript calls GitHub `releases/latest`; response excludes drafts. Download buttons point to latest **normal** release only. |

---

## Appendix D. Checklist for implementer

Before merging the workflow changes (Phase C), confirm:

1. [ ] Phase A done: `generate_appcast.py` and `generate_update_feed.py` accept `--channel test`; both script tests pass.
2. [ ] Phase B done: `UpdateManager` uses `is_test_version(current_version)` to set effective channel; all tests in `test_two_appcast_channels.py` pass.
3. [ ] New workflow block for test tag has condition `contains(github.ref_name, '-test')` and **never** writes to `updates/*/stable/` or passes `--index`.
4. [ ] Existing appcast steps for stable have condition `!contains(github.ref_name, '-test')` and **never** reference `updates/*/test/`.
5. [ ] Fetch step for test appcasts tolerates missing files on gh-pages (first test release).
6. [ ] Full test run: `pytest src/tests/unit/update/ src/tests/unit/scripts/test_appcast_channels.py -v` passes.

**Document info:** Design doc for two appcast feeds (stable vs test). See §1 for requirements, §4 for implementation steps, §7 for tests. Test releases remain drafts (§1.5); only the test appcast feed is added so test builds can receive in-app updates.

**Related docs:** `docs/features/update-system.md` (user-facing update behaviour); `docs/release/` (release runbooks, gh-pages setup). Release workflow: `.github/workflows/release.yml`.

**Open points (post-merge):** After Phase C is merged, validate with a real test tag push and confirm gh-pages commit contains only `updates/macos/test/` and `updates/windows/test/` changes. Optionally add a CI job that runs the two-appcast unit tests on every push to main.

**See also:** §2.3 (effective_channel formula), §3.2 (tag → workflow), §7.5 (requirements → tests traceability). For rollback, follow §D.4 in order: workflow first, then app, then scripts.

*End of design document. Total sections: 1–10, Appendices A–D, §7 includes test plan and traceability.*

---

Revision: 1.0 (design + Phase A/B + tests). Phase C (workflow) to be implemented separately.
