import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("browser source disables remote model loading and persistent model caches", async () => {
  const worker = await source("browser/src/worker.js");
  assert.match(worker, /env\.allowRemoteModels\s*=\s*false/);
  assert.match(worker, /env\.useBrowserCache\s*=\s*false/);
  assert.doesNotMatch(worker, /console\.(?:log|error|warn)/);
});

test("application source does not persist or transmit note content", async () => {
  const app = await source("browser/src/app.js");
  const worker = await source("browser/src/worker.js");
  const combined = `${app}\n${worker}`;
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|serviceWorker|sendBeacon/);
  assert.doesNotMatch(combined, /https?:\/\//);
  assert.doesNotMatch(combined, /fetch\([^)]*(?:inputText|sourceText|cleaned_text)/s);
});

test("page policy restricts scripts, workers, and connections to the same origin", async () => {
  const html = await source("browser/index.html");
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /worker-src 'self'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /referrer" content="no-referrer/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("browser test data, theme, and model integrity safeguards remain available", async () => {
  const html = await source("browser/index.html");
  const browserStyles = await source("browser/src/styles.css");
  const installedStyles = await source("src/med_data_cleaner/web/static/styles.css");
  const installedHtml = await source("src/med_data_cleaner/web/static/index.html");
  const readme = await source("browser/public/test-data/README.txt");
  const manifest = JSON.parse(await source("browser/model-manifest.json"));
  assert.match(html, /\.\/test-data\/synthetic-cross-specialty-notes\.txt/);
  assert.match(readme, /Twenty-one paste-ready cases/);
  assert.match(readme, /general medicine[\s\S]*nephrology\/dialysis/);
  assert.match(browserStyles, /color-scheme:\s*dark/);
  assert.match(installedStyles, /color-scheme:\s*dark/);
  assert.match(html, /name="theme-color" content="#0b100e"/);
  assert.match(installedHtml, /name="theme-color" content="#0b100e"/);
  assert.match(manifest.source_revision, /^[0-9a-f]{40}$/);
  assert.equal(manifest.upstream_license, "Apache-2.0");
  assert(manifest.files.length >= 6);
  for (const file of manifest.files) assert.match(file.sha256, /^[0-9a-f]{64}$/);
});

test("single document surface replaces duplicate source and result panels", async () => {
  const html = await source("browser/index.html");
  const app = await source("browser/src/app.js");
  assert.match(html, /id="inputText"/);
  assert.match(html, /id="reviewSurface"/);
  assert.doesNotMatch(html, /id="(?:cleanedOutput|highlightOutput)"/);
  assert.match(app, /state\.mode\s*===\s*"preview"/);
  assert.match(app, /reviewSurface\.classList\.toggle\("cleaned-preview"/);
});

test("copy is explicitly decision and full-note-review gated, then verified", async () => {
  const html = await source("browser/index.html");
  const app = await source("browser/src/app.js");
  assert.match(html, /id="copyButton"[\s\S]*Copy de-identified text[\s\S]*id="exportButton"/);
  assert.match(app, /areAutomaticFindingsDecided\(automaticFindings\(\),\s*state\.decisions\)/);
  assert.match(app, /elements\.reviewCheckbox\.checked/);
  assert.match(app, /!state\.processing[\s\S]*!state\.updateRequired/);
  assert.match(app, /async function useVerifiedOutput[\s\S]*analyzeInWorker\("verify"\)/);
  assert.match(app, /verified\.cleaned_text\s*!==\s*state\.analysis\.cleaned_text/);
  assert.match(app, /navigator\.clipboard\.writeText\(cleanedText\)/);
});

test("review marks are focusable and keyboard choices are narrowly scoped", async () => {
  const app = await source("browser/src/app.js");
  assert.match(app, /mark\.tabIndex\s*=\s*0/);
  assert.match(app, /mark\.setAttribute\("aria-current"/);
  assert.match(app, /target\.closest\?\.\("\.finding-card\.automatic"\)/);
  assert.match(app, /event\.key\s*===\s*"ArrowLeft"/);
  assert.match(app, /event\.key\s*===\s*"1"/);
  assert.match(app, /event\.key\s*===\s*"2"/);
  assert.doesNotMatch(app, /aria-pressed/);
});

test("location memory is a non-binding suggestion and is not persisted", async () => {
  const app = await source("browser/src/app.js");
  const review = await source("browser/src/review.js");
  assert.match(app, /sessionKeepSuggestionIds\(text,\s*state\.analysis\.findings,\s*state\.reviewPreferences\)/);
  assert.match(app, /suggestions still need confirmation/);
  assert.match(app, /decision\s*===\s*AUTOMATIC_REVIEW_DECISIONS\.KEEP\s*&&\s*canRememberClinicalKeep/);
  assert.match(review, /finding\.entity_type\s*===\s*"LOCATION"/);
  assert.doesNotMatch(`${app}\n${review}`, /localStorage|sessionStorage|indexedDB/);
});

test("update and version safeguards remain enabled", async () => {
  const app = await source("browser/src/app.js");
  const buildConfig = await source("browser/vite.config.js");
  const html = await source("browser/index.html");
  assert.match(app, /const UPDATE_CHECK_INTERVAL_MS\s*=\s*60 \* 1_000/);
  assert.match(app, /cache:\s*"no-store"/);
  assert.match(app, /manifestUrl\.searchParams\.set\("cacheBust"/);
  assert.match(app, /state\.updateVersion\s*=\s*version/);
  assert.match(app, /Version \$\{APPLICATION_VERSION\} · Build \$\{shortBuild\}/);
  assert.match(app, /Last updated \$\{formatBuildTimestamp\(BUILD_UPDATED_AT\)\}/);
  assert.match(app, /destination\.searchParams\.set\("refresh",\s*Date\.now\(\)\.toString\(36\)\)/);
  assert.match(app, /window\.location\.replace\(destination\)/);
  assert.match(app, /window\.addEventListener\("pageshow",\s*checkForUpdate\)/);
  assert.match(app, /window\.addEventListener\("online",\s*checkForUpdate\)/);
  assert.match(html, /Cache-Control" content="no-cache, no-store, must-revalidate"/);
  assert.match(html, /id="buildMeta"[\s\S]*id="versionLabel"[\s\S]*id="updatedLabel"/);
  assert.match(buildConfig, /assetFileNames: "assets\/\[name\]-\[hash\]\[extname\]"/);
  assert.match(buildConfig, /fileName: "version\.json"/);
  assert.match(
    app,
    /CURRENT_VERSION\s*===\s*"development"\s*\?\s*CURRENT_VERSION\s*:\s*CURRENT_VERSION\.slice\(0,\s*7\)/,
  );
});

test("Pages checks run on pull requests without deploying branch code", async () => {
  const workflow = await source(".github/workflows/pages.yml");
  assert.match(workflow, /\r?\n  pull_request:\r?\n/);
  assert.match(workflow, /\r?\n  deploy:\r?\n    if: github\.event_name != 'pull_request'/);
});
