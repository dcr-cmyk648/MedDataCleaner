import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chromium } from "playwright-core";

import { BALANCED_GATE_CASES } from "./fixtures/balanced-gate-corpus.js";
import { generateGeneralMedicalCases } from "./fixtures/corruption-generator.js";

const applicationUrl = process.env.MDC_BROWSER_URL ?? "http://127.0.0.1:4173/";
const executablePath =
  process.env.MDC_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixtureUrl = new URL("./fixtures/adversarial-corpus.json", import.meta.url);
const fixedCases = JSON.parse(await readFile(fixtureUrl, "utf8"));
const generatedCases = await generateGeneralMedicalCases();
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyPattern = onlyArgument ? new RegExp(onlyArgument.slice("--only=".length)) : null;
const cases = [...fixedCases, ...generatedCases, ...BALANCED_GATE_CASES].filter(
  (fixture) => !onlyPattern || onlyPattern.test(fixture.id),
);
const showOutput = process.argv.includes("--show-output");
const concise = process.argv.includes("--concise");

const browser = await chromium.launch({ executablePath, headless: true });
const exclusionFailures = [];
const retentionFailures = [];
const safetyFailures = [];
const gateMetrics = {
  exclusionRequired: 0,
  exclusionPassed: 0,
  retentionRequired: 0,
  retentionPassed: 0,
};

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function covers(outer, inner) {
  return outer.start <= inner.start && outer.end >= inner.end;
}

try {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), method: request.method(), postData: request.postData() });
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__mdcLastAnalysis = null;
    window.Worker = function InspectableWorker(...arguments_) {
      const worker = new NativeWorker(...arguments_);
      worker.addEventListener("message", (event) => {
        if (event.data?.type === "analysis-result") {
          window.__mdcLastAnalysis = event.data.result;
        }
      });
      return worker;
    };
    window.Worker.prototype = NativeWorker.prototype;
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
    const analysis = await page.evaluate(() => window.__mdcLastAnalysis);
    const appliedFindings = (analysis?.findings ?? []).filter((finding) => finding.selected);
    if (showOutput) console.log(`OUTPUT ${fixture.id}\n${cleaned}\n`);
    for (const value of fixture.must_remove) {
      gateMetrics.exclusionRequired += 1;
      if (cleaned.includes(value)) {
        exclusionFailures.push(
          `${fixture.id}: identifier remained: ${JSON.stringify(value)}\n${cleaned}`,
        );
      } else {
        gateMetrics.exclusionPassed += 1;
      }
    }
    for (const value of fixture.must_preserve) {
      gateMetrics.retentionRequired += 1;
      if (!cleaned.includes(value)) {
        retentionFailures.push(
          `${fixture.id}: clinical text was lost: ${JSON.stringify(value)}\n${cleaned}`,
        );
      } else {
        gateMetrics.retentionPassed += 1;
      }
    }
    for (const entityType of fixture.placeholder_types) {
      if (!cleaned.includes(`[${entityType}_`)) {
        exclusionFailures.push(`${fixture.id}: missing ${entityType} placeholder\n${cleaned}`);
      }
    }
    for (const expected of fixture.remove_spans ?? []) {
      const typedCoverage = appliedFindings.some(
        (finding) => finding.entity_type === expected.entity_type && covers(finding, expected),
      );
      if (!typedCoverage) {
        exclusionFailures.push(
          `${fixture.id}: ${expected.entity_type} span was not fully covered: ` +
            `${JSON.stringify(expected.value)}\nfindings: ${JSON.stringify(appliedFindings)}\n` +
            cleaned,
        );
      }
    }
    for (const protectedSpan of fixture.retain_spans ?? []) {
      const collisions = appliedFindings.filter((finding) => overlaps(finding, protectedSpan));
      if (collisions.length) {
        retentionFailures.push(
          `${fixture.id}: finding crossed protected source text: ` +
            `${JSON.stringify(protectedSpan.value)}\ncollisions: ${JSON.stringify(collisions)}\n` +
            cleaned,
        );
      }
    }
    if (await page.locator("#reviewCheckbox").isDisabled()) {
      const residualDetails = await page.evaluate(() => {
        const analysis = window.__mdcLastAnalysis;
        return (analysis?.residual_findings ?? []).map((finding) => ({
          ...finding,
          value: analysis.cleaned_text.slice(finding.start, finding.end),
        }));
      });
      await page.locator("#inputText").fill(cleaned);
      await page.waitForFunction(() => !document.querySelector("#scanButton").disabled);
      await page.locator("#scanButton").click();
      await page.waitForFunction(
        () => document.querySelector("#documentStatus").textContent.includes("Local scan complete"),
        undefined,
        { timeout: 180_000 },
      );
      const residualPass = await page.locator("#cleanedOutput").textContent();
      safetyFailures.push(
        `${fixture.id}: export remained blocked after a complete local scan\n` +
          `residual findings: ${JSON.stringify(residualDetails)}\n` +
          `first pass: ${cleaned}\nsecond pass: ${residualPass}`,
      );
    }

    const failed = [...exclusionFailures, ...retentionFailures, ...safetyFailures].some((failure) =>
      failure.startsWith(`${fixture.id}:`),
    );
    if (!failed) {
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

  const failures = [...exclusionFailures, ...retentionFailures, ...safetyFailures];
  if (failures.length) {
    const formatFailures = (label, values) => {
      const reported = concise ? values.map((failure) => failure.split("\n", 1)[0]) : values;
      return reported.length ? `${label} (${reported.length}):\n${reported.join("\n\n")}` : "";
    };
    throw new Error(
      [
        `Adversarial corpus failed (${failures.length} findings).`,
        formatFailures("EXCLUSION GATE", exclusionFailures),
        formatFailures("RETENTION GATE", retentionFailures),
        formatFailures("SAFETY/EXPORT GATE", safetyFailures),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  console.log(
    `Exclusion gate passed: ${gateMetrics.exclusionPassed}/${gateMetrics.exclusionRequired}.`,
  );
  console.log(
    `Retention gate passed: ${gateMetrics.retentionPassed}/${gateMetrics.retentionRequired}.`,
  );
  console.log(`Adversarial corpus passed: ${cases.length} cases, ${requests.length} local GETs.`);
} finally {
  await browser.close();
}
