// an earlier build set this to true and Chrome persists it; it swallows
// action clicks so onClicked never fires — explicitly reset on every start
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

type ExtractEntry =
  | { status: "pending"; t: number }
  | { status: "done"; t: number; result: unknown };

function setEntry(entry: ExtractEntry) {
  return chrome.storage.session.set({ extract: entry });
}

async function runExtract(tabId: number) {
  await setEntry({ status: "pending", t: Date.now() });
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["extract.js"],
    });
    // extract.js reports back via the perch-extract-result message
  } catch (err) {
    await setEntry({
      status: "done",
      t: Date.now(),
      result: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null || tab.windowId == null) return;
  // open() must run inside the user-gesture context — don't await anything first
  void chrome.sidePanel.open({ tabId: tab.id });
  void runExtract(tab.id);
});

chrome.runtime.onMessage.addListener((msg: { type?: string; result?: unknown }) => {
  if (msg?.type === "perch-extract-result") {
    void setEntry({ status: "done", t: Date.now(), result: msg.result });
  } else if (msg?.type === "perch-request-extract") {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id != null) {
        await runExtract(tab.id);
      } else {
        await setEntry({
          status: "done",
          t: Date.now(),
          result: { ok: false, error: "Couldn't find the active tab." },
        });
      }
    })();
  }
});
