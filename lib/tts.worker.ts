/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";
import type { MainToWorker, WorkerToMain, SynthesisJob } from "./tts-protocol";

declare const self: DedicatedWorkerGlobalScope;

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let tts: KokoroTTS | null = null;
let pumping = false;

type QueuedJob = SynthesisJob & { gen: number; voice: string; speed: number };
const queue: QueuedJob[] = [];

function post(msg: WorkerToMain, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function loadModel(device: "webgpu" | "wasm") {
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: device === "webgpu" ? "fp32" : "q8",
    device,
    progress_callback: (p: unknown) => {
      const info = p as { status: string; file?: string; loaded?: number; total?: number };
      if (info.status === "progress" && info.file && info.total) {
        post({
          type: "model-progress",
          file: info.file,
          loaded: info.loaded ?? 0,
          total: info.total,
        });
      }
    },
  });
}

async function init() {
  const hasWebGPU = "gpu" in (self.navigator ?? {});
  try {
    if (hasWebGPU) {
      tts = await loadModel("webgpu");
      post({ type: "ready", device: "webgpu" });
      pump();
      return;
    }
  } catch {
    // fall through to wasm
  }
  try {
    tts = await loadModel("wasm");
    post({ type: "ready", device: "wasm" });
    pump();
  } catch (err) {
    post({ type: "init-error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function pump() {
  if (pumping || !tts) return;
  pumping = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      const result = await tts.generate(job.text, {
        voice: job.voice as never,
        speed: job.speed,
      });
      const audio = result.audio as Float32Array;
      post(
        {
          type: "chunk",
          gen: job.gen,
          index: job.index,
          audio,
          sampleRate: result.sampling_rate,
        },
        [audio.buffer as ArrayBuffer]
      );
    } catch (err) {
      post({
        type: "chunk-error",
        gen: job.gen,
        index: job.index,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  pumping = false;
}

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  if (msg.type === "init") {
    void init();
  } else if (msg.type === "clear") {
    queue.length = 0;
  } else if (msg.type === "enqueue") {
    for (const item of msg.items) {
      queue.push({ ...item, gen: msg.gen, voice: msg.voice, speed: msg.speed });
    }
    void pump();
  }
};
