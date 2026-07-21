import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

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

const version = resolveVersion();

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  base: "./",
  define: {
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
          source: `${JSON.stringify({ version })}\n`,
        });
      },
    },
  ],
});
