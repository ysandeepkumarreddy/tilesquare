/* Background service worker — handles CORS-blocked ICS fetches */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'FETCH_ICS') return false;
  fetch(msg.url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => sendResponse({ ok: true, text }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; /* keep message channel open for async response */
});
