import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chromium } from "playwright-core";

import { generateGeneralMedicalCases } from "./fixtures/corruption-generator.js";

const applicationUrl = process.env.MDC_BROWSER_URL ?? "http://127.0.0.1:4173/";
const executablePath =
  process.env.MDC_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixtureUrl = new URL("./fixtures/adversarial-corpus.json", import.meta.url);
const fixedCases = JSON.parse(await readFile(fixtureUrl, "utf8"));
const generatedCases = await generateGeneralMedicalCases();
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyPattern = onlyArgument ? new RegExp(onlyArgument.slice("--only=".length)) : null;
const cases = [...fixedCases, ...generatedCases].filter(
  (fixture) => !onlyPattern || onlyPattern.test(fixture.id),
);
const showOutput = process.argv.includes("--show-output");
const concise = process.argv.includes("--concise");

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
try {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), method: request.method(), postData: request.postData() });
  });

  await page.goto(applicationUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#engineBadge").getByText("Browser-local engine ready").waitFor({
    timeout: 180_000,
  });

  for (const fixture of cases) {
    await page.locator("#inputText").fill(fixture.text);
    await page.waitForFunction(() => !document.querySelector("#scanButton").disabled);
    await page.locator("#scanButton").click();
    await page.waitForFunction(
      () => document.querySelector("#documentStatus").textContent.includes("Local scan complete"),
      undefined,
      { timeout: 180_000 },
    );

    const cleaned = await page.locator("#cleanedOutput").textContent();
    if (showOutput) console.log(`OUTPUT ${fixture.id}\n${cleaned}\n`);
    for (const value of fixture.must_remove) {
      if (cleaned.includes(value)) {
        failures.push(`${fixture.id}: identifier remained: ${JSON.stringify(value)}\n${cleaned}`);
      }
    }
    for (const value of fixture.must_preserve) {
      if (!cleaned.includes(value)) {
        failures.push(`${fixture.id}: clinical text was lost: ${JSON.stringify(value)}\n${cleaned}`);
      }
    }
    for (const entityType of fixture.placeholder_types) {
      if (!cleaned.includes(`[${entityType}_`)) {
        failures.push(`${fixture.id}: missing ${entityType} placeholder\n${cleaned}`);
      }
    }
    if (await page.locator("#reviewCheckbox").isDisabled()) {
      await page.locator("#inputText").fill(cleaned);
      await page.waitForFunction(() => !document.querySelector("#scanButton").disabled);
      await page.locator("#scanButton").click();
      await page.waitForFunction(
        () => document.querySelector("#documentStatus").textContent.includes("Local scan complete"),
        undefined,
        { timeout: 180_000 },
      );
      const residualPass = await page.locator("#cleanedOutput").textContent();
      failures.push(
        `${fixture.id}: export remained blocked after a complete local scan\n` +
          `first pass: ${cleaned}\nsecond pass: ${residualPass}`,
      );
    }

    if (!failures.some((failure) => failure.startsWith(`${fixture.id}:`))) {
      console.log(`PASS ${fixture.id}`);
    }
  }

  const applicationOrigin = new URL(applicationUrl).origin;
  assert(
    requests.every((request) => new URL(request.url).origin === applicationOrigin),
    "The adversarial corpus run made a cross-origin request",
  );
  assert(
    requests.every((request) => request.method === "GET" && request.postData === null),
    "The adversarial corpus run transmitted synthetic note content",
  );

  if (failures.length) {
    const reportedFailures = concise
      ? failures.map((failure) => failure.split("\n", 1)[0])
      : failures;
    throw new Error(
      `Adversarial corpus failed (${failures.length} findings):\n\n${reportedFailures.join("\n\n")}`,
    );
  }
  console.log(`Adversarial corpus passed: ${cases.length} cases, ${requests.length} local GETs.`);
} finally {
  await browser.close();
}
