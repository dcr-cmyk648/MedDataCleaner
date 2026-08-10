import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("browser source disables remote model loading and persistent model caches", async () => {
  const worker = await source("browser/src/worker.js");

  assert.match(worker, /env\.allowRemoteModels = false/);
  assert.match(worker, /env\.useBrowserCache = false/);
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

test("page offers the generated cross-specialty test pack", async () => {
  const html = await source("browser/index.html");
  const readme = await source("browser/public/test-data/README.txt");

  assert.match(html, /\.\/test-data\/synthetic-cross-specialty-notes\.txt/);
  assert.match(html, /Download the synthetic cross-specialty test pack/);
  assert.match(readme, /Twenty-one paste-ready cases/);
  assert.match(readme, /general medicine[\s\S]*nephrology\/dialysis/);
  assert.doesNotMatch(`${html}\n${readme}`, /synthetic-dialysis-notes\.txt/);
});

test("browser and installed interfaces use the same dark color scheme", async () => {
  const browserStyles = await source("browser/src/styles.css");
  const installedStyles = await source("src/med_data_cleaner/web/static/styles.css");
  const browserHtml = await source("browser/index.html");
  const installedHtml = await source("src/med_data_cleaner/web/static/index.html");

  for (const styles of [browserStyles, installedStyles]) {
    assert.match(styles, /color-scheme:\s*dark/);
    assert.doesNotMatch(styles, /color-scheme:\s*light/);
  }
  for (const html of [browserHtml, installedHtml]) {
    assert.match(html, /name="theme-color" content="#0b100e"/);
  }
});

test("build metadata is prominent and stale browser builds fail over to unique URLs", async () => {
  const html = await source("browser/index.html");
  const styles = await source("browser/src/styles.css");
  const app = await source("browser/src/app.js");
  const buildConfig = await source("browser/vite.config.js");

  assert.match(
    html,
    /<header class="app-header">[\s\S]*id="buildMeta"[\s\S]*id="versionLabel"[\s\S]*id="updatedLabel"[\s\S]*BROWSER-LOCAL PHI REVIEW/,
  );
  assert.match(html, /Cache-Control" content="no-cache, no-store, must-revalidate"/);
  assert.match(styles, /\.build-meta\s*\{[\s\S]*display: flex/);
  assert.match(app, /Version \$\{APPLICATION_VERSION\} · Build \$\{shortBuild\}/);
  assert.match(app, /Last updated \$\{formatBuildTimestamp\(BUILD_UPDATED_AT\)\}/);
  assert.match(app, /timeZoneName: "short"/);

  assert.match(app, /manifestUrl\.searchParams\.set\([\s\S]*"cacheBust"/);
  assert.match(app, /cache: "no-store"/);
  assert.match(app, /destination\.searchParams\.set\("version", version\)/);
  assert.match(app, /destination\.searchParams\.set\("refresh", Date\.now\(\)\.toString\(36\)\)/);
  assert.match(app, /window\.location\.replace\(destination\)/);
  assert.match(app, /state\.updateVersion = newVersion/);
  assert.match(app, /updateApplication\(state\.updateVersion \?\? "latest"\)/);
  assert.match(app, /window\.addEventListener\("pageshow", checkForUpdate\)/);
  assert.match(app, /window\.addEventListener\("online", checkForUpdate\)/);
  assert.match(app, /const UPDATE_CHECK_INTERVAL_MS = 60 \* 1_000/);

  assert.match(buildConfig, /assetFileNames: "assets\/\[name\]-\[hash\]\[extname\]"/);
  assert.match(buildConfig, /fileName: "version\.json"/);
  assert.match(buildConfig, /JSON\.stringify\(\{ version, appVersion, updatedAt \}\)/);
});

test("clipboard output is a review-gated action below file export", async () => {
  const html = await source("browser/index.html");
  const app = await source("browser/src/app.js");

  assert.match(
    html,
    /id="exportButton"[\s\S]*id="copyButton"[\s\S]*Copy de-identified text/,
  );
  assert.match(app, /elements\.copyButton\.disabled = elements\.exportButton\.disabled/);
  assert.match(app, /useVerifiedOutput[\s\S]*navigator\.clipboard\.writeText\(cleanedText\)/);
});

test("fast review is keyboard-accessible and learning remains memory-only", async () => {
  const html = await source("browser/index.html");
  const app = await source("browser/src/app.js");
  const review = await source("browser/src/review.js");

  assert.match(html, /aria-keyshortcuts="1"[\s\S]*aria-keyshortcuts="2"/);
  assert.match(html, /Forget learned clinical terms/);
  assert.match(app, /event\.key === "1"[\s\S]*event\.key === "2"/);
  assert.match(app, /card\.addEventListener\("focus"[\s\S]*checkbox\.tabIndex = -1/);
  assert.match(review, /finding\.entity_type === "LOCATION"/);
  assert.match(review, /browser-onnx:distilbert-ner/);
  assert.doesNotMatch(`${app}\n${review}`, /localStorage|sessionStorage|indexedDB/);
});

test("model downloads are revision-pinned and integrity-checked", async () => {
  const manifest = JSON.parse(await source("browser/model-manifest.json"));

  assert.match(manifest.source_revision, /^[0-9a-f]{40}$/);
  assert.equal(manifest.upstream_license, "Apache-2.0");
  assert(manifest.files.length >= 6);
  for (const file of manifest.files) assert.match(file.sha256, /^[0-9a-f]{64}$/);
});

test("Pages checks run on pull requests without deploying branch code", async () => {
  const workflow = await source(".github/workflows/pages.yml");

  assert.match(workflow, /\n  pull_request:\n/);
  assert.match(workflow, /\n  deploy:\n    if: github\.event_name != 'pull_request'/);
});
