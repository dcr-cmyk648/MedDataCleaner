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
