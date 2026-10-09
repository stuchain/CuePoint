# Release Rollback Plan

When a release is broken (a critical bug, a security issue, or installers that fail), withdraw it and, if needed, ship a fixed one. Windows and macOS builds update themselves, so a bad release reaches installed copies too. Turning the release back into a draft stops that at once. Copies that already installed it keep it until a fixed, higher version is out.

## When to roll back

Roll back when a release has:

- data loss or corruption,
- a crash for more than about 2% of users,
- an installer that does not install or does not start,
- a security vulnerability.

For a live incident, start with the [Incident Response Runbook](incident-response-runbook.md) and come here once you decide to withdraw.

## Rollback steps

### 1. Identify the broken version

- Note the version (for example `1.2.3`) and its GitHub release tag (`v1.2.3`).
- Write down what failed, who is affected and the root cause, if known.

### 2. Withdraw the GitHub release

- Open the release for the broken tag.
- **Turn it back into a draft** (edit the release and choose **Save draft**). The updater reads only published releases, so it stops offering the build at once, on the next check of every installed copy. Marking it as a pre-release is not enough: a test build is still offered pre-releases.
- Add a line at the top of the description: "WITHDRAWN: [brief reason]. Do not use this build."
- Check that the previous good release is marked as the latest.

An update never goes to a lower version (DEC-145), so there is no way to send installed copies back to the previous release. The only way forward is a higher version.

### What an installed copy keeps

- A copy that already installed the bad release keeps running it until the fix is published. The fix reaches it as an ordinary update.
- A copy that has already downloaded the update installs it at the next quit of that run; withdrawing the release does not undo a download that was made. A copy restarted since then has to download it again, and the withdrawn release is no longer offered.
- If the bad release migrated the library database, an older build refuses to open it and says so by name (`DB_SCHEMA_TOO_NEW`). Do not tell people to install the older build. Tell them to wait for the fix, or, to go back, restore the backup CuePoint takes at launch before it migrates (DEC-009) (kept beside the library), and then install the older build by hand.

### 3. Notify users

- Post a notice (release page, GitHub Discussions, or a pinned issue) saying that the version was withdrawn, why, and what to do. For a security issue, publish a GitHub security advisory.
- Give a timeline for the fix if you have one.

### 4. Ship a fix

A version number must go up, so do not reuse the withdrawn tag; the updater would not offer a fix that is not higher. Ship the fix as a new patch release (for example `1.2.4`), made either from a minimal fix or from a revert of the bad change, on top of the last good code. Follow the checklist below.

### 5. After the rollback

- Find the root cause and write it down (the incident template and postmortem are in the [Incident Response Runbook](incident-response-runbook.md)).
- Add a test that would have caught it.
- Say what happened in the next release notes.

## Emergency hotfix checklist

- [ ] Create a hotfix branch from the **last good** release tag, for example `git checkout -b hotfix/1.2.4 v1.2.3`.
- [ ] Make the minimal fix, or revert the bad change, and run the tests.
- [ ] Bump the version in `src/cuepoint/version.py` and set the same value as `version` in `apps/desktop-electron/package.json`.
- [ ] Update `docs/release/CHANGELOG.md` with the fix and the version.
- [ ] Run `python scripts/check_desktop_version_coupling.py` and `python scripts/validate_changelog.py`. Run `python scripts/validate_version.py` after you tag; it fails until the new tag exists.
- [ ] Push the branch, open a pull request from it into `main`, and wait for its green `desktop-electron.yml` run. A push to a `hotfix/*` branch does not start that workflow.
- [ ] Follow [Publish](release-deployment-runbook.md#publish) in the release runbook: tag, check the artifacts and checksums, create the release.
- [ ] Mark the new release as latest, and update the notice you posted in step 3.

## Rollback drill

Run this now and then to check the steps still work.

1. Publish a test build (`X.Y.Z-test.N`) as a GitHub pre-release.
2. Withdraw it as in step 2 and check the release page no longer presents it as current, and that an installed older test build no longer offers it.
3. Publish a "fix" test build and check the release page lists it and that the installed build offers it.
4. Remove both test releases when you are done.

## Prevention

- Run the full test suite and the [pre-release checks](release-deployment-runbook.md#test-before-you-publish) before you tag.
- Install the build on a clean machine before you publish it.
- Watch new issues for 24-48 hours after a release.
- Publish a test build to testers first when a change is risky.

## References

- [Release Deployment Runbook](release-deployment-runbook.md)
- [Incident Response Runbook](incident-response-runbook.md)
- [Key management](key-management.md)
