import { env, pipeline } from "@huggingface/transformers";

import { BrowserNerDetector } from "./ner.js";
import { deidentify } from "./pipeline.js";

let nerDetector = null;
let initialized = false;

async function initialize(baseUrl) {
  if (initialized) return Boolean(nerDetector?.ready);
  initialized = true;

  const applicationBase = new URL(baseUrl);
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;
  env.localModelPath = new URL("models/", applicationBase).href;
  env.backends.onnx.wasm.wasmPaths = new URL("wasm/", applicationBase).href;
  env.backends.onnx.wasm.numThreads = 1;

  try {
    const classifier = await pipeline("token-classification", "distilbert-ner", {
      device: "wasm",
      dtype: "int8",
      progress_callback(progress) {
        const percentage = Number(progress?.progress);
        if (Number.isFinite(percentage)) {
          self.postMessage({ type: "model-progress", progress: percentage / 100 });
        }
      },
    });
    nerDetector = new BrowserNerDetector(classifier);
  } catch (_error) {
    nerDetector = null;
  }
  return Boolean(nerDetector?.ready);
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "initialize") {
    const ready = await initialize(message.baseUrl);
    self.postMessage({ type: "initialized", ready });
    return;
  }

  if (message.type !== "analyze" || !Number.isInteger(message.id)) return;
  try {
    const result = await deidentify({
      text: message.text,
      excludedFindingIds: message.excludedFindingIds,
      manualFindings: message.manualFindings,
      nerDetector,
      progressCallback(progress) {
        self.postMessage({ type: "analysis-progress", id: message.id, progress });
      },
    });
    self.postMessage({ type: "analysis-result", id: message.id, result });
  } catch (_error) {
    self.postMessage({
      type: "analysis-error",
      id: message.id,
      message: "The local browser operation could not be completed.",
    });
  }
});
