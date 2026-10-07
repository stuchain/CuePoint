/**
 * Errors the page makes up from an answer, and what they say about themselves (REPORT-06,
 * DEC-126, DEC-153).
 *
 * The engine answers a refusal, or a job that ended `failed` or `cancelled`, as a value. A
 * screen that wants to show it as a sentence throws `new Error(sentence)`, and the sentence
 * alone cannot say whether anything is broken. These helpers give the error the fields the
 * bridge gives an engine error (`status`, `code`, `reportId`), which `reportUnexpected` reads:
 * a refusal is below 500 and is not reported; a failed job the engine reported carries its
 * `reportId`, so it is not reported twice and its id becomes the last report; any other failed
 * job is an error and is reported once.
 */

/**
 * The job error codes that are the user's to fix, so a failed job with one is not reported
 * (DEC-153). Keep equal to `EXPECTED_JOB_ERROR_CODES` in `src/cuepoint/reporting/expected.py`;
 * `expected.test.ts` holds the spellings. The engine's cause-gated `EXPORT_WRITE_FAILED` and
 * its `*_FAILED` fallbacks are left out, as there: they are the user's only when the
 * exception behind them says so, which the page cannot see.
 */
export const EXPECTED_JOB_ERROR_CODES: readonly string[] = [
  "JOB_CANCELLED",
  "BEATPORT_NO_TOKEN",
  "BEATPORT_REJECTED",
  "BEATPORT_FORBIDDEN",
  "BEATPORT_RATE_LIMITED",
  "BEATPORT_API_NO_TOKEN",
  "BEATPORT_API_AUTH",
  "BEATPORT_API_FORBIDDEN",
  "BEATPORT_API_RATE_LIMIT",
  "BEATPORT_UNAVAILABLE",
  "MATCH_SEARCH_UNAVAILABLE",
  "BEATPORT_API_TIMEOUT",
  "BEATPORT_API_SERVER_ERROR",
  "CIRCUIT_OPEN",
  "LIBRARY_NOT_IMPORTED",
  "LIBRARY_XML_NO_COLLECTION",
  "LIBRARY_REFRESH_NEEDS_CONFIRMATION",
  "LIBRARY_REFRESH_DIFF_NOT_FOUND",
  "LIBRARY_REFRESH_DIFF_STALE",
  "TAG_WRITE_PREVIEW_NOT_FOUND",
  "source_never_imported",
  "source_missing",
  "source_unreadable",
  "source_invalid",
  "destination_blank",
  "destination_is_source",
  "destination_not_xml",
  "destination_is_folder",
  "destination_folder_missing",
  "EXPORT_PATH_REFUSED",
  "DB_SCHEMA_TOO_NEW",
  // A route's 500 the user owns (`EXPECTED_ROUTE_ERROR_CODES`).
  "SET_LIST_WRITE_FAILED",
];

/** An error with the fields an engine error has across the bridge. */
function withFields(
  message: string,
  fields: { status: number | null; code: string | null; reportId: string | null },
): Error {
  return Object.assign(new Error(message), fields);
}

/** The error for a refusal the engine answered as a value: the user's to read, nothing is broken. */
export function refusalError(message: string, code: string | null = null): Error {
  return withFields(message, { status: 400, code, reportId: null });
}

/** The error for a job the user stopped. Not a failure. */
export function cancelledError(message: string): Error {
  return withFields(message, { status: 409, code: "JOB_CANCELLED", reportId: null });
}

/** What a failed job says about itself. */
export interface JobFailure {
  code?: string;
  message?: string;
  report_id?: string | null;
  reportId?: string | null;
}

/**
 * The error for a job that ended `failed`, in `message`'s words. An expected code is a refusal
 * (400). Otherwise it is a failure (500), carrying the report id the engine made for it, if any.
 */
export function jobFailureError(message: string, failure: JobFailure | undefined): Error {
  const code = typeof failure?.code === "string" ? failure.code : null;
  const reportId = failure?.report_id ?? failure?.reportId ?? null;
  // No engine to ask (a browser tab, or the bridge missing): an outage, not a bug.
  if (code === "NO_BRIDGE") return withFields(message, { status: null, code: "UNAVAILABLE", reportId: null });
  if (code !== null && EXPECTED_JOB_ERROR_CODES.includes(code)) return withFields(message, { status: 400, code, reportId: null });
  return withFields(message, { status: 500, code, reportId: typeof reportId === "string" ? reportId : null });
}
