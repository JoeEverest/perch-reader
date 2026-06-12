"use client";

import { useEffect, useRef, useState } from "react";

export type Article = {
  title: string;
  byline: string | null;
  siteName: string | null;
  paragraphs: string[][]; // sentences per paragraph
};

type Props = {
  article: Article;
  paraOffsets: number[];
  currentIndex: number;
  playing: boolean;
  listenEstimate: string;
  onSeek: (index: number) => void;
  onBack: () => void;
  onRefresh?: () => void;
};

export function ArticleView({
  article,
  paraOffsets,
  currentIndex,
  playing,
  listenEstimate,
  onSeek,
  onBack,
  onRefresh,
}: Props) {
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    const breakFollow = () => {
      if (followRef.current) setFollow(false);
    };
    window.addEventListener("wheel", breakFollow, { passive: true });
    window.addEventListener("touchmove", breakFollow, { passive: true });
    return () => {
      window.removeEventListener("wheel", breakFollow);
      window.removeEventListener("touchmove", breakFollow);
    };
  }, []);

  useEffect(() => {
    if (!follow || !playing) return;
    document
      .getElementById(`s-${currentIndex}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentIndex, follow, playing]);

  return (
    <main className="article">
      <div className="article-actions">
        <button className="article-back" onClick={onBack}>
          ← New article
        </button>
        {onRefresh && (
          <button className="article-back" onClick={onRefresh}>
            ↻ Read this page
          </button>
        )}
      </div>
      <h1 className="article-title">{article.title}</h1>
      <div className="article-meta">
        {article.siteName && <span>{article.siteName}</span>}
        {article.siteName && article.byline && <span className="sep">·</span>}
        {article.byline && <span>{article.byline}</span>}
        {(article.siteName || article.byline) && <span className="sep">·</span>}
        <span>{listenEstimate} listen</span>
      </div>
      <div className="article-body">
        {article.paragraphs.map((sentences, p) => (
          <p key={p}>
            {sentences.map((sentence, s) => {
              const index = paraOffsets[p] + s;
              const cls =
                index === currentIndex
                  ? "sentence is-current"
                  : index < currentIndex
                    ? "sentence is-played"
                    : "sentence";
              return (
                <span key={s}>
                  <span
                    id={`s-${index}`}
                    className={cls}
                    onClick={() => {
                      setFollow(true);
                      onSeek(index);
                    }}
                  >
                    {sentence}
                  </span>{" "}
                </span>
              );
            })}
          </p>
        ))}
      </div>
      {!follow && playing && (
        <button
          className="follow-pill"
          onClick={() => {
            setFollow(true);
            document
              .getElementById(`s-${currentIndex}`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
        >
          ↓ Back to the voice
        </button>
      )}
    </main>
  );
}
