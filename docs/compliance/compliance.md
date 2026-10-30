# Compliance: privacy, licences and accessibility

What CuePoint does to meet privacy law, third-party licences and accessibility expectations, and how each is checked.

## Privacy Compliance

### Overview

This document outlines the privacy compliance process for CuePoint, ensuring compliance with GDPR, CCPA, and other privacy regulations.

### GDPR Compliance

#### Requirements

1. **Privacy Policy**
   - Clear and accessible privacy policy
   - Explains data collection and use
   - Documents user rights
   - Available in-app and online

2. **User Consent**
   - Obtain consent before data collection
   - Clear consent mechanism
   - Easy to withdraw consent
   - Document consent

3. **Data Protection**
   - Protect user data
   - Encrypt sensitive data
   - Secure data storage
   - Limit data collection

4. **User Rights**
   - Right to access data
   - Right to delete data
   - Right to data portability
   - Right to object to processing

5. **Data Processing Documentation**
   - Document data processing activities
   - Record data processing purposes
   - Maintain processing records
   - Regular reviews

#### Compliance Checklist

- [ ] Privacy policy is clear and accessible
- [ ] User consent is obtained
- [ ] User data is protected
- [ ] User can access their data
- [ ] User can delete their data
- [ ] Data processing is documented
- [ ] Privacy policy is up-to-date
- [ ] Consent mechanism works
- [ ] Data handling is compliant
- [ ] Privacy compliance is verified

### CCPA Compliance

#### Requirements

1. **Privacy Notice**
   - Provide privacy notice
   - Explain data collection
   - Document user rights
   - Update regularly

2. **User Rights**
   - Right to know
   - Right to delete
   - Right to opt-out
   - Right to non-discrimination

3. **Data Protection**
   - Protect user data
   - Secure data storage
   - Limit data collection
   - No data sale

4. **Opt-Out Mechanism**
   - Easy opt-out process
   - Clear opt-out instructions
   - Honor opt-out requests
   - Document opt-outs

#### Compliance Checklist

- [ ] Privacy notice is provided
- [ ] User rights are explained
- [ ] User can opt-out
- [ ] Data is not sold
- [ ] Data is protected
- [ ] Privacy notice is up-to-date
- [ ] Opt-out mechanism works
- [ ] Data handling is compliant
- [ ] Privacy compliance is verified

### Privacy Audit Process

#### Quarterly Audits

1. **Review Privacy Policy**
   - Check for accuracy
   - Verify completeness
   - Update if needed
   - Publish updates

2. **Verify Consent Mechanism**
   - Test consent flow
   - Verify consent storage
   - Check withdrawal process
   - Document findings

3. **Check Data Handling**
   - Review data collection
   - Verify data protection
   - Check data retention
   - Document practices

4. **Verify Compliance**
   - Check GDPR compliance
   - Check CCPA compliance
   - Review user rights
   - Document compliance

#### Annual Audits

1. **Comprehensive Review**
   - Full privacy policy review
   - Complete data handling review
   - User rights verification
   - Compliance assessment

2. **Update Documentation**
   - Update privacy policy
   - Update privacy notices
   - Update compliance documentation
   - Publish updates

3. **Compliance Report**
   - Document compliance status
   - Identify issues
   - Recommend improvements
   - Plan remediation

### Privacy Policy

#### Location

- **In-App**: Privacy dialog accessible from Help menu
- **Online**: PRIVACY_NOTICE.md in repository
- **Documentation**: docs/policy/privacy-notice.md

#### Content

Privacy policy includes:
- Data collection practices
- Data use practices
- Data sharing practices
- User rights
- Contact information
- Update date

#### Updates

- Review quarterly
- Update as needed
- Notify users of significant changes
- Maintain version history

### User Consent

#### Consent Mechanism

1. **Onboarding**
   - Privacy dialog on first launch
   - Clear consent request
   - Easy to understand
   - Easy to accept/decline

2. **Settings**
   - Privacy settings in preferences
   - Consent management
   - Withdrawal option
   - Clear instructions

3. **Documentation**
   - Document consent
   - Store consent preferences
   - Track consent changes
   - Maintain records

#### Consent Withdrawal

- Easy withdrawal process
- Immediate effect
- Clear confirmation
- Document withdrawal

### Data Protection

#### Data Security

- Encrypt sensitive data
- Secure data storage
- Limit data access
- Regular security audits

#### Data Minimization

- Collect only necessary data
- Limit data retention
- Delete unused data
- Regular data cleanup

#### Data Access

- Limit data access
- Audit data access
- Document access
- Regular reviews

### User Rights

#### Right to Access

- Provide data access
- Clear access process
- Timely response
- Document access

#### Right to Delete

- Provide deletion option
- Clear deletion process
- Confirm deletion
- Document deletion

#### Right to Data Portability

- Provide data export
- Standard format (JSON, CSV)
- Complete data export
- Timely response

#### Right to Object

- Provide objection mechanism
- Honor objections
- Document objections
- Regular review

### Compliance Monitoring

#### Regular Monitoring

- Weekly privacy checks
- Monthly compliance review
- Quarterly audits
- Annual comprehensive review

#### Compliance Metrics

- Privacy policy updates
- Consent rate
- User rights requests
- Compliance issues
- Resolution time

### Related Documents

- [License Compliance](compliance.md)
- [Accessibility Compliance](compliance.md)
- [Privacy Notice](../../PRIVACY_NOTICE.md)
- [Security Response Process](../security/security.md)

### Last Updated

2025-01-XX

## License Compliance

### Overview

CuePoint’s own source code is licensed under the **Apache License, Version 2.0** (`LICENSE` at the repository root). Dependencies and bundled libraries must use terms **compatible** with that license.

This document outlines the license compliance process for CuePoint, ensuring all third-party dependencies are properly licensed and documented.

### Bundled binary components

The tooling below (`analyze_licenses.py`, `validate_licenses.py`, `generate_licenses.py`) reads
**pip metadata**, so it sees Python dependencies and nothing else. CuePoint also ships binaries it
did not build, which no Python tool can see. Those are covered by
`python scripts/check_bundled_licenses.py`, which runs in the `license-compliance` and
`desktop-electron` workflows.

| Component | Licence | How it is used | Where it is recorded |
| --- | --- | --- | --- |
| mpv (player sidecar) | **GPL-2.0-or-later** | Unmodified binary, run as a separate child process, controlled over mpv's own JSON IPC protocol | `third_party/mpv/NOTICE.md`, `scripts/player_sidecar_manifest.json`, ADR-004 |
| Pixelify Sans (the app font) | **OFL-1.1** | Font files bundled into the renderer build from the npm package `@fontsource/pixelify-sans`; weights 400, 600 and 700 only; nothing is fetched at run time | `apps/desktop-electron/renderer/package.json`, DEC-232 |
| Inter (the UI and data face) | **OFL-1.1** (Rasmus Andersson) | Font files bundled into the renderer build from the npm package `@fontsource/inter`; weights 400, 500, 600 and 700, latin and latin-ext subsets; nothing is fetched at run time | `apps/desktop-electron/renderer/package.json`, `renderer/src/tokens/fonts.css` |

**On the copyleft check below.** "Check for copyleft licenses (GPL, AGPL)" does not mean copyleft
is forbidden; it means it requires a deliberate decision recorded somewhere a future reader will
find. mpv is that case, decided in DEC-005/DEC-049 and analysed in
`docs/ui-overhaul/adr/004-player-backend.md`. It is compatible with CuePoint's Apache-2.0 licence
because mpv is **aggregated, not incorporated**: it is a separate program in a separate process,
communicating over a published IPC interface, with no linking in either direction. Distributing it
obliges CuePoint to ship its licence texts and to identify the corresponding source, both of which
are automated and gated.

The line that must not be crossed without a new decision is **linking**. Loading libmpv into
CuePoint's own process — a native addon, or a wrapper we build — changes the analysis entirely and
was rejected for this reason among others.

### Compliance Process

#### Regular Audits

1. **Weekly Audits**
   - Run license validation script: `python scripts/validate_licenses.py`
   - Review license changes
   - Update license file if needed
   - Document any issues

2. **Monthly Audits**
   - Comprehensive license review
   - Verify all licenses are documented
   - Check for license compatibility
   - Update THIRD_PARTY_LICENSES.txt

3. **Quarterly Audits**
   - Full license audit
   - Review license compatibility
   - Update compliance documentation
   - Report compliance status

#### New Dependencies

When adding a new dependency:

1. **Check License Before Adding**
   - Review dependency license
   - Verify license compatibility
   - Check license restrictions
   - Document license

2. **Verify License Compatibility**
   - Ensure license is compatible with project license
   - Check for copyleft licenses (GPL, AGPL) — permitted only for a *separate process* bundled
     as a binary, with an ADR recording the analysis (see "Bundled binary components"); never for
     anything linked into CuePoint's own process
   - Verify commercial use is allowed
   - Confirm redistribution is allowed

3. **Document License**
   - Add to requirements file
   - Run license validation
   - Update license file
   - Document in changelog

#### License Updates

When dependencies are updated:

1. **Monitor License Changes**
   - Check for license changes in updates
   - Review changelog for license updates
   - Verify compatibility still holds
   - Update documentation if needed

2. **Update License File**
   - Regenerate license file: `python scripts/generate_licenses.py`
   - Review generated file
   - Update THIRD_PARTY_LICENSES.txt
   - Commit changes

### License Validation

#### Automated Validation

License validation is automated via:

1. **CI/CD Pipeline**
   - Runs on every PR
   - Validates all dependencies
   - Fails build on unknown licenses
   - Generates compliance report

2. **Validation Script**
   ```bash
   python scripts/validate_licenses.py --requirements requirements-build.txt
   ```

3. **Compliance Check**
   ```bash
   python scripts/validate_compliance.py
   ```

#### Manual Validation

For manual validation:

1. **Run Validation Script**
   ```bash
   python scripts/validate_licenses.py
   ```

2. **Review Output**
   - Check for unknown licenses
   - Verify license compatibility
   - Review license restrictions

3. **Generate License File**
   ```bash
   python scripts/generate_licenses.py --output THIRD_PARTY_LICENSES.txt
   ```

### Compliance Checklist

#### Pre-Release Checklist

- [ ] All licenses are documented
- [ ] License file is up-to-date
- [ ] License compatibility verified
- [ ] License validation passes
- [ ] THIRD_PARTY_LICENSES.txt is current
- [ ] No unknown licenses
- [ ] No incompatible licenses

#### Ongoing Compliance

- [ ] Weekly license validation runs
- [ ] Monthly comprehensive review
- [ ] Quarterly full audit
- [ ] License file updated regularly
- [ ] Compliance issues tracked
- [ ] Compliance reports generated

### License Types

#### Permissive Licenses (Allowed)

- MIT
- Apache 2.0
- BSD (2-Clause, 3-Clause)
- ISC
- Python Software Foundation License

#### Copyleft Licenses (Require Review)

- GPL (v2, v3)
- AGPL (v3)
- LGPL (v2, v3)
- MPL (v2)

**Note**: Copyleft licenses require careful review to ensure compliance.

#### Prohibited Licenses

- No commercial use licenses
- No redistribution licenses
- Proprietary licenses (unless explicitly approved)

### License File

#### THIRD_PARTY_LICENSES.txt

The license file contains:
- All third-party dependencies
- License information for each dependency
- License text (where applicable)
- Version information

#### Generating License File

```bash
python scripts/generate_licenses.py --output THIRD_PARTY_LICENSES.txt
```

#### Updating License File

1. Run generation script
2. Review generated file
3. Commit to repository
4. Include in releases

### Compliance Reporting

#### Weekly Reports

- License validation results
- New dependencies added
- License changes detected
- Compliance status

#### Monthly Reports

- Comprehensive license audit
- Compliance metrics
- Issues and resolutions
- Recommendations

#### Quarterly Reports

- Full compliance review
- License compatibility analysis
- Compliance trends
- Strategic recommendations

### Related Documents

- [Privacy Compliance](compliance.md)
- [Accessibility Compliance](compliance.md)
- [Security Response Process](../security/security.md)

### Last Updated

2025-01-XX

## Accessibility Compliance

### Overview

This document outlines the accessibility compliance process for CuePoint, ensuring compliance with WCAG 2.1 AA standards and accessibility best practices.

### WCAG 2.1 AA Compliance

#### Requirements

1. **Keyboard Navigation**
   - All functionality accessible via keyboard
   - Logical tab order
   - Keyboard shortcuts
   - Focus indicators

2. **Screen Reader Support**
   - Proper ARIA labels
   - Semantic HTML
   - Alt text for images
   - Descriptive text

3. **Visual Accessibility**
   - Sufficient color contrast
   - Text scaling support
   - High contrast mode
   - Clear focus indicators

4. **Error Handling**
   - Accessible error messages
   - Clear error descriptions
   - Error prevention
   - Error recovery

5. **Forms**
   - Accessible form labels
   - Error messages
   - Required field indicators
   - Form validation

#### Compliance Checklist

- [ ] Keyboard navigation works
- [ ] Screen reader support works
- [ ] Contrast ratios meet requirements
- [ ] Focus indicators are visible
- [ ] Error messages are accessible
- [ ] Forms are accessible
- [ ] Text scaling works
- [ ] High contrast mode works
- [ ] Accessibility testing is performed
- [ ] WCAG compliance is verified
- [ ] Accessibility issues are fixed
- [ ] Accessibility compliance is maintained

### Accessibility Testing

#### Automated Testing

1. **Accessibility Scanners**
   - Use accessibility testing tools
   - Run automated scans
   - Review scan results
   - Fix identified issues

2. **CI/CD Integration**
   - Run accessibility tests in CI
   - Fail build on critical issues
   - Generate accessibility reports
   - Track accessibility metrics

#### Manual Testing

1. **Keyboard Testing**
   - Test all functionality with keyboard
   - Verify tab order
   - Check keyboard shortcuts
   - Test focus management

2. **Screen Reader Testing**
   - Test with screen readers (NVDA, JAWS, VoiceOver)
   - Verify ARIA labels
   - Check semantic structure
   - Test navigation

3. **Visual Testing**
   - Test color contrast
   - Test text scaling
   - Test high contrast mode
   - Verify focus indicators

### Accessibility Audit Process

#### Quarterly Audits

1. **Comprehensive Testing**
   - Run automated tests
   - Perform manual testing
   - Review accessibility issues
   - Document findings

2. **Issue Resolution**
   - Prioritize issues
   - Fix critical issues
   - Fix high-priority issues
   - Document fixes

3. **Compliance Verification**
   - Verify WCAG compliance
   - Test accessibility improvements
   - Document compliance status
   - Update compliance reports

#### Annual Audits

1. **Full Accessibility Review**
   - Comprehensive testing
   - User testing with assistive technologies
   - Compliance assessment
   - Strategic planning

2. **Compliance Report**
   - Document compliance status
   - Identify issues
   - Recommend improvements
   - Plan remediation

### Accessibility Features

#### Keyboard Navigation

- All UI elements accessible via keyboard
- Logical tab order
- Keyboard shortcuts for common actions
- Clear focus indicators

#### Screen Reader Support

- Proper ARIA labels
- Semantic HTML structure
- Descriptive text for images
- Clear navigation structure

#### Visual Accessibility

- Sufficient color contrast (4.5:1 for text)
- Text scaling support (up to 200%)
- High contrast mode support
- Clear focus indicators

#### Error Handling

- Accessible error messages
- Clear error descriptions
- Error prevention where possible
- Error recovery options

### Accessibility Improvements

#### Ongoing Improvements

- Regular accessibility reviews
- User feedback integration
- Accessibility testing
- Continuous improvement

#### Priority Areas

1. **Critical Issues**
   - Blocking accessibility
   - Immediate fix required
   - High impact

2. **High Priority**
   - Significant accessibility barriers
   - Fix within 1 month
   - Medium-high impact

3. **Medium Priority**
   - Minor accessibility barriers
   - Fix within 3 months
   - Medium impact

4. **Low Priority**
   - Nice-to-have improvements
   - Fix as time permits
   - Low impact

### Compliance Monitoring

#### Regular Monitoring

- Weekly accessibility checks
- Monthly compliance review
- Quarterly audits
- Annual comprehensive review

#### Compliance Metrics

- WCAG compliance score
- Accessibility issues
- Resolution time
- User feedback
- Testing coverage

### Related Documents

- [License Compliance](compliance.md)
- [Privacy Compliance](compliance.md)
- [Security Response Process](../security/security.md)

### Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Last Updated

2025-01-XX
