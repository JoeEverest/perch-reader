import { NextResponse } from "next/server";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

export const runtime = "nodejs";

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, pre, figcaption";

function htmlToParagraphs(html: string): string[] {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { virtualConsole });
  const blocks = dom.window.document.querySelectorAll(BLOCK_SELECTOR);
  const paragraphs: string[] = [];
  for (const el of blocks) {
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    const text = el.textContent?.replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

export async function POST(req: Request) {
  let url: string;
  try {
    ({ url } = await req.json());
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return NextResponse.json(
      { error: "That doesn't look like a valid link." },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 PerchReader/0.1",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The site answered with ${res.status}. It may be blocking readers.` },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that address. Check the link and your connection." },
      { status: 502 }
    );
  }

  try {
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(html, { url, virtualConsole });
    const article = new Readability(dom.window.document).parse();
    if (!article || !article.content) {
      return NextResponse.json(
        { error: "Couldn't find a readable article on that page." },
        { status: 422 }
      );
    }
    const paragraphs = htmlToParagraphs(article.content);
    if (paragraphs.length === 0) {
      return NextResponse.json(
        { error: "The article came back empty after cleanup." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      title: article.title || new URL(url).hostname,
      byline: article.byline || null,
      siteName: article.siteName || new URL(url).hostname,
      paragraphs,
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong while extracting the article." },
      { status: 500 }
    );
  }
}
