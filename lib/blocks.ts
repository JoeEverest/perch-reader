export const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, pre, figcaption";

export function blocksFromDocument(doc: {
  querySelectorAll: (sel: string) => ArrayLike<{ querySelector(sel: string): unknown; textContent: string | null }>;
}): string[] {
  const blocks = doc.querySelectorAll(BLOCK_SELECTOR);
  const paragraphs: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i];
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    const text = el.textContent?.replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}
