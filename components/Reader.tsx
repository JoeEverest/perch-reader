"use client";

import { useMemo, useState } from "react";
import { useTts } from "@/lib/useTts";
import { splitSentences, textToParagraphs } from "@/lib/segment";
import { ArticleView, type Article } from "./ArticleView";
import { PlayerBar } from "./PlayerBar";
import { PerchOrnament } from "./icons";

type Phase = "input" | "fetching" | "reading";
type Mode = "link" | "text";

export function Reader() {
  const [phase, setPhase] = useState<Phase>("input");
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [voice, setVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1.0);

  const tts = useTts(voice, speed);

  const paraOffsets = useMemo(() => {
    if (!article) return [];
    const offsets: number[] = [];
    let n = 0;
    for (const sentences of article.paragraphs) {
      offsets.push(n);
      n += sentences.length;
    }
    return offsets;
  }, [article]);

  const beginReading = (a: Article) => {
    const flat = a.paragraphs.flat();
    if (flat.length === 0) {
      setError("There's nothing to read there.");
      setPhase("input");
      return;
    }
    setArticle(a);
    setPhase("reading");
    tts.load(flat, true);
  };

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setError(null);
    setPhase("fetching");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: withProtocol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't fetch that article.");
        setPhase("input");
        return;
      }
      beginReading({
        title: data.title,
        byline: data.byline,
        siteName: data.siteName,
        paragraphs: (data.paragraphs as string[]).map(splitSentences).filter((p) => p.length > 0),
      });
    } catch {
      setError("Couldn't reach the extractor. Is the app still running?");
      setPhase("input");
    }
  };

  const handleText = () => {
    const paragraphs = textToParagraphs(text);
    if (paragraphs.length === 0) return;
    setError(null);
    const firstWords = paragraphs[0].split(" ").slice(0, 8).join(" ");
    beginReading({
      title: firstWords.length < paragraphs[0].length ? `${firstWords}…` : firstWords,
      byline: null,
      siteName: "Pasted text",
      paragraphs: paragraphs.map(splitSentences).filter((p) => p.length > 0),
    });
  };

  const handleBack = () => {
    tts.reset();
    setArticle(null);
    setPhase("input");
  };

  const listenEstimate = useMemo(() => {
    const min = Math.max(1, Math.round(tts.state.totalEstimate / 60));
    return `~${min} min`;
  }, [tts.state.totalEstimate]);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="wordmark" onClick={handleBack}>
          Perch
        </button>
        {tts.state.device && (
          <span className="topbar-device">
            kokoro-82m · {tts.state.device} · on device
          </span>
        )}
      </header>

      {phase === "input" && (
        <main className="landing">
          <PerchOrnament />
          <h1>Articles, read aloud.</h1>
          <p className="landing-sub">
            Paste a link or some text. A voice living on your own machine reads it to
            you — nothing is sent to anyone.
          </p>

          <div className="intake">
            <div className="intake-tabs" role="tablist">
              <button
                className="intake-tab"
                role="tab"
                aria-selected={mode === "link"}
                onClick={() => setMode("link")}
              >
                From a link
              </button>
              <button
                className="intake-tab"
                role="tab"
                aria-selected={mode === "text"}
                onClick={() => setMode("text")}
              >
                From text
              </button>
            </div>

            <div className="intake-body">
              {mode === "link" ? (
                <div className="url-row">
                  <input
                    className="url-input"
                    type="url"
                    placeholder="https://example.com/some-article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  />
                  <button className="go-button" onClick={handleFetch} disabled={!url.trim()}>
                    Fetch &amp; read
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    className="text-input"
                    placeholder="Paste anything — an essay, an email, a chapter…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="go-button" onClick={handleText} disabled={!text.trim()}>
                    Read it to me
                  </button>
                </>
              )}
              {error && <p className="intake-error">{error}</p>}
            </div>
          </div>

          <p className="landing-note">
            Speech is generated locally by <strong>Kokoro-82M</strong>, an open-source
            model running in your browser
            {tts.state.modelStatus === "loading" && tts.state.modelProgress > 0 ? (
              <>
                {" "}
                — downloading the voice now ({Math.round(tts.state.modelProgress * 100)}%).
                It's cached after this,
              </>
            ) : (
              <> — the voice is cached on first visit,</>
            )}{" "}
            then Perch reads fully offline.
          </p>
        </main>
      )}

      {phase === "fetching" && (
        <main className="fetching">
          Fetching the article…
          <span className="url">{url}</span>
        </main>
      )}

      {phase === "reading" && article && (
        <>
          <ArticleView
            article={article}
            paraOffsets={paraOffsets}
            currentIndex={tts.state.currentIndex}
            playing={tts.state.playing}
            listenEstimate={listenEstimate}
            onSeek={tts.seek}
            onBack={handleBack}
          />
          <PlayerBar
            state={tts.state}
            voice={voice}
            speed={speed}
            onToggle={tts.toggle}
            onPrev={tts.prev}
            onNext={tts.next}
            onSeek={tts.seek}
            onVoiceChange={setVoice}
            onSpeedChange={setSpeed}
          />
        </>
      )}
    </div>
  );
}
