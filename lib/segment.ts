const MAX_SENTENCE_CHARS = 320;

function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_CHARS) return [sentence];
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_SENTENCE_CHARS) {
    const window = rest.slice(0, MAX_SENTENCE_CHARS);
    let cut = Math.max(
      window.lastIndexOf(", "),
      window.lastIndexOf("; "),
      window.lastIndexOf(": ")
    );
    if (cut < 80) cut = window.lastIndexOf(" ");
    if (cut < 1) cut = MAX_SENTENCE_CHARS;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function splitSentences(paragraph: string): string[] {
  let raw: string[];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    raw = Array.from(segmenter.segment(paragraph), (s) => s.segment.trim());
  } else {
    raw = paragraph.split(/(?<=[.!?…])\s+/);
  }

  const merged: string[] = [];
  for (const piece of raw) {
    const text = piece.trim();
    if (!text) continue;
    // glue tiny fragments (stray quotes, initials) onto the previous sentence
    if (text.length < 6 && merged.length > 0) {
      merged[merged.length - 1] += " " + text;
    } else {
      merged.push(text);
    }
  }
  return merged.flatMap(splitLong);
}

export function textToParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
