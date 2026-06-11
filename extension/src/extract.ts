import { Readability } from "@mozilla/readability";
import { blocksFromDocument } from "@/lib/blocks";

function extract() {
  try {
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    if (!article || !article.content) {
      return { ok: false as const, error: "Couldn't find a readable article on this page." };
    }
    const doc = new DOMParser().parseFromString(article.content, "text/html");
    const paragraphs = blocksFromDocument(doc);
    if (paragraphs.length === 0) {
      return { ok: false as const, error: "The article came back empty after cleanup." };
    }
    return {
      ok: true as const,
      title: article.title || document.title,
      byline: article.byline || null,
      siteName: article.siteName || location.hostname,
      paragraphs,
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

chrome.runtime.sendMessage({ type: "perch-extract-result", result: extract() });
