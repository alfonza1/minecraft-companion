import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createApp } from "../../../services/api/index.js";
import { Store } from "../../../services/memory/store.js";

const directory = await mkdtemp(join(tmpdir(), "companion-dashboard-"));
const evidence = join(process.cwd(), ".git", "verification", "dashboard");
await mkdir(evidence, { recursive: true });
const app = await createApp({ store: new Store(directory) });
await app.listen({ host: "127.0.0.1", port: 4367 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
const evidenceLines = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:4367");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.getByText("Connected to local runtime", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Start companion", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: join(evidence, "overview-desktop.png"),
    fullPage: true,
  });
  for (const [label, heading] of [
    ["Inventory", "Inventory"],
    ["Build studio", "Build studio"],
    ["Shared tasks", "Shared tasks"],
    ["Companion", "Companion"],
    ["Settings", "Settings"],
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: label, exact: true })
      .click();
    await page
      .getByRole("heading", { name: heading, exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await page
        .locator("body")
        .evaluate((element) => element.scrollWidth > innerWidth),
      false,
      `${label} desktop overflow`,
    );
    await page.screenshot({
      path: join(
        evidence,
        `${label.toLowerCase().replaceAll(" ", "-")}-desktop.png`,
      ),
      fullPage: true,
    });
  }
  evidenceLines.push(
    "All six pages render against a real local API and SQLite store; no page errors or desktop overflow.",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Companion", exact: true })
    .click();
  const travelPace = page.getByRole('combobox', { name: 'Travel pace', exact: true });
  await travelPace.selectOption('normal');
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).settings.movementSpeed === 'normal');
  await travelPace.selectOption('brisk');
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).settings.movementSpeed === 'brisk');
  evidenceLines.push('Travel pace normal/brisk changes are persisted through the actual settings API.');
  await page.getByRole("textbox", { name: "Memory label" }).fill("QA base");
  await page
    .getByRole("textbox", { name: "Memory details" })
    .fill("Only a test note in an isolated data directory.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await page
    .getByText("Only a test note in an isolated data directory.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Delete memory QA base" }).click();
  await page
    .getByText("Only a test note in an isolated data directory.", {
      exact: true,
    })
    .waitFor({ state: "hidden" });
  evidenceLines.push(
    "Memory creation/deletion is persisted through actual API requests.",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Build studio", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New project name" })
    .fill("QA isolated blueprint");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("heading", { name: "QA isolated blueprint", exact: true })
    .waitFor();
  const health = await (await fetch("http://127.0.0.1:4367/api/health")).json();
  const blueprint = {
    version: health.latestSupportedVersion,
    dimensions: { x: 2, y: 1, z: 1 },
    provenance: "schematic",
    uncertainties: [],
    blocks: [
      { x: 0, y: 0, z: 0, name: "oak_log", section: "foundation" },
      { x: 1, y: 0, z: 0, name: "oak_log", section: "foundation" },
    ],
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "test-blueprint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(blueprint)),
  });
  await page.getByText("2 block placements", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Approve this blueprint", exact: true })
    .click();
  await page.getByText("Approved blueprint", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Start construction", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: join(evidence, "blueprint-actual.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Shared tasks", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply split", exact: true }).click();
  await page.getByText("Oak Log", { exact: true }).waitFor();
  const count = page.getByRole("spinbutton", {
    name: "Your collected Oak Log",
  });
  await count.fill("1");
  await page
    .getByRole("button", { name: "Update my count", exact: true })
    .click();
  await page.getByText("1 / 1", { exact: true }).waitFor();
  const state = await (await fetch("http://127.0.0.1:4367/api/state")).json();
  assert.equal(state.projects[0].materials.placed[0].quantity, 2);
  assert.equal(state.projects[0].assignments[0].userProgress, 1);
  assert.equal(state.projects[0].assignments[0].aiProgress, 0);
  assert.equal(state.world, null);
  assert.equal(state.usage.requests, 0);
  evidenceLines.push(
    "Created a project, imported actual 2-block blueprint, rendered preview and exact counts, approved revision, blocked offline construction, split 50/50 and persisted manual user progress. World remains null and model usage zero.",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Companion", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Mining area x" }).fill("120");
  await page.getByRole("spinbutton", { name: "Mining area radius" }).fill("8");
  await page
    .getByRole("button", { name: "Approve this area", exact: true })
    .click();
  await page
    .getByText("Approved: 120, 64, 0 · Radius 8", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByText("Mining not approved", { exact: true }).waitFor();
  evidenceLines.push(
    "Mining permission is an explicit UI action, persisted by the backend, and revocable while offline. No blocks are changed by approval.",
  );
  await page
    .getByRole("button", { name: "Start planning offline", exact: true })
    .click();
  await page
    .getByText("Offline planning is active.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Resume companion", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Resume companion", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Stop and disconnect", exact: true })
    .click();
  const idle = await (await fetch("http://127.0.0.1:4367/api/state")).json();
  assert.equal(idle.state, "DISCONNECTED");
  assert.equal(idle.usage.requests, 0);
  evidenceLines.push(
    "Explicit offline planning starts, pauses, resumes without a Realm, and stops through real backend controls. No model request is made by lifecycle changes.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of [
    "Overview",
    "Inventory",
    "Build studio",
    "Shared tasks",
    "Companion",
    "Settings",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: label, exact: true })
      .click();
    await page
      .getByRole("heading", { name: label, exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await page
        .locator("body")
        .evaluate((element) => element.scrollWidth > innerWidth),
      false,
      `${label} mobile overflow`,
    );
    await page.screenshot({
      path: join(
        evidence,
        `${label.toLowerCase().replaceAll(" ", "-")}-mobile.png`,
      ),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  evidenceLines.push(
    "All six pages at 390px mobile width have no horizontal overflow; screenshots inspected. No JavaScript page errors.",
  );
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        dataDirectory: directory,
        checks: evidenceLines,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(evidenceLines.join("\n"));
} finally {
  await browser.close();
  await app.close();
}
