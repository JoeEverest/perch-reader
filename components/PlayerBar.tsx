"use client";

import type { TtsState } from "@/lib/useTts";
import { VOICES, SPEEDS } from "@/lib/tts-protocol";
import { PlayIcon, PauseIcon, PrevIcon, NextIcon } from "./icons";

type Props = {
  state: TtsState;
  voice: string;
  speed: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (index: number) => void;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
};

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function PlayerBar({
  state,
  voice,
  speed,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onVoiceChange,
  onSpeedChange,
}: Props) {
  const {
    modelStatus,
    modelProgress,
    modelError,
    playing,
    buffering,
    currentIndex,
    generatedCount,
    total,
    finished,
    elapsed,
    totalEstimate,
  } = state;

  const playedFrac = total > 0 ? currentIndex / total : 0;
  const synthFrac = total > 0 ? generatedCount / total : 0;

  let status: React.ReactNode;
  if (modelStatus === "error") {
    status = <span className="busy">voice failed to load — {modelError}</span>;
  } else if (modelStatus === "loading") {
    status =
      modelProgress > 0 ? (
        <span className="busy">
          fetching the voice · {Math.round(modelProgress * 100)}% — cached after this, then fully offline
        </span>
      ) : (
        <span className="busy">looking for the voice…</span>
      );
  } else if (buffering) {
    status = <span className="busy">catching up…</span>;
  } else if (generatedCount < total) {
    status = (
      <span>
        synthesizing {generatedCount}/{total}
      </span>
    );
  } else if (finished) {
    status = <span>the end</span>;
  } else {
    status = <span>on device · ready</span>;
  }

  const handleRailClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (total === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.floor(frac * total));
  };

  return (
    <div className="dock">
      <div className="dock-inner">
        <div className="transport">
          <button className="icon-button" onClick={onPrev} aria-label="Previous sentence" disabled={total === 0}>
            <PrevIcon />
          </button>
          <button
            className="play-button"
            onClick={onToggle}
            aria-label={playing ? "Pause" : "Play"}
            disabled={total === 0 || modelStatus === "error"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-button" onClick={onNext} aria-label="Next sentence" disabled={total === 0}>
            <NextIcon />
          </button>
        </div>

        <div className="dock-middle">
          <div
            className="rail"
            onClick={handleRailClick}
            role="slider"
            aria-label="Position"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={currentIndex}
          >
            <div className="rail-synth" style={{ width: `${synthFrac * 100}%` }} />
            <div className="rail-played" style={{ width: `${playedFrac * 100}%` }} />
          </div>
          <div className="dock-status">
            {status}
            <span>
              {fmt(elapsed)} · ~{fmt(totalEstimate)}
            </span>
          </div>
        </div>

        <div className="dock-selects">
          <select
            className="dock-select"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            aria-label="Voice"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            className="dock-select"
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="Speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
