"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MainToWorker, WorkerToMain } from "./tts-protocol";

export type ModelStatus = "loading" | "ready" | "error";

export type TtsState = {
  modelStatus: ModelStatus;
  modelProgress: number; // 0..1
  device: string | null;
  modelError: string | null;
  playing: boolean;
  buffering: boolean;
  currentIndex: number;
  generatedCount: number;
  total: number;
  finished: boolean;
  elapsed: number; // seconds, estimated
  totalEstimate: number; // seconds, estimated
};

const DEFAULT_SECONDS_PER_CHAR = 0.062;

function defaultCreateWorker() {
  return new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
}

export function useTts(voice: string, speed: number, createWorker: () => Worker = defaultCreateWorker) {
  const workerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const buffersRef = useRef<(AudioBuffer | null)[]>([]);
  const genRef = useRef(0);
  const playingRef = useRef(false);
  const waitingRef = useRef(false);
  const currentRef = useRef(0);
  const sentenceStartRef = useRef(0);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const progressFilesRef = useRef(new Map<string, { loaded: number; total: number }>());

  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [modelProgress, setModelProgress] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [totalEstimate, setTotalEstimate] = useState(0);

  voiceRef.current = voice;
  speedRef.current = speed;

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  const send = useCallback((msg: MainToWorker) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const secondsPerChar = useCallback(() => {
    let knownSec = 0;
    let knownChars = 0;
    buffersRef.current.forEach((buf, i) => {
      if (buf && buf.duration > 0.15) {
        knownSec += buf.duration;
        knownChars += sentencesRef.current[i].length;
      }
    });
    return knownChars > 40 ? knownSec / knownChars : DEFAULT_SECONDS_PER_CHAR / speedRef.current;
  }, []);

  const estimateUpTo = useCallback(
    (index: number) => {
      const rate = secondsPerChar();
      let sec = 0;
      for (let i = 0; i < index && i < sentencesRef.current.length; i++) {
        sec += sentencesRef.current[i].length * rate;
      }
      return sec;
    },
    [secondsPerChar]
  );

  const refreshEstimates = useCallback(() => {
    setTotalEstimate(estimateUpTo(sentencesRef.current.length));
  }, [estimateUpTo]);

  const stopSource = useCallback(() => {
    const src = sourceRef.current;
    if (src) {
      sourceRef.current = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  const startSentence = useCallback(
    (index: number) => {
      currentRef.current = index;
      setCurrentIndex(index);
      if (index >= sentencesRef.current.length) {
        playingRef.current = false;
        setPlaying(false);
        setBuffering(false);
        setFinished(true);
        return;
      }
      const buf = buffersRef.current[index];
      if (!buf) {
        waitingRef.current = true;
        setBuffering(true);
        return;
      }
      waitingRef.current = false;
      setBuffering(false);
      const ctx = getCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      sentenceStartRef.current = ctx.currentTime;
      src.onended = () => {
        if (sourceRef.current === src) {
          sourceRef.current = null;
          if (playingRef.current) startSentence(index + 1);
        }
      };
      sourceRef.current = src;
      src.start();
    },
    [getCtx]
  );

  const requeueMissingFrom = useCallback(
    (index: number) => {
      const n = sentencesRef.current.length;
      const items: { index: number; text: string }[] = [];
      for (let i = index; i < n; i++) {
        if (!buffersRef.current[i]) items.push({ index: i, text: sentencesRef.current[i] });
      }
      for (let i = 0; i < index; i++) {
        if (!buffersRef.current[i]) items.push({ index: i, text: sentencesRef.current[i] });
      }
      send({ type: "clear" });
      if (items.length > 0) {
        send({
          type: "enqueue",
          gen: genRef.current,
          voice: voiceRef.current,
          speed: speedRef.current,
          items,
        });
      }
    },
    [send]
  );

  // worker lifecycle
  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
      const msg = event.data;
      if (msg.type === "model-progress") {
        progressFilesRef.current.set(msg.file, { loaded: msg.loaded, total: msg.total });
        let loaded = 0;
        let totalBytes = 0;
        for (const f of progressFilesRef.current.values()) {
          loaded += f.loaded;
          totalBytes += f.total;
        }
        if (totalBytes > 0) setModelProgress(Math.min(1, loaded / totalBytes));
      } else if (msg.type === "ready") {
        // enqueue messages sent before this point are buffered by the worker,
        // so there is nothing to re-send here
        setModelStatus("ready");
        setDevice(msg.device);
      } else if (msg.type === "init-error") {
        setModelStatus("error");
        setModelError(msg.message);
      } else if (msg.type === "chunk" || msg.type === "chunk-error") {
        if (msg.gen !== genRef.current) return;
        const ctx = getCtx();
        let buf: AudioBuffer;
        if (msg.type === "chunk" && msg.audio.length > 0) {
          buf = ctx.createBuffer(1, msg.audio.length, msg.sampleRate);
          buf.copyToChannel(msg.audio as Float32Array<ArrayBuffer>, 0);
        } else {
          buf = ctx.createBuffer(1, Math.round(0.1 * ctx.sampleRate), ctx.sampleRate);
        }
        const isNew = buffersRef.current[msg.index] === null;
        buffersRef.current[msg.index] = buf;
        if (isNew) setGeneratedCount((c) => c + 1);
        if (waitingRef.current && msg.index === currentRef.current && playingRef.current) {
          startSentence(msg.index);
        }
      }
    };

    worker.postMessage({ type: "init" } satisfies MainToWorker);
    return () => {
      worker.terminate();
      workerRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // elapsed/estimate ticker
  useEffect(() => {
    const id = setInterval(() => {
      if (sentencesRef.current.length === 0) return;
      const ctx = ctxRef.current;
      let within = 0;
      if (ctx && sourceRef.current) {
        within = Math.max(0, ctx.currentTime - sentenceStartRef.current);
      }
      setElapsed(estimateUpTo(currentRef.current) + within);
      refreshEstimates();
    }, 400);
    return () => clearInterval(id);
  }, [estimateUpTo, refreshEstimates]);

  const load = useCallback(
    (sentences: string[], autoplay = true) => {
      genRef.current += 1;
      sentencesRef.current = sentences;
      buffersRef.current = new Array(sentences.length).fill(null);
      currentRef.current = 0;
      waitingRef.current = true;
      stopSource();
      setCurrentIndex(0);
      setGeneratedCount(0);
      setTotal(sentences.length);
      setFinished(false);
      setElapsed(0);
      playingRef.current = autoplay;
      setPlaying(autoplay);
      setBuffering(autoplay && sentences.length > 0);
      if (autoplay) void getCtx().resume();
      refreshEstimates();
      send({ type: "clear" });
      send({
        type: "enqueue",
        gen: genRef.current,
        voice: voiceRef.current,
        speed: speedRef.current,
        items: sentences.map((text, index) => ({ index, text })),
      });
    },
    [getCtx, refreshEstimates, send, stopSource]
  );

  const play = useCallback(() => {
    if (sentencesRef.current.length === 0) return;
    setFinished(false);
    playingRef.current = true;
    setPlaying(true);
    void getCtx().resume();
    if (!sourceRef.current) {
      const index = currentRef.current >= sentencesRef.current.length ? 0 : currentRef.current;
      startSentence(index);
    }
  }, [getCtx, startSentence]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    void ctxRef.current?.suspend();
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (index: number) => {
      const n = sentencesRef.current.length;
      if (n === 0) return;
      const clamped = Math.max(0, Math.min(n - 1, index));
      setFinished(false);
      stopSource();
      if (!buffersRef.current[clamped]) requeueMissingFrom(clamped);
      if (playingRef.current) {
        void getCtx().resume();
        startSentence(clamped);
      } else {
        currentRef.current = clamped;
        setCurrentIndex(clamped);
        setBuffering(false);
        waitingRef.current = false;
      }
    },
    [getCtx, requeueMissingFrom, startSentence, stopSource]
  );

  const next = useCallback(() => seek(currentRef.current + 1), [seek]);
  const prev = useCallback(() => seek(currentRef.current - 1), [seek]);

  // voice or speed changed: drop generated audio, resynthesize from current spot
  const regenerate = useCallback(() => {
    if (sentencesRef.current.length === 0) return;
    genRef.current += 1;
    buffersRef.current = new Array(sentencesRef.current.length).fill(null);
    setGeneratedCount(0);
    stopSource();
    if (playingRef.current) {
      waitingRef.current = true;
      setBuffering(true);
    }
    requeueMissingFrom(currentRef.current);
  }, [requeueMissingFrom, stopSource]);

  const prevSettings = useRef({ voice, speed });
  useEffect(() => {
    if (prevSettings.current.voice !== voice || prevSettings.current.speed !== speed) {
      prevSettings.current = { voice, speed };
      regenerate();
    }
  }, [voice, speed, regenerate]);

  const reset = useCallback(() => {
    genRef.current += 1;
    sentencesRef.current = [];
    buffersRef.current = [];
    currentRef.current = 0;
    playingRef.current = false;
    waitingRef.current = false;
    stopSource();
    send({ type: "clear" });
    setPlaying(false);
    setBuffering(false);
    setCurrentIndex(0);
    setGeneratedCount(0);
    setTotal(0);
    setFinished(false);
    setElapsed(0);
    setTotalEstimate(0);
  }, [send, stopSource]);

  const state: TtsState = {
    modelStatus,
    modelProgress,
    device,
    modelError,
    playing,
    buffering,
    currentIndex,
    generatedCount,
    total,
    finished,
    elapsed,
    totalEstimate,
  };

  return { state, load, play, pause, toggle, seek, next, prev, reset };
}
