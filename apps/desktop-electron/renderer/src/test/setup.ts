/**
 * Vitest setup shared by every renderer test.
 *
 * Adds jest-dom's DOM matchers (toBeInTheDocument, toBeDisabled, ...) and
 * unmounts anything a test rendered, so one test's DOM cannot be visible to the
 * next. The shared job poll and the engine-read cache are module state, so they are reset too.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { resetEngineReadsForTests } from "../api/engineReads";
import { resetJobsStoreForTests } from "../api/jobsStore";

afterEach(() => {
  cleanup();
  resetJobsStoreForTests();
  resetEngineReadsForTests();
});
