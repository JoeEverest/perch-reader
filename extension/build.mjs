import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "extension", "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  platform: "browser",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  outdir: dist,
  jsx: "automatic",
  logLevel: "info",
};

// extension pages and the worker are ES modules
await esbuild.build({
  ...common,
  format: "esm",
  entryPoints: {
    panel: path.join(root, "extension", "src", "panel.tsx"),
    background: path.join(root, "extension", "src", "background.ts"),
    "tts-worker": path.join(root, "lib", "tts.worker.ts"),
  },
});

// content scripts must be classic scripts
await esbuild.build({
  ...common,
  format: "iife",
  entryPoints: { extract: path.join(root, "extension", "src", "extract.ts") },
});

cpSync(path.join(root, "extension", "static"), dist, { recursive: true });
cpSync(path.join(root, "app", "globals.css"), path.join(dist, "base.css"));

// MV3 forbids remote code: ship the ONNX runtime inside the extension
const ortDist = path.join(root, "node_modules", "onnxruntime-web", "dist");
mkdirSync(path.join(dist, "ort"), { recursive: true });
for (const f of [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  cpSync(path.join(ortDist, f), path.join(dist, "ort", f));
}

console.log("extension built at", dist);
