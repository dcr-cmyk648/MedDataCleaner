import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

function resolveVersion() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (_error) {
    return "development";
  }
}

function resolveUpdatedAt() {
  if (process.env.MDC_BUILD_UPDATED_AT) return process.env.MDC_BUILD_UPDATED_AT;
  try {
    return execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (_error) {
    return new Date().toISOString();
  }
}

const version = resolveVersion();
const appVersion = packageMetadata.version;
const updatedAt = resolveUpdatedAt();

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  base: "./",
  define: {
    __MDC_APP_VERSION__: JSON.stringify(appVersion),
    __MDC_UPDATED_AT__: JSON.stringify(updatedAt),
    __MDC_VERSION__: JSON.stringify(version),
  },
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  build: {
    outDir: "../dist/pages",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  plugins: [
    {
      name: "med-data-cleaner-version-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: `${JSON.stringify({ version, appVersion, updatedAt })}\n`,
        });
      },
    },
  ],
});
