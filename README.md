# 🎧 CuePoint — Rekordbox → Beatport Metadata Enricher

## 🪩 What It Does

As DJs, we organize our music libraries using an app called **Rekordbox**.  
Each track in Rekordbox has metadata, things like **BPM**, **musical key**, **release date**, and **label**, which help us prepare and mix our sets.

However, much of that metadata is often **missing or inaccurate**.  
Until now, DJs had to manually look up every track on **[Beatport](https://www.beatport.com)**, the main online store and database for electronic music, and copy the information by hand.

That process is extremely slow and repetitive.  
So I built **CuePoint**, a tool that does it automatically.

CuePoint takes your **Rekordbox XML playlist**, searches Beatport intelligently for each track, and enriches your collection with accurate metadata, all in one run.  
It currently includes the **backend logic** and **CLI**, with a front-end interface planned soon.

---

## 🚀 Features

- 🔍 Smart Beatport search (title + artist + remix detection)  
- 🧠 Fuzzy scoring with remix/original awareness  
- 💾 Outputs clean CSVs with all matched metadata  
- 🪶 Deterministic and reproducible results (no randomness)  
- 📜 Logs every query and candidate for full transparency  
- ⚙️ CLI-based, portable, pure Python (no external services)  

---

## 🧩 Input & Output

**Input:**  
Rekordbox `.xml` file (collection + playlists)

**Output files:**

| File | Description |
|------|--------------|
| `out_main.csv` | Final chosen matches (one per track) |
| `out_candidates.csv` | All possible Beatport results with similarity scores |
| `out_queries.csv` | All search queries and timings |
| `out_review.csv` | Tracks flagged for manual review |
