#!/usr/bin/env python3
"""Prepare verified, gitignored model and WebAssembly assets for the Pages build."""

from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "browser" / "model-manifest.json"
PUBLIC_DIR = ROOT / "browser" / "public"
MODEL_DIR = PUBLIC_DIR / "models"
WASM_SOURCE_DIR = ROOT / "node_modules" / "onnxruntime-web" / "dist"
WASM_DESTINATION_DIR = PUBLIC_DIR / "wasm"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_verified(url: str, destination: Path, expected_sha256: str) -> None:
    if destination.is_file() and sha256(destination) == expected_sha256:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(f"{destination.suffix}.download")
    temporary.unlink(missing_ok=True)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "MedDataCleaner-build/1"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as out:
            shutil.copyfileobj(response, out)
        if sha256(temporary) != expected_sha256:
            raise RuntimeError(f"Integrity check failed for {destination.name}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_model() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    repository = manifest["source_repository"]
    revision = manifest["source_revision"]
    destination_root = MODEL_DIR / manifest["model_id"]
    base_url = f"https://huggingface.co/{repository}/resolve/{revision}/"

    for file_spec in manifest["files"]:
        relative_path = Path(file_spec["path"])
        destination = destination_root / relative_path
        download_verified(base_url + relative_path.as_posix(), destination, file_spec["sha256"])


def prepare_wasm() -> None:
    if not WASM_SOURCE_DIR.is_dir():
        raise RuntimeError("onnxruntime-web is missing; run npm install before building")

    wasm_files = [
        WASM_SOURCE_DIR / "ort-wasm-simd-threaded.jsep.mjs",
        WASM_SOURCE_DIR / "ort-wasm-simd-threaded.jsep.wasm",
    ]
    if not all(source.is_file() for source in wasm_files):
        raise RuntimeError("onnxruntime-web did not provide the required WebAssembly runtime")

    WASM_DESTINATION_DIR.mkdir(parents=True, exist_ok=True)
    expected_names = {source.name for source in wasm_files}
    for stale_file in WASM_DESTINATION_DIR.glob("ort-wasm*"):
        if stale_file.name not in expected_names:
            stale_file.unlink()
    for source in wasm_files:
        destination = WASM_DESTINATION_DIR / source.name
        if not destination.exists() or sha256(destination) != sha256(source):
            shutil.copy2(source, destination)


def main() -> None:
    prepare_model()
    prepare_wasm()
    print("Verified browser model and WebAssembly assets are ready.")


if __name__ == "__main__":
    main()
