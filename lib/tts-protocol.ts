export type SynthesisJob = { index: number; text: string };

export type MainToWorker =
  | { type: "init" }
  | { type: "clear" }
  | {
      type: "enqueue";
      gen: number;
      voice: string;
      speed: number;
      items: SynthesisJob[];
    };

export type WorkerToMain =
  | { type: "model-progress"; file: string; loaded: number; total: number }
  | { type: "ready"; device: string }
  | { type: "init-error"; message: string }
  | {
      type: "chunk";
      gen: number;
      index: number;
      audio: Float32Array;
      sampleRate: number;
    }
  | { type: "chunk-error"; gen: number; index: number; message: string };

export const VOICES = [
  { id: "af_heart", label: "Heart · US warm" },
  { id: "af_bella", label: "Bella · US bright" },
  { id: "am_michael", label: "Michael · US low" },
  { id: "bf_emma", label: "Emma · UK soft" },
  { id: "bm_george", label: "George · UK stately" },
] as const;

export const SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5] as const;
