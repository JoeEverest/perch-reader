# Perch

Articles, read aloud — fully on your own machine.

Paste a link or some text and Perch reads it to you. Speech is generated locally in your browser by [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (Apache-2.0), running on WebGPU or WASM via [kokoro-js](https://github.com/hexgrad/kokoro). The ~90 MB voice model downloads once, is cached by the browser, and never sends your text anywhere.

- **From a link** — articles are fetched and cleaned with Mozilla Readability
- **Follow along** — the sentence being spoken is highlighted and auto-scrolls; click any sentence to jump there
- **Player** — pause, skip by sentence, scrub, 5 voices, 0.8×–1.5× speed

## Run it

```bash
npm install
npm run dev
```

Built with Next.js. Article extraction happens in a small API route; everything voice-related happens client-side in a web worker.

## Chrome extension

Perch is also a side-panel extension: open any article, click the Perch icon, listen. Extraction runs Readability directly on the page (no server at all), and the ONNX runtime is bundled inside the extension as Manifest V3 requires.

```bash
npm install
npm run build:extension
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`.

## License

Public domain ([Unlicense](LICENSE)) — do whatever you want with it.
