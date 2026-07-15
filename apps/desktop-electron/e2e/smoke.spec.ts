import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

test.describe("Electron desktop smoke (TC-UI-001)", () => {
  test("app launches and shows main navigation", async () => {
    const app = await electron.launch({
      cwd: DESKTOP_ROOT,
      args: ["."],
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });

    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await expect(window).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(window.getByRole("link", { name: "inKey" })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
