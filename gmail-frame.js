// Runs in MAIN world inside the hidden Gmail iframe of gmail.html, so it can read GLOBALS and fetch same-origin.
// Read params at document_start: Gmail rewrites the URL once it boots.
(() => {
  const params = new URLSearchParams(location.search);
  const nonce = params.get('bd');
  const parentOrigin = location.ancestorOrigins?.[0] ?? '';
  if (!nonce || window.top === window || !parentOrigin.startsWith('chrome-extension://')) return;
  const thread = params.get('bdthread');
  const reply = (data) => parent.postMessage({ nonce, ...data }, parentOrigin);

  // Gmail's long-lived list markup: zA row, zE unread, bog subject, y2 snippet, TC "no results".
  function results() {
    const main = document.querySelector('div[role=main]');
    if (!main) return null;
    const rows = [...main.querySelectorAll('tr.zA')];
    if (!rows.length) return main.querySelector('td.TC') ? [] : null;
    return rows.slice(0, 50).map((r) => ({
      thread_id: r.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id'),
      from: [...r.querySelectorAll('.yX [email]')]
        .map((e) => `${e.getAttribute('name') || e.textContent} <${e.getAttribute('email')}>`)
        .join(', '),
      subject: r.querySelector('.bog')?.textContent,
      snippet: r.querySelector('.y2')?.textContent.replace(/^\s*-\s*/, ''),
      date: r.querySelector('.xW [title]')?.getAttribute('title'),
      unread: r.classList.contains('zE'),
    }));
  }

  async function printView() {
    const permthid = `thread-f:${BigInt(`0x${thread}`)}`;
    const r = await fetch(`${location.pathname}?ik=${window.GLOBALS[9]}&view=pt&search=all&permthid=${encodeURIComponent(permthid)}`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    doc.querySelectorAll('script, style').forEach((e) => e.remove());
    return doc.body.textContent.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 12000);
  }

  const poll = setInterval(async () => {
    try {
      if (thread) {
        if (!window.GLOBALS?.[9]) return;
        clearInterval(poll);
        reply({ result: await printView() });
      } else {
        const r = results();
        if (!r) return;
        clearInterval(poll);
        reply({ result: r });
      }
    } catch (e) {
      clearInterval(poll);
      reply({ error: e.message });
    }
  }, 500);
})();
