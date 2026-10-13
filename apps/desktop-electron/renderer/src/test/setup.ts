/**
 * Vitest setup shared by every renderer test.
 *
 * Adds jest-dom's DOM matchers (toBeInTheDocument, toBeDisabled, ...) and
 * unmounts anything a test rendered, so one test's DOM cannot be visible to the
 * next. The shared job poll is module state, so it is reset too.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { resetJobsStoreForTests } from "../api/jobsStore";

afterEach(() => {
  cleanup();
  resetJobsStoreForTests();
});
