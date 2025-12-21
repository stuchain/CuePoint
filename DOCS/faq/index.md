# Frequently Asked Questions

## General Questions

### What is CuePoint?

CuePoint is a tool for enriching Rekordbox XML files with Beatport metadata. It helps DJs and music professionals get accurate track information.

### Is CuePoint free?

Yes, CuePoint is free and open source.

### What platforms does CuePoint support?

CuePoint supports:
- macOS 10.15+
- Windows 10+
- Linux (AppImage)

## Usage Questions

### How do I get started?

1. Download and install CuePoint
2. Export XML from Rekordbox
3. Import XML into CuePoint
4. Process tracks to enrich with Beatport data
5. Export results

See [Quick Start Guide](../getting-started/quick-start.md) for details.

### What XML format does CuePoint support?

CuePoint supports the standard Rekordbox XML format exported from Rekordbox.

### Can I process multiple XML files?

Yes, but you need to import them one at a time. Process all tracks together.

### How accurate are the matches?

Match accuracy depends on:
- Track name accuracy in XML
- Availability on Beatport
- Remix/variant naming

Generally, scores above 80% are reliable.

## Technical Questions

### How does matching work?

CuePoint uses fuzzy string matching to compare track titles and artists from your XML with Beatport data. It handles remixes, variations, and common naming differences.

### Can I customize the matching algorithm?

Not currently, but this is a potential future feature. See [Feature Requests](https://github.com/stuchain/CuePoint/issues?q=is%3Aissue+label%3Aenhancement).

### What data is retrieved from Beatport?

CuePoint retrieves:
- Artist names
- Track titles
- Release information
- BPM
- Key
- Genre
- Label

### Is my data sent to Beatport?

No, CuePoint only reads public data from Beatport. Your XML data is not sent anywhere.

## Support Questions

### How do I report a bug?

Use the [Bug Report template](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml) on GitHub.

### How do I request a feature?

Use the [Feature Request template](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml) on GitHub.

### Where can I get help?

- [GitHub Issues](https://github.com/stuchain/CuePoint/issues) for bugs
- [GitHub Discussions](https://github.com/stuchain/CuePoint/discussions) for questions
- [Troubleshooting Guide](../user-guide/troubleshooting.md) for common issues

### Can I contribute?

Yes! See [Contributing Guide](https://github.com/stuchain/CuePoint/blob/main/CONTRIBUTING.md) for details.

