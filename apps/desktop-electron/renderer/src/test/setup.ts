/**
 * Vitest setup shared by every renderer test.
 *
 * Adds jest-dom's DOM matchers (toBeInTheDocument, toBeDisabled, ...) and
 * unmounts anything a test rendered, so one test's DOM cannot be visible to the
 * next. The shared job poll, the engine-read cache and the cover cache are module
 * state, so they are reset too.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { resetCoversForTests } from "../api/coverLoader";
import { resetEngineReadsForTests } from "../api/engineReads";
import { resetJobsStoreForTests } from "../api/jobsStore";
import { resetStripMessagesForTests } from "../api/stripMessages";

afterEach(() => {
  cleanup();
  resetJobsStoreForTests();
  resetEngineReadsForTests();
  resetCoversForTests();
  resetStripMessagesForTests();
});
