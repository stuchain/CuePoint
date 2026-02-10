 # Step 6: Performance and Scalability Design
 
 ## Purpose
 Maintain responsiveness and predictable performance for large libraries.
 
 ## Current State
 - Parallel search and caching are implemented.
 - No formal performance budgets or benchmarks.
 
 ## Proposed Implementation
 
 ### 6.1 Performance Budgets
 - Startup < 2s (modern machine).
 - Per-track processing time capped with fallback behavior.
 - UI updates throttled to avoid stutters.
 
 ### 6.2 Benchmarking
 - Add benchmark harness for 1k, 5k, and 10k tracks.
 - Measure CPU, memory, and time per stage.
 
 ### 6.3 Adaptive Concurrency
 - Scale worker counts based on CPU and network.
 - Add config limits for low-end systems.
 
 ## Code Touchpoints
 - `src/cuepoint/core/matcher.py`
 - `src/cuepoint/services/processor_service.py`
 - `src/cuepoint/core/query_generator.py`
 
 ## Example Metrics Capture
 ```python
 perf.start("candidate_search")
 # search work
 perf.end("candidate_search")
 ```
 
 ## Testing Plan
 - Run benchmark suite on each release candidate.
 - Add regression alerts if performance drops beyond thresholds.
 
 ## Acceptance Criteria
 - Benchmarks are repeatable and tracked.
 - Large runs remain responsive and stable.
 
 ---
 
 ## 6.4 Performance Principles
 
 - Avoid UI thread blocking.
 - Cap per-track processing time.
 - Prefer incremental rendering.
 
 ## 6.5 Benchmark Suite
 
 - Small (1k), medium (5k), large (10k).
 - Track CPU, memory, time per stage.
 
 ## 6.6 Performance Budgets
 
 - Startup < 2s.
 - 10k tracks < 30 minutes.
 - UI updates < 200ms.
 
 ## 6.7 Scalability Controls
 
 - Concurrency settings.
 - Time budget per track.
 - Cache size limits.
 
 ## 6.8 Performance Tests
 
 - Run benchmarks on release candidate.
 - Fail if regression > 20%.
 
 ## 6.9 Performance Architecture
 
 - Separate UI thread from worker threads.
 - Use bounded queues for work items.
 - Track time per pipeline stage.
 
 ## 6.10 Performance Budgets (Expanded)
 
 - Startup to ready < 2s.
 - XML parse (10k tracks) < 5s.
 - Query generation (10k tracks) < 3s.
 - Candidate search (10k tracks) < 20m.
 - Export (10k tracks) < 1m.
 
 ## 6.11 Latency vs Throughput
 
 - Prefer throughput for large batches.
 - Maintain responsive UI for UX.
 
 ## 6.12 Performance Metrics (Core)
 
 - Startup time.
 - Time per track.
 - Cache hit rate.
 - Search success rate.
 
 ## 6.13 Performance Metrics (Extended)
 
 - CPU usage peak.
 - Memory peak.
 - Disk IO rate.
 
 ## 6.14 Benchmark Harness Design
 
 - CLI command: `scripts/bench.py`.
 - Output JSON results.
 - Store results per release.
 
 ## 6.15 Benchmark Output Schema
 
 ```json
 {
   "version": "1.2.3",
   "tracks": 10000,
   "duration_sec": 1800,
   "memory_mb_peak": 900
 }
 ```
 
 ## 6.16 Benchmark Environment
 
 - Run on fixed CI runners.
 - Keep hardware consistent.
 - Avoid noisy workloads.
 
 ## 6.17 Benchmark Variants
 
 - Cold cache.
 - Warm cache.
 - Offline mode.
 
 ## 6.18 Performance Regression Criteria
 
 - Runtime regression > 20% fails.
 - Memory regression > 30% warns.
 
 ## 6.19 Performance Profiling
 
 - Use `cProfile` for Python.
 - Capture hot path stack traces.
 
 ## 6.20 Profiling Output
 
 - Store top 20 slowest functions.
 - Track changes over time.
 
 ## 6.21 Concurrency Model
 
 - Thread pool for network IO.
 - Queue size capped to avoid memory spikes.
 
 ## 6.22 Concurrency Auto-Tuning
 
 - Detect CPU cores.
 - Default worker count = min(8, cores * 2).
 - Cap worker count for low-end systems.
 
 ## 6.23 Concurrency Config
 
 - `max_workers`
 - `max_queue_size`
 
 ## 6.24 Concurrency Testing
 
 - Run with 1, 4, 8 workers.
 - Ensure outputs identical.
 
 ## 6.25 UI Responsiveness
 
 - Throttle progress updates to 5/sec.
 - Use batch updates for result table.
 
 ## 6.26 UI Update Strategy
 
 - Append rows in batches.
 - Defer expensive sorting until end.
 
 ## 6.27 Memory Management
 
 - Avoid storing full candidate HTML.
 - Stream results where possible.
 
 ## 6.28 Cache Strategy
 
 - LRU cache for recent queries.
 - TTL based expiration.
 
 ## 6.29 Cache Size Limits
 
 - Default 500MB max.
 - Configurable via settings.
 
 ## 6.30 Disk IO Optimization
 
 - Buffered writes for CSV.
 - Avoid frequent fsync unless necessary.
 
 ## 6.31 Output Writer Optimization
 
 - Use batched writes.
 - Precompute row strings.
 
 ## 6.32 Search Optimization
 
 - Limit duplicate queries.
 - Deduplicate candidate results.
 
 ## 6.33 Query Generation Limits
 
 - Max queries per track (e.g., 6).
 - Stop when high-confidence match found.
 
 ## 6.34 Early Exit Strategy
 
 - Stop candidate search when score > threshold.
 
 ## 6.35 Performance Guardrails
 
 - Abort run if per-track time exceeds 5x budget.
 - Warn user if expected runtime exceeds 2 hours.
 
 ## 6.36 ETA Calculation
 
 - ETA based on average time per track.
 - Update every 10 seconds.
 
 ## 6.37 ETA Display
 
 - Show in status bar.
 - Show "Estimating..." during warmup.
 
 ## 6.38 Performance UX Copy
 
 - "Estimating runtime..."
 - "Large library detected, this may take a while."
 
 ## 6.39 Performance Tests (Expanded)
 
 - Benchmark small/medium/large inputs.
 - Validate memory caps.
 - Validate UI responsiveness.
 
 ## 6.40 Performance Test Fixtures
 
 - `fixtures/small.xml`
 - `fixtures/medium.xml`
 - `fixtures/large.xml`
 
 ## 6.41 Performance Counters
 
 - `tracks_processed`
 - `candidates_processed`
 - `queries_generated`
 
 ## 6.42 Performance Logging
 
 - Log time per stage.
 - Log memory peak per run.
 
 ## 6.43 Performance Error Codes
 
 - P001: Budget exceeded.
 - P002: Memory cap exceeded.
 
 ## 6.44 Performance Alerts
 
 - Alert if memory > 2GB.
 - Alert if runtime > 2 hours.
 
 ## 6.45 Performance Config Defaults
 
 ```yaml
 performance:
   max_workers: 8
   max_queries_per_track: 6
   cache_max_mb: 500
 ```
 
 ## 6.46 Performance Config Validation
 
 - Ensure `max_workers >= 1`.
 - Ensure `cache_max_mb >= 100`.
 - Ensure `max_queries_per_track` is reasonable.
 
 ## 6.47 Performance Implementation Plan
 
 - Add performance collector.
 - Add benchmark script.
 - Add regression thresholds.
 
 ## 6.48 Performance Collector Design
 
 - Start/stop timers per stage.
 - Store metrics in memory.
 - Export to JSON at end.
 
 ## 6.49 Performance Collector Example
 
 ```python
 perf.start("query_generation")
 # work...
 perf.end("query_generation")
 ```
 
 ## 6.50 Performance Stage Map
 
 - `parse_xml`
 - `generate_queries`
 - `search_candidates`
 - `score_candidates`
 - `write_outputs`
 
 ## 6.51 Performance Target Table
 
 | Stage | Target |
 | --- | --- |
 | parse_xml | < 5s |
 | generate_queries | < 3s |
 | search_candidates | < 20m |
 | write_outputs | < 60s |
 
 ## 6.52 Performance Regression Tests
 
 - Compare benchmark results to baseline.
 - Fail if regression > threshold.
 
 ## 6.53 Performance Baseline Storage
 
 - Store baseline in `scripts/benchmarks/baseline.json`.
 - Update with approval.
 
 ## 6.54 Performance Baseline Update Policy
 
 - Only update on intentional performance changes.
 - Require changelog note.
 
 ## 6.55 Performance Risk Register
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Search slowdown | High | Medium | Cache + query limits |
 | Memory blowup | High | Low | Limits + streaming |
 | UI stutter | Medium | Medium | throttling |
 
 ## 6.56 Performance Edge Cases
 
 - Huge XML with 50k tracks.
 - Track titles with long strings.
 - Very slow network.
 
 ## 6.57 Performance UX Controls
 
 - Allow user to lower concurrency.
 - Allow user to pause run.
 
 ## 6.58 Performance UX Warnings
 
 - Warn if estimated time > 60m.
 - Warn if memory > 1.5GB.
 
 ## 6.59 Performance Monitoring (Runtime)
 
 - Record memory peaks.
 - Record CPU usage periodically.
 
 ## 6.60 Performance Monitoring Example
 
 ```python
 perf.record("memory_mb", memory_usage())
 ```
 
 ## 6.61 Performance Data Retention
 
 - Keep last 5 benchmark runs.
 - Purge older runs.
 
 ## 6.62 Performance Test Matrix
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Benchmark 1k | CI | P1 |
 | Benchmark 10k | Manual | P2 |
 
 ## 6.63 Performance CLI Flags (Proposed)
 
 - `--max-workers`
 - `--max-queries-per-track`
 - `--benchmark`
 
 ## 6.64 Performance Logging Example
 
 ```
 [perf] stage=parse_xml duration_ms=1200
 [perf] stage=search_candidates duration_ms=900000
 ```
 
 ## 6.65 Performance Data Export
 
 - Export JSON with stage timings.
 - Attach to support bundle.
 
 ## 6.66 Performance in Offline Mode
 
 - Use cache only.
 - Skip network calls.
 
 ## 6.67 Performance Determinism
 
 - Same input should have similar runtime.
 - Allow variance < 10%.
 
 ## 6.68 Performance Incident Response
 
 - If regression detected, block release.
 - Profile and fix.
 
 ## 6.69 Performance Ownership
 
 - Assign owner for benchmarking.
 - Assign owner for regression triage.
 
 ## 6.70 Performance Summary
 
 - Performance is managed with budgets, benchmarks, and guardrails.
 
 ## 6.71 Performance Architecture (Expanded)
 
 - Stage timers in `processor_service`.
 - Batch processing for UI updates.
 - Dedicated metrics collector for each run.
 
 ## 6.72 Performance Collector Schema
 
 ```json
 {
   "run_id": "abc123",
   "stages": {
     "parse_xml": 1200,
     "search_candidates": 900000
   },
   "memory_mb_peak": 950
 }
 ```
 
 ## 6.73 Performance Collector Retention
 
 - Keep last 10 runs.
 - Purge older runs at startup.
 
 ## 6.74 Performance Collector Integration
 
 - Add collector to processor service.
 - Emit metrics on completion.
 
 ## 6.75 Performance UI Panels
 
 - Optional "Performance" tab in diagnostics.
 - Show recent run metrics.
 
 ## 6.76 Performance Budget Enforcement
 
 - Hard stop if per-track time exceeds cap.
 - Soft warn if runtime exceeds estimate.
 
 ## 6.77 Performance Estimation Model
 
 - Track average time per track.
 - Update ETA every 50 tracks.
 
 ## 6.78 Performance ETA Algorithm (Pseudocode)
 
 ```python
 eta = avg_time_per_track * remaining_tracks
 ```
 
 ## 6.79 Performance Staging Pipeline
 
 - Stage 1: Parse XML.
 - Stage 2: Generate queries.
 - Stage 3: Search candidates.
 - Stage 4: Score + guard.
 - Stage 5: Output write.
 
 ## 6.80 Performance Stage Metrics
 
 - `stage_duration_ms`
 - `items_processed`
 - `errors`
 
 ## 6.81 Performance Hot Path Detection
 
 - Identify top 10 slowest functions.
 - Save report for profiling.
 
 ## 6.82 Performance Hot Path Example
 
 ```
 search_candidates: 68%
 score_candidates: 18%
 write_outputs: 8%
 ```
 
 ## 6.83 Performance Guardrails (Extended)
 
 - Max candidates per track.
 - Max queries per track.
 - Max total runtime.
 
 ## 6.84 Performance Guardrails (Defaults)
 
 - Candidates per track: 30.
 - Queries per track: 6.
 - Runtime max: 2 hours.
 
 ## 6.85 Performance Cache Metrics
 
 - Cache hit rate.
 - Cache miss rate.
 - Cache eviction count.
 
 ## 6.86 Performance Cache Tests
 
 - Warm cache reduces runtime.
 - Eviction happens at size limit.
 
 ## 6.87 Performance Memory Strategy
 
 - Stream candidates.
 - Avoid storing full HTML.
 - Avoid storing duplicate strings.
 
 ## 6.88 Performance Memory Tests
 
 - Large run memory < 2GB.
 
 ## 6.89 Performance Disk IO Strategy
 
 - Write output in batches.
 - Avoid frequent flushes.
 
 ## 6.90 Performance Disk IO Tests
 
 - 10k rows write < 2s.
 
 ## 6.91 Performance Query Strategy
 
 - Reduce redundant queries.
 - Cache query results.
 
 ## 6.92 Performance Query Strategy Tests
 
 - Duplicate queries not executed twice.
 
 ## 6.93 Performance Network Strategy
 
 - Rate limit outgoing requests.
 - Use concurrency caps.
 
 ## 6.94 Performance Network Tests
 
 - Requests per second within limit.
 
 ## 6.95 Performance Load Testing
 
 - Simulate 50k tracks.
 - Measure peak memory and runtime.
 
 ## 6.96 Performance Load Test Expectations
 
 - 50k tracks under 3 hours.
 - Memory under 3GB.
 
 ## 6.97 Performance Stress Scenarios
 
 - Slow network (200ms latency).
 - High packet loss.
 - Very large playlists.
 
 ## 6.98 Performance Mitigations
 
 - Reduce concurrency when latency high.
 - Increase cache usage when offline.
 
 ## 6.99 Performance Resource Limits
 
 - Max open file handles.
 - Max threads.
 
 ## 6.100 Performance Resource Limits Tests
 
 - Ensure file handles closed.
 - Ensure no thread leaks.
 
 ## 6.101 Performance Algorithmic Complexity
 
 - Query generation should be O(n).
 - Matching should be O(n log n) at worst.
 
 ## 6.102 Performance Algorithmic Tests
 
 - Ensure runtime scales linearly for query generation.
 
 ## 6.103 Performance Sampling Strategy
 
 - Sample every 100 tracks for ETA.
 
 ## 6.104 Performance Sampling Tests
 
 - ETA updates without UI stutter.
 
 ## 6.105 Performance UI Rendering
 
 - Virtualized table for results.
 - Avoid full table redraws.
 
 ## 6.106 Performance UI Rendering Tests
 
 - Scroll performance under 1k rows.
 - Scroll performance under 10k rows.
 
 ## 6.107 Performance Batch Size
 
 - Batch UI updates in chunks of 50.
 
 ## 6.108 Performance Batch Size Tests
 
 - Batching reduces UI stutter.
 
 ## 6.109 Performance Summary Output
 
 - Include stage timings.
 - Include memory peak.
 
 ## 6.110 Performance Summary Example
 
 ```
 parse_xml=1.2s
 search_candidates=900s
 write_outputs=30s
 memory_peak=950MB
 ```
 
 ## 6.111 Performance Benchmark Report
 
 - Compare against baseline.
 - Flag regressions.
 
 ## 6.112 Performance Benchmark Storage
 
 - Store in `scripts/benchmarks/` directory.
 
 ## 6.113 Performance Benchmark Comparison
 
 - `baseline.json` vs `current.json`.
 
 ## 6.114 Performance Benchmark Comparison Script
 
 ```python
 def compare(baseline, current):
     return (current - baseline) / baseline
 ```
 
 ## 6.115 Performance Regression Gate
 
 - Fail CI if regression > 20%.
 
 ## 6.116 Performance Regression Exceptions
 
 - Allow override with approval.
 
 ## 6.117 Performance Data Visualization
 
 - Plot runtime over releases.
 - Plot memory over releases.
 
 ## 6.118 Performance Visualization Tools
 
 - Simple CSV + chart in docs.
 
 ## 6.119 Performance Tuning Checklist
 
 - [ ] Reduce duplicate queries.
 - [ ] Increase cache hits.
 - [ ] Optimize matching loops.
 
 ## 6.120 Performance Tuning Log
 
 - Record tuning changes.
 - Record observed improvements.
 
 ## 6.121 Performance Evaluation Checklist
 
 - [ ] Benchmarks run.
 - [ ] Regression check passed.
 - [ ] Memory within budget.
 
 ## 6.122 Performance Failure Modes
 
 - Runtime exceeds budget.
 - Memory exceeds budget.
 - UI becomes unresponsive.
 
 ## 6.123 Performance Failure Handling
 
 - Pause run if UI unresponsive.
 - Suggest lower concurrency.
 
 ## 6.124 Performance Safe Defaults
 
 - Conservative concurrency.
 - Cache enabled.
 
 ## 6.125 Performance Safe Defaults Tests
 
 - Validate defaults on low-end system.
 
 ## 6.126 Performance Optimizations (Potential)
 
 - Caching normalized strings.
 - Precomputing tokens.
 
 ## 6.127 Performance Optimizations (Measured)
 
 - Cache hit rate > 60%.
 - Query reduction > 20%.
 
 ## 6.128 Performance Test Matrix (Expanded)
 
 | Test | Input | Expected |
 | --- | --- | --- |
 | small benchmark | 1k tracks | < 5m |
 | medium benchmark | 5k tracks | < 15m |
 | large benchmark | 10k tracks | < 30m |
 
 ## 6.129 Performance Reports (Templates)
 
 - Summary
 - Baseline comparison
 - Recommendations
 
 ## 6.130 Performance Versioning
 
 - Include app version in benchmark reports.
 
 ## 6.131 Performance Alerting (Optional)
 
 - Alert on regression in CI.
 
 ## 6.132 Performance QA Checklist
 
 - Verify ETA displayed.
 - Verify memory peak logged.
 - Verify stage timings logged.
 
 ## 6.133 Performance On-Device Profiling
 
 - Enable in debug builds only.
 
 ## 6.134 Performance Profiling Tools
 
 - `cProfile`
 - `py-spy`
 
 ## 6.135 Performance Profiling Workflow
 
 - Run benchmark.
 - Capture profile.
 - Compare to baseline.
 
 ## 6.136 Performance Ownership
 
 - Assign performance owner.
 - Review metrics monthly.
 
 ## 6.137 Performance Roadmap
 
 - Phase 1: benchmarks + budgets.
 - Phase 2: adaptive concurrency.
 - Phase 3: advanced profiling.
 
 ## 6.138 Performance Documentation
 
 - Add performance guide to docs.
 
 ## 6.139 Performance Example Test
 
 ```python
 def test_benchmark_small():
     result = run_benchmark("fixtures/small.xml")
     assert result.duration_sec < 300
 ```
 
 ## 6.140 Performance Summary (Expanded)
 
 - Performance managed via budgets, benchmarks, and regression gates.
 
 ## 6.141 Performance Appendix: Config Keys
 
 - `performance.max_workers`
 - `performance.max_queries_per_track`
 - `performance.cache_max_mb`
 - `performance.runtime_max_minutes`
 
 ## 6.142 Performance Appendix: CLI Flags
 
 - `--max-workers`
 - `--max-queries-per-track`
 - `--benchmark`
 
 ## 6.143 Performance Appendix: Error Codes
 
 - P001: Runtime budget exceeded.
 - P002: Memory budget exceeded.
 
 ## 6.144 Performance Appendix: UX Copy
 
 - "Large library detected. This may take a while."
 - "Performance warning: runtime exceeding estimates."
 
 ## 6.145 Performance Appendix: Metrics List
 
 - `runtime_sec`
 - `memory_mb_peak`
 - `cache_hit_rate`
 - `query_count`
 
 ## 6.146 Performance Appendix: Checklist
 
 - Benchmarks run
 - Regression check passed
 - Memory within budget
 
 ## 6.147 Performance Appendix: Benchmark Table
 
 | Dataset | Target | Notes |
 | --- | --- | --- |
 | 1k | < 5m | Baseline |
 | 5k | < 15m | Typical |
 | 10k | < 30m | Stress |
 
 ## 6.148 Performance Appendix: Regression Thresholds
 
 - Runtime regression > 20% fails.
 - Memory regression > 30% warns.
 
 ## 6.149 Performance Appendix: Stage Timings
 
 - `parse_xml`
 - `generate_queries`
 - `search_candidates`
 - `score_candidates`
 - `write_outputs`
 
 ## 6.150 Performance Appendix: Memory Targets
 
 - 1k tracks < 500MB.
 - 10k tracks < 1.5GB.
 
 ## 6.151 Performance Appendix: CPU Targets
 
 - CPU usage < 80% sustained.
 - Avoid UI thread saturation.
 
 ## 6.152 Performance Appendix: IO Targets
 
 - Write throughput > 5MB/s.
 
 ## 6.153 Performance Appendix: Cache Targets
 
 - Cache hit rate > 60%.
 
 ## 6.154 Performance Appendix: Example Report
 
 ```
 dataset=10k
 runtime=28m
 memory_peak=1.2GB
 cache_hit=65%
 ```
 
 ## 6.155 Performance Appendix: Tuning Levers
 
 - Reduce max queries per track.
 - Reduce concurrency.
 - Increase cache size.
 
 ## 6.156 Performance Appendix: Tuning Risks
 
 - Lower queries might reduce match quality.
 - Lower concurrency increases runtime.
 
 ## 6.157 Performance Appendix: Tuning Tests
 
 - Compare match rate before/after.
 - Compare runtime before/after.
 
 ## 6.158 Performance Appendix: Data Collection
 
 - Collect metrics per run.
 - Store in diagnostics bundle.
 
 ## 6.159 Performance Appendix: Diagnostics Bundle Fields
 
 - `run_id`
 - `dataset_size`
 - `runtime_sec`
 - `memory_mb_peak`
 
 ## 6.160 Performance Appendix: Implementation Notes
 
 - Avoid per-row UI updates.
 - Avoid per-row disk flush.
 
 ## 6.161 Performance Appendix: QA Checklist
 
 - Verify ETA shown.
 - Verify performance log written.
 - Verify cache size respected.
 
 ## 6.162 Performance Appendix: Monitoring Queries
 
 - Track average runtime per release.
 - Track regression counts.
 
 ## 6.163 Performance Appendix: Ownership
 
 - Assign benchmark owner.
 - Assign regression triage owner.
 
 ## 6.164 Performance Appendix: Roadmap
 
 - Short-term: baseline + gates.
 - Mid-term: adaptive concurrency.
 - Long-term: parallel parsing.
 
 ## 6.165 Performance Appendix: Sample Config
 
 ```yaml
 performance:
   max_workers: 8
   max_queries_per_track: 6
   cache_max_mb: 500
   runtime_max_minutes: 120
 ```
 
 ## 6.166 Performance Appendix: Sample CLI Usage
 
 ```
 cuepoint --xml fixtures/large.xml --benchmark --max-workers 4
 ```
 
 ## 6.167 Performance Appendix: Fail-Fast Rules
 
 - Abort if memory exceeds 2GB.
 - Abort if runtime exceeds 2 hours.
 
 ## 6.168 Performance Appendix: Fail-Fast Messages
 
 - "Run stopped: memory limit exceeded."
 - "Run stopped: runtime limit exceeded."
 
 ## 6.169 Performance Appendix: Optimization Checklist
 
 - Reduce queries per track.
 - Increase cache hit rate.
 - Defer UI rendering.
 
 ## 6.170 Performance Appendix: Benchmarks (Extended)
 
 - Cold start benchmark.
 - Warm cache benchmark.
 - Offline cache-only benchmark.
 
 ## 6.171 Performance Appendix: Data Review
 
 - Compare results to last release.
 - Document regression reasons.
 
 ## 6.172 Performance Appendix: Final Notes
 
 - Always measure before optimizing.
 - Preserve correctness over speed.
 
 ## 6.173 Performance Appendix: Owners
 
 - Benchmarks: build owner.
 - Regression triage: perf owner.
 
 ## 6.174 Performance Appendix: Done Criteria
 
 - Benchmarks stable.
 - Regression gates active.
 
 
