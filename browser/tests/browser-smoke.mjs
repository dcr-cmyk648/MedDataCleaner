import assert from "node:assert/strict";

import { chromium } from "playwright-core";

const applicationUrl = process.env.MDC_BROWSER_URL ?? "http://127.0.0.1:4173/";
const executablePath =
  process.env.MDC_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const syntheticSentinel = "SYNTHETIC_BROWSER_SENTINEL";

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), postData: request.postData() });
  });

  await page.goto(applicationUrl, { waitUntil: "domcontentloaded" });
  const versionText = await page.locator("#versionLabel").textContent();
  const updatedText = await page.locator("#updatedLabel").textContent();
  assert.match(versionText, /^Version \d+\.\d+\.\d+ · Build (?:[0-9a-f]{7}|development)$/);
  assert.match(updatedText, /^Last updated .+\d{1,2}:\d{2}.+$/);
  const buildMetaLayout = await page.evaluate(() => {
    const metadata = document.querySelector("#buildMeta").getBoundingClientRect();
    const heading = document.querySelector("h1").getBoundingClientRect();
    return {
      metadataLeft: metadata.left,
      metadataTop: metadata.top,
      headingLeft: heading.left,
      headingTop: heading.top,
    };
  });
  assert(Math.abs(buildMetaLayout.metadataLeft - buildMetaLayout.headingLeft) < 1);
  assert(buildMetaLayout.metadataTop < buildMetaLayout.headingTop);

  await page.locator("#engineBadge").getByText("Browser-local engine ready").waitFor({
    timeout: 180_000,
  });
  const renderedTheme = await page.evaluate(() => ({
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    foreground: getComputedStyle(document.body).color,
  }));
  assert.equal(renderedTheme.colorScheme, "dark");
  assert.equal(renderedTheme.background, "rgb(11, 16, 14)");
  assert.equal(renderedTheme.foreground, "rgb(232, 241, 237)");

  const syntheticNote =
    `${syntheticSentinel}. Sarah lives in London. ` +
    "Hospitalized 4....13.26 with MRN: AB-12345.";
  await page.locator("#inputText").fill(syntheticNote);
  await page.locator("#scanButton").click();
  await page.getByText("Local scan complete; review is still required.").waitFor({
    timeout: 180_000,
  });

  const cleaned = await page.locator("#cleanedOutput").textContent();
  assert.match(cleaned, /\[PERSON_1\]/);
  assert.match(cleaned, /\[LOCATION_1\]/);
  assert.match(cleaned, /\[DATE_1\]/);
  assert.match(cleaned, /\[MEDICAL_RECORD_NUMBER_1\]/);

  const reviewCheckbox = page.locator("#reviewCheckbox");
  const exportButton = page.locator("#exportButton");
  const copyButton = page.locator("#copyButton");
  assert.equal(await exportButton.isDisabled(), true);
  assert.equal(await copyButton.isDisabled(), true);
  await reviewCheckbox.check();
  assert.equal(await exportButton.isEnabled(), true);
  assert.equal(await copyButton.isEnabled(), true);
  await copyButton.click();
  await page.getByText("De-identified text copied to the device clipboard.").waitFor({
    timeout: 180_000,
  });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), cleaned);
  await reviewCheckbox.uncheck();
  assert.equal(await exportButton.isDisabled(), true);
  assert.equal(await copyButton.isDisabled(), true);

  const malformedNote =
    "The patient is a 4\n" +
    "3 year old male with a history of schizoaffective disorder and polysubstance use " +
    "disorder who presents for dialysis. He is on Zyprexa. He was most recently " +
    "hospitalized 4....13.26. He lives in Kals-amazoo, Michigan with his mother Ma/rtha. " +
    "He likes to go to Walgreens to hang out. He will sometimes use Depakote. His zip code " +
    "is 4444....{2]. His pharmacy is at -192480{{2234 farmington]]]lane in North//ville";
  await page.locator("#inputText").fill(malformedNote);
  await page.locator("#scanButton").click();
  await page
    .locator("#documentStatus")
    .filter({ hasText: "Local scan complete" })
    .waitFor({ timeout: 180_000 });
  assert.equal(
    await page.locator("#cleanedOutput").textContent(),
    "The patient is a 4\n" +
      "3 year old male with a history of schizoaffective disorder and polysubstance use " +
      "disorder who presents for dialysis. He is on Zyprexa. He was most recently " +
      "hospitalized [DATE_1]. He lives in [LOCATION_1], [LOCATION_2] with his mother " +
      "[PERSON_1]. He likes to go to Walgreens to hang out. He will sometimes use Depakote. " +
      "His zip code is [ZIP_CODE_1]. His pharmacy is at [ADDRESS_1] in [LOCATION_3]",
  );

  const ocrNote =
    "SCANNED MONTHLY NOTE / OCR CONFIDENCE LOW\n" +
    "PATlENT N4ME: DEV0N OAKLEY      MEDlCAL REC0RD N0: OCR-88I7Z\n" +
    "D0B=11_03_1966     DATE=2.....27.....2026\n" +
    "H0ME: 88 Examp1e Orchard Rd.,To1edo,OH 43604\n" +
    "Hgb10.1|TSAT19%|ferritin312|Na137|K5.7|bicarb19|Ca8.4|phos7.2|PTH690|albumin3.3";
  await page.locator("#inputText").fill(ocrNote);
  await page.locator("#scanButton").click();
  await page
    .locator("#documentStatus")
    .filter({ hasText: "Local scan complete" })
    .waitFor({ timeout: 180_000 });
  const cleanedOcr = await page.locator("#cleanedOutput").textContent();
  assert.doesNotMatch(cleanedOcr, /DEV0N OAKLEY|OCR-88I7Z|43604/);
  assert.match(cleanedOcr, /\[PERSON_1\]/);
  assert.match(cleanedOcr, /\[MEDICAL_RECORD_NUMBER_1\]/);
  assert.match(cleanedOcr, /OH \[ZIP_CODE_1\]/);
  assert.match(cleanedOcr, /Hgb10\.1\|TSAT19%\|ferritin312/);

  const runOnNote =
    "Admitted5/28/26forvolumeoverloadanddischarged06-02-2026toresumeHDatCopperMoonDialysis.\n" +
    "Echocardiogram reported EF 48%. Discharge weight 69.8 kg.";
  await page.locator("#inputText").fill(runOnNote);
  await page.locator("#scanButton").click();
  await page
    .locator("#documentStatus")
    .filter({ hasText: "Local scan complete" })
    .waitFor({ timeout: 180_000 });
  const cleanedRunOn = await page.locator("#cleanedOutput").textContent();
  assert.doesNotMatch(cleanedRunOn, /CopperMoonDialysis/);
  assert.match(cleanedRunOn, /\[LOCATION_1\]/);
  assert.match(cleanedRunOn, /Echocardiogram reported EF 48%/);

  await page.route("**/version.json?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: "forced-update-test" }),
    });
  });
  await page.locator("#inputText").fill("Synthetic note kept in memory during the update check.");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator("#updateNotice").waitFor();
  assert.equal(await page.locator("#scanButton").isDisabled(), true);
  assert.equal(await page.locator("#exportButton").isDisabled(), true);
  await page.unroute("**/version.json?*");
  await page.locator("#updateButton").click();
  await page.waitForURL((url) => {
    return (
      url.searchParams.get("version") === "forced-update-test" &&
      url.searchParams.has("refresh")
    );
  });
  const refreshedUrl = new URL(page.url());
  assert.equal(refreshedUrl.searchParams.get("version"), "forced-update-test");
  assert.match(refreshedUrl.searchParams.get("refresh"), /^[0-9a-z]+$/);

  const applicationOrigin = new URL(applicationUrl).origin;
  assert(requests.length > 5);
  assert(
    requests.every((request) => new URL(request.url).origin === applicationOrigin),
    "The browser edition made a cross-origin request",
  );
  assert(
    requests.every((request) => !request.postData?.includes(syntheticSentinel)),
    "The browser edition transmitted pasted note text",
  );
  console.log(`Browser smoke passed with ${requests.length} same-origin asset requests.`);
} finally {
  await browser.close();
}
