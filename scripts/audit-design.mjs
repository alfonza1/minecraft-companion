/** Local, isolated browser audits. Never points Lighthouse at a player's service. */
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDesignFixture } from "./design-fixtures.mjs";
import { servePublicWebsite } from "../tests/visual/static-server.mjs";

const output = ".git/design-lighthouse";
await mkdir(output, { recursive: true });
const website = await servePublicWebsite();
let fixture, chrome;
try {
  fixture = await createDesignFixture({
    scenario: "disconnected",
    freezeTime: false,
  });
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--disable-gpu", "--no-first-run"],
    logLevel: "silent",
  });
  const summary = {
    methodology:
      "One local unthrottled headless Chromium run per surface at 1440×1000. Empty isolated workspace; not a gameplay or model-speed benchmark.",
    node: process.version,
    auditedAt: new Date().toISOString(),
    results: [],
  };
  for (const [name, url] of [
    ["website", website.base],
    ["workspace", fixture.base],
  ]) {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: "desktop",
      throttlingMethod: "provided",
      screenEmulation: {
        mobile: false,
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
        disabled: false,
      },
    });
    if (!result || result.lhr.runtimeError)
      throw new Error(
        `${name}: ${result?.lhr.runtimeError?.message || "No audit result"}`,
      );
    await writeFile(join(output, `${name}.json`), result.report[0]);
    await writeFile(join(output, `${name}.html`), result.report[1]);
    summary.results.push({
      name,
      scores: Object.fromEntries(
        Object.entries(result.lhr.categories).map(([key, value]) => [
          key,
          Math.round(value.score * 100),
        ]),
      ),
      metrics: Object.fromEntries(
        [
          "first-contentful-paint",
          "largest-contentful-paint",
          "total-blocking-time",
          "cumulative-layout-shift",
        ].map((key) => [key, result.lhr.audits[key].displayValue]),
      ),
      failures: Object.values(result.lhr.audits)
        .filter(
          (audit) =>
            audit.score !== null &&
            audit.score < 1 &&
            audit.scoreDisplayMode !== "informative",
        )
        .map((audit) => ({
          id: audit.id,
          title: audit.title,
          score: audit.score,
        })),
    });
  }
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await chrome?.kill();
  await fixture?.close();
  await website.close();
}
