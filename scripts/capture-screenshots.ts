import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

const baseUrl = process.env.LIFERL_SCREENSHOT_URL ?? "http://localhost:5173";
const outputDir = path.resolve("docs/screenshots");

async function waitForApp(page: Page) {
  await page.goto(baseUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("heading", { name: "Habits" }).first().waitFor({ state: "visible", timeout: 10_000 });
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("liferl-theme", "dark");
    localStorage.setItem("liferl-theme-preset", "rose");
  });

  const desktop = await context.newPage();
  await desktop.setViewportSize({ width: 1440, height: 1050 });
  await waitForApp(desktop);
  await capture(desktop, "desktop-dashboard");

  await desktop.getByTestId("theme-menu-trigger").click();
  await desktop.getByText("Select Theme", { exact: true }).waitFor({ state: "visible" });
  await capture(desktop, "settings-theme");
  await desktop.close();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 740 });
  await waitForApp(mobile);
  await capture(mobile, "mobile-habits");

  await mobile.getByRole("button", { name: "Show Trends" }).click();
  await mobile.waitForTimeout(300);
  await capture(mobile, "mobile-trends");
  await mobile.close();
  await context.close();
} finally {
  await browser.close();
}

console.log(`Screenshots written to ${outputDir}`);
