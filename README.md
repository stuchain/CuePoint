<div align="center">
  <h1>  <p>
    <img src="DOCS/images/logo.png" alt="CuePoint hero" width="28%"/>
  </p></h1>
  <p><strong>Accurate music metadata for Rekordbox libraries, sourced from Beatport.</strong></p>
  <p>
    <a href="DOCS/how-to-run.md">How to run</a>
    •
    <a href=".github/TECHNICAL_ANALYSIS.md">Technical analysis</a>
  </p>
  <p>
    <img alt="platforms" src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-222"/>
    <img alt="license" src="https://img.shields.io/badge/license-Third--Party%20Notices-222"/>
    <img alt="release" src="https://img.shields.io/github/v/release/stuchain/CuePoint?display_name=tag"/>
    <img alt="build" src="https://img.shields.io/badge/build-release%20ready-2ea44f"/>
  </p>

</div>

<hr/>

<table width="100%">
  <tr>
    <td width="33%">
      <h3>Clean metadata</h3>
      <p>Key, BPM, label, genre, release date-kept consistent and reviewable.</p>
    </td>
    <td width="33%">
      <h3>Auditable matches</h3>
      <p>Every query and candidate is logged so decisions are traceable.</p>
    </td>
    <td width="33%">
      <h3>Built for scale</h3>
      <p>Handles large libraries with parallel search and time budgets.</p>
    </td>
  </tr>
</table>

<h2>What is Cuepoint</h2>
<p>
  DJs use an app called Rekordbox to import downloaded songs, sort them into playlists, and export them to
  USBs for performance. To play reliably, each track needs metadata like musical key, label, and release date.
  The official source for this data is Beatport.com. CuePoint takes a Rekordbox XML export of its playlists,
  matches each track to Beatport, and outputs clean metadata you can review or import back into your library.
  It keeps a full audit trail of queries and candidates so you can verify every decision.
</p>

<h2>Context</h2>
<ul>
  <li><strong>Rekordbox</strong>: DJ library software used to organize music, playlists, and performance data.</li>
  <li><strong>Beatport</strong>: Online music store with official release metadata (label, release date, genre, key, BPM).</li>
</ul>
<p>CuePoint bridges Rekordbox (your library) and Beatport (official metadata) so you don’t have to fix this by hand.</p>

<h2>Why it matters</h2>
<p>
  Manual matching is slow and inconsistent. Accurate keys, labels, genres, and release dates matter for sets,
  exports, and library hygiene. Beatport has the official info, but copying it track‑by‑track is a time sink.
</p>

<h2>What’s implemented</h2>
<ul>
  <li><strong>Update manager</strong>: in‑app update checks, download flow, and installer handoff</li>
  <li><strong>Auto‑research</strong>: optional second‑pass search for missed matches</li>
  <li><strong>Config system</strong>: YAML config + CLI overrides for repeatable runs</li>
  <li><strong>Caching</strong>: request caching to speed up repeated runs</li>
  <li><strong>Audit logging</strong>: query and candidate logs for verification</li>
  <li><strong>GUI + CLI</strong>: run via desktop UI or command line</li>
</ul>

<h2>How to run</h2>
<p>See <code>DOCS/how-to-run.md</code> for:</p>
<ul>
  <li>Install from GitHub Releases</li>
  <li>Build locally</li>
  <li>Run the GUI directly</li>
</ul>

<h2>UI</h2>
<p align="center"><em>Main window</em></p>
<p align="center">
  <img src="DOCS/images/ui-main.png" alt="Main window" width="92%"/>
</p>
<p align="center"><em>Match review</em></p>
<p align="center">
  <img src="DOCS/images/ui-review.png" alt="Match review" width="92%"/>
</p>
<p align="center"><em>Playlist detail</em></p>
<p align="center">
  <img src="DOCS/images/ui-playlist.png" alt="Playlist detail" width="92%"/>
</p>
<p align="center"><em>Track candidates</em></p>
<p align="center">
  <img src="DOCS/images/ui-candidates.png" alt="Track candidates" width="92%"/>
</p>
<p align="center"><em>Automatic check for an available update</em></p>
<p align="center">
  <img src="DOCS/images/ui-update1.png" alt="Update" width="92%"/>
</p>
<p align="center"><em>Download update</em></p>
<p align="center">
  <img src="DOCS/images/ui-update2.png" alt="Download Update" width="92%"/>
</p>

<h2>Quick demo</h2>
<p>
  <img src="DOCS/images/gifs/demo.gif" alt="CuePoint demo" width="88%"/>
</p>

<h2>What you get</h2>
<ul>
  <li>Clean metadata: key, BPM, label, genres, release details</li>
  <li>Review workflow: low‑confidence rows flagged for manual pass</li>
  <li>Audit trail: every query and candidate recorded</li>
</ul>

<h2>Before / After</h2>
<p>
</p>
<table width="100%">
  <tr>
    <th align="left">Before (Rekordbox export)</th>
    <th align="left">After (CuePoint)</th>
  </tr>
  <tr>
    <td>Missing key, label, release date, genre</td>
    <td>Key, label, release date, genre filled in</td>
  </tr>
  <tr>
    <td>Manual lookup track‑by‑track</td>
    <td>Batch matching with review flags</td>
  </tr>
  <tr>
    <td>No audit trail</td>
    <td>Queries + candidates logged for verification</td>
  </tr>
</table>

<h2>How it works (short)</h2>
<ol>
  <li>Parse the Rekordbox XML export.</li>
  <li>Generate multiple search queries per track.</li>
  <li>Search Beatport and collect candidates.</li>
  <li>Score candidates and apply guards.</li>
  <li>Write results and review files.</li>
</ol>

<h2>Architecture</h2>

```mermaid
flowchart LR
  RekordboxXML[Rekordbox_XML] --> Parser[Input_Parsing]
  Parser --> QueryGen[Query_Generation]
  QueryGen --> Search[Beatport_Search]
  Search --> Parse[Candidate_Parsing]
  Parse --> Scoring[Scoring_and_Guards]
  Scoring --> Decision[Match_Decision]
  Decision --> MainCSV[Main_CSV]
  Decision --> CandidatesCSV[Candidates_CSV]
  Decision --> QueriesCSV[Queries_CSV]
  Decision --> ReviewCSV[Review_CSV]

  subgraph Search_Strategy
    Direct[Direct_Search]
    DDG[DuckDuckGo]
    Browser[Browser_Automation]
  end
  Search --> Direct
  Search --> DDG
  Search --> Browser
```

<h2>Technical analysis</h2>
<p>
  Deeper technical details, pipeline notes, and constraints live in
  <a href=".github/TECHNICAL_ANALYSIS.md">.github/TECHNICAL_ANALYSIS.md</a>.
</p>

<h2>Inputs</h2>
<ul>
  <li>Rekordbox XML export file</li>
  <li>Playlist name (must match the XML playlist name exactly)</li>
</ul>

<h2>Project layout</h2>
<ul>
  <li><code>SRC/cuepoint</code>: application code</li>
  <li><code>SRC/tests</code>: canonical tests</li>
  <li><code>scripts/</code>: utilities</li>
  <li><code>ARCHIVE/</code>: legacy material</li>
</ul>

<h2>License</h2>
<p>See <code>THIRD_PARTY_LICENSES.txt</code> and repository notices.</p>

<hr/>

<div align="center">
  <h3>Get started</h3>
  <p>
    <a href="https://github.com/stuchain/CuePoint/releases">
      <img alt="releases" src="https://img.shields.io/badge/Download-Releases-2ea44f?style=for-the-badge"/>
    </a>
    <a href="DOCS/how-to-run.md">
      <img alt="how-to-run" src="https://img.shields.io/badge/How%20to%20run-Guide-1f6feb?style=for-the-badge"/>
    </a>
  </p>
</div>
