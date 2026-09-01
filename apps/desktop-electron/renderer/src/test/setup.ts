/**
 * Vitest setup shared by every renderer test.
 *
 * Adds jest-dom's DOM matchers (toBeInTheDocument, toBeDisabled, ...) and
 * unmounts anything a test rendered, so one test's DOM cannot be visible to the
 * next.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
