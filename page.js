(() => {
  const origin = new URL(chrome.runtime.getURL('')).origin;
  const host = document.createElement('howdy-chat');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
      .fab { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; width: 50px; height: 50px; border-radius: 0 60% 0 60%;
        background: #2340b8; color: #fbfaf6; box-shadow: 5px 4px 0 #ff5c9d, 0 10px 28px rgba(20, 26, 80, .28); cursor: pointer; display: grid; place-items: center;
        transition: rotate .2s ease, opacity .2s ease; }
      .fab:hover { rotate: -8deg; }
      .fab:focus-visible { outline: 2px dashed #ff5c9d; outline-offset: 4px; }
      .open .fab { opacity: 0; pointer-events: none; }
      .panel { position: fixed; top: 0; right: 0; z-index: 2147483647; width: min(420px, 100vw); height: 100vh;
        transform: translateX(105%); transition: transform .25s ease; box-shadow: -2px 0 0 #1e2a78, -14px 0 40px rgba(20, 26, 80, .22); }
      .open .panel { transform: none; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
    <div class="wrap">
      <button class="fab" title="Chat with Howdy" aria-label="Chat with Howdy">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
      </button>
      <div class="panel"></div>
    </div>`;
  const wrap = root.querySelector('.wrap');
  let frame, ready;

  function toggle(open) {
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.src = chrome.runtime.getURL('chat.html');
      ready = new Promise((r) => frame.addEventListener('load', r, { once: true }));
      root.querySelector('.panel').append(frame);
    }
    wrap.classList.toggle('open', open);
    if (open) ready.then(() => frame.contentWindow.postMessage({ howdy: 'focus' }, origin));
  }

  root.querySelector('.fab').onclick = () => toggle(true);
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    if (e.data?.howdy === 'close') toggle(false);
    if (e.data?.howdy === 'context') {
      const text = document.body?.innerText.slice(0, 15000) ?? '';
      frame.contentWindow.postMessage({ howdy: 'context', url: location.href, title: document.title, text }, origin);
    }
  });
  // Only reachable from Howdy's own pages: in a content script this global lives in the isolated world.
  globalThis.howdyAsk = (prompt) => {
    toggle(true);
    ready.then(() => frame.contentWindow.postMessage({ howdy: 'ask', prompt }, origin));
  };
  document.documentElement.append(host);
})();
