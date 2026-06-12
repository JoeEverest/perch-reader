import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTts } from "@/lib/useTts";
import { splitSentences, textToParagraphs } from "@/lib/segment";
import { ArticleView, type Article } from "@/components/ArticleView";
import { PlayerBar } from "@/components/PlayerBar";
import { PerchOrnament } from "@/components/icons";

type Phase = "extracting" | "input" | "reading";

type ExtractResult =
  | { ok: true; title: string; byline: string | null; siteName: string | null; paragraphs: string[] }
  | { ok: false; error: string };

type ExtractEntry =
  | { status: "pending"; t: number }
  | { status: "done"; t: number; result: ExtractResult };

function createExtensionWorker() {
  return new Worker(chrome.runtime.getURL("tts-worker.js"), { type: "module" });
}

function PerchPanel() {
  const [phase, setPhase] = useState<Phase>("extracting");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [article, setArticle] = useState<Article | null>(null);
  const [voice, setVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1.0);
  const pendingTimer = useRef<number | undefined>(undefined);

  const tts = useTts(voice, speed, createExtensionWorker);

  const beginReading = (a: Article) => {
    const flat = a.paragraphs.flat();
    if (flat.length === 0) {
      setError("There's nothing to read there.");
      setPhase("input");
      return;
    }
    setError(null);
    setArticle(a);
    setPhase("reading");
    tts.load(flat, false);
  };

  // the background worker extracts on icon click and reports via session storage
  const applyEntryRef = useRef<(entry: ExtractEntry | undefined, initial: boolean) => void>(
    () => {}
  );
  applyEntryRef.current = (entry, initial) => {
    clearTimeout(pendingTimer.current);
    if (!entry) {
      setPhase("input");
      return;
    }
    if (entry.status === "pending") {
      setError(null);
      setPhase("extracting");
      pendingTimer.current = window.setTimeout(() => {
        setError("The page didn't answer. Try clicking the Perch icon again on the article tab.");
        setPhase("input");
      }, 10000);
      return;
    }
    if (initial && Date.now() - entry.t > 60_000) {
      // an old result from a previous session — don't start reading it unasked
      setPhase("input");
      return;
    }
    if (entry.result.ok) {
      beginReading({
        title: entry.result.title,
        byline: entry.result.byline,
        siteName: entry.result.siteName,
        paragraphs: entry.result.paragraphs.map(splitSentences).filter((p) => p.length > 0),
      });
    } else {
      setError(`${entry.result.error} — try clicking the Perch icon while on the article.`);
      setPhase("input");
    }
  };

  useEffect(() => {
    chrome.storage.session
      .get("extract")
      .then(({ extract }) => applyEntryRef.current(extract as ExtractEntry | undefined, true));
    const onChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "session" && changes.extract) {
        applyEntryRef.current(changes.extract.newValue as ExtractEntry | undefined, false);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const extractFromPage = () => {
    setPhase("extracting");
    setError(null);
    void chrome.runtime.sendMessage({ type: "perch-request-extract" });
  };

  const handleText = () => {
    const paragraphs = textToParagraphs(text);
    if (paragraphs.length === 0) return;
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
          <span className="topbar-device">kokoro-82m · {tts.state.device} · on device</span>
        )}
      </header>

      {phase === "extracting" && (
        <main className="fetching">
          Reading this page…
          <span className="url">looking for the article</span>
        </main>
      )}

      {phase === "input" && (
        <main className="landing panel-landing">
          <PerchOrnament />
          <h1>Read aloud.</h1>
          <p className="landing-sub">
            Open an article, then click the Perch icon — or paste text below.
          </p>
          <div className="intake">
            <div className="intake-body">
              <button className="go-button" onClick={extractFromPage}>
                Read this page
              </button>
              <textarea
                className="text-input"
                placeholder="…or paste anything here"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button className="go-button" onClick={handleText} disabled={!text.trim()}>
                Read it to me
              </button>
              {error && <p className="intake-error">{error}</p>}
            </div>
          </div>
          <p className="landing-note">
            Speech is generated locally by <strong>Kokoro-82M</strong> — the voice is cached
            on first use, then Perch reads fully offline. Nothing leaves your machine.
          </p>
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

createRoot(document.getElementById("root")!).render(<PerchPanel />);
