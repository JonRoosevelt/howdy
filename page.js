(() => {
  const origin = new URL(chrome.runtime.getURL('')).origin;
  const host = document.createElement('howdy-chat');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
      .fab { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; width: 50px; height: 50px; border-radius: 0 60% 0 60%;
        background: var(--howdy-blue, #2340b8); color: var(--howdy-on-blue, #fbfaf6); box-shadow: 5px 4px 0 var(--howdy-pink, #ff5c9d), 0 10px 28px rgba(20, 26, 80, .28); cursor: pointer; display: grid; place-items: center; touch-action: none; user-select: none;
        transition: rotate .2s ease, opacity .2s ease; }
      .fab.placed { right: auto; bottom: auto; left: calc(8px + (100% - 66px) * var(--x)); top: calc(8px + (100% - 66px) * var(--y)); }
      .fab.dragging { cursor: grabbing; rotate: -8deg; }
      .fab:hover { rotate: -8deg; }
      .fab:focus-visible { outline: 2px dashed var(--howdy-pink, #ff5c9d); outline-offset: 4px; }
      .open .fab { opacity: 0; pointer-events: none; }
      .panel { position: fixed; top: 0; right: 0; z-index: 2147483647; width: min(420px, 100vw); height: 100vh;
        transform: translateX(105%); transition: transform .25s ease; box-shadow: -2px 0 0 var(--howdy-ink, #1e2a78), -14px 0 40px rgba(20, 26, 80, .22); }
      .open .panel { transform: none; }
      iframe { border: 0; width: 100%; height: 100%; display: block; }
    </style>
    <div class="wrap">
      <button class="fab" title="Chat with Howdy (drag to move)" aria-label="Chat with Howdy">
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

  const fab = root.querySelector('.fab');
  // Stored as fractions of the free space, so the button stays inside any viewport size without a resize listener.
  let at, drag, dragged;
  const place = (p) => {
    at = p && { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
    fab.classList.toggle('placed', !!at);
    if (at) for (const k of ['x', 'y']) fab.style.setProperty(`--${k}`, at[k]);
  };
  fab.onpointerdown = (e) => {
    if (e.button) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - fab.offsetLeft, dy: e.clientY - fab.offsetTop };
    dragged = false;
    fab.setPointerCapture(e.pointerId);
  };
  fab.onpointermove = (e) => {
    if (drag?.id !== e.pointerId) return;
    if (!dragged && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    dragged = true;
    fab.classList.add('dragging');
    const { clientWidth: w, clientHeight: h } = document.scrollingElement ?? document.documentElement;
    place({ x: (e.clientX - drag.dx - 8) / (w - 66), y: (e.clientY - drag.dy - 8) / (h - 66) });
  };
  fab.onpointerup = fab.onpointercancel = () => {
    if (drag && dragged) chrome.storage.local.set({ chatButton: at });
    fab.classList.remove('dragging');
    drag = null;
  };
  fab.onclick = (e) => {
    // detail is 0 for keyboard activation, which must always open.
    if (dragged && e.detail) return (dragged = false);
    toggle(true);
  };
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
  const paint = (t) => {
    host.removeAttribute('style');
    for (const k of ['blue', 'on-blue', 'pink', 'ink']) if (t?.vars[`--${k}`]) host.style.setProperty(`--howdy-${k}`, t.vars[`--${k}`]);
  };
  chrome.storage.local.get(['theme', 'chatButton']).then(({ theme, chatButton }) => (paint(theme), place(chatButton)));
  chrome.storage.onChanged.addListener((c) => {
    if (c.theme) paint(c.theme.newValue);
    if (c.chatButton) place(c.chatButton.newValue);
  });
  document.documentElement.append(host);
})();
