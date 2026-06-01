// On-demand visual check: boots the dev server, draws a few cells, opens the
// export modal, and screenshots both the full page and the modal.
//
//   node scripts/shot.mjs
//
// Output: scripts/shot-page.png, scripts/shot-modal.png
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = process.env.SHOT_PORT ?? "5180";
const URL = `http://127.0.0.1:${PORT}/`;

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Dev server at ${url} never came up`);
}

const server = spawn("npx", ["vite", "--port", PORT, "--host", "127.0.0.1"], {
  stdio: "ignore",
});
const stop = () => server.killed || server.kill();
process.on("exit", stop);

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(URL, { waitUntil: "networkidle" });

  // Draw a few cells so the crop preview has content.
  const canvas = page.locator("main canvas");
  const box = await canvas.boundingBox();
  if (box) {
    const cells = [
      [4, 4], [5, 4], [6, 4], [5, 5], [5, 6], [4, 7], [6, 7],
    ];
    const step = box.width / 16; // default 16x16 grid
    for (const [cx, cy] of cells) {
      await page.mouse.click(box.x + (cx + 0.5) * step, box.y + (cy + 0.5) * step);
    }
  }

  await page.screenshot({ path: "scripts/shot-page.png" });

  // Open the export modal and screenshot it.
  await page.getByRole("button", { name: "Crop & Export" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "scripts/shot-modal.png" });

  await browser.close();
  console.log("✓ wrote scripts/shot-page.png and scripts/shot-modal.png");
} catch (err) {
  console.error("❌", err.message);
  process.exitCode = 1;
} finally {
  stop();
}
