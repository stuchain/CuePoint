# Reliability and Performance

## What it is (high-level)

- **Retries**: HTTP requests (e.g. Beatport search or track fetch) can **retry** on transient failure (configurable max_retries). Backoff can be simple (e.g. fixed delay) or exponential.
- **Circuit breaker**: after repeated failures (e.g. to Beatport), the app can **open a circuit** and stop sending requests for a cooldown period, then try again (half-open) to avoid hammering a failing service .
- **Guardrails**: the processor can enforce a **runtime budget** (max seconds) and **memory budget** (max MB); when exceeded, it logs (e.g. P001) and **cancels** the run so the app doesn’t hang or OOM.
- **Throttling**: progress callbacks are **throttled** (e.g. 5/sec) so the UI doesn’t flood; ETA is updated every N tracks.
- **Benchmark**: `--benchmark` collects **performance metrics** (e.g. time per stage: parse XML, search, match) and writes them to the output directory for analysis.
- **Performance decorators/workers**: optional decorators or worker pools for CPU-bound or I/O-bound tasks (e.g. run_performance_collector, performance_decorators) to measure and report timing.

## How it is implemented (code)

- **Retry**  
  - **File:** `src/cuepoint/services/reliability_retry.py` — retry decorator or helper: on exception (or specific HTTP errors), retry up to N times with optional backoff; used around Beatport HTTP calls.  
  - **File:** `src/main.py` — `--max-retries` overrides config; passed into service or HTTP layer.

- **Circuit breaker**  
  - **File:** `src/cuepoint/services/circuit_breaker.py` — state (closed / open / half-open), failure count, last failure time, cooldown; before each request, check state; on success/failure update state. Used by Beatport service (or HTTP client) so that after too many failures, requests are not sent until cooldown expires.

- **Guardrails**  
  - **File:** `src/cuepoint/services/processor_service.py` — `_guardrail_progress_callback(callback, controller, runtime_max_sec, memory_max_mb, logging_service)`: in the wrapped callback, if `elapsed_time >= runtime_max_sec` or memory over limit, log P001 (or similar) and call `controller.cancel()`. Config keys e.g. `performance.runtime_max_sec`, `performance.memory_max_mb`.

- **Throttling**  
  - **File:** `src/cuepoint/services/processor_service.py` — `_throttled_progress_callback(callback, throttle_ms=200, eta_every_n=50)`: only forward to callback if at least 200 ms since last call or run complete; update ETA every 50 tracks.

- **Benchmark / performance collection**  
  - **File:** `src/cuepoint/utils/run_performance_collector.py` — stages (e.g. STAGE_PARSE_XML, STAGE_SEARCH_CANDIDATES); record start/end per stage and per track; when `--benchmark`, write JSON or CSV to output dir.  
  - **File:** `src/cuepoint/utils/performance_decorators.py` or `performance.py` — optional decorators to time functions; used in hot paths if enabled.

So: **what the feature is** = “retry, circuit breaker, runtime/memory guardrails, throttled progress, and benchmark metrics”; **how it’s implemented** = reliability_retry + circuit_breaker + processor_service (guardrail and throttle callbacks) + run_performance_collector + optional performance decorators.
