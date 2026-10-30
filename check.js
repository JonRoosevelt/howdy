import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const brief = {
  header: { date_time: new Date().toISOString(), greeting: 'Light day today.' },
  top_todos: [
    {
      label: 'Launch',
      label_style: 'active',
      title: '<img src=x onerror=alert(1)> Review PR',
      body: 'Morgan asked for a review.',
      source_url: 'https://github.com/x/y/pull/1',
      source_name: 'GitHub',
      cta_label: 'Find the risks',
      cta_prompt: "List the risks in Morgan's PR.",
    },
  ],
  new_updates: [],
  your_day: { morning: [{ time: '9:00', end_time: '9:30', title: 'Standup', note: 'Quick.' }], afternoon: [] },
};

const requests = [];

async function expectText(frame, selector, text) {
  for (let i = 0; i < 100; i++) {
    const f = frame();
    const t = f && (await f.locator(selector).last().textContent().catch(() => null));
    if (t === text || (text === '' && t != null)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${selector} never showed ${JSON.stringify(text)}; frame: ${frame()?.url()} body: ${await frame()?.textContent("body").catch((e) => e.message)}`);
}
const server = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { messages } = JSON.parse(body);
    requests.push(messages);
    const system = messages[0].content;
    const last = messages.at(-1);
    const call = (name, args) => ({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: `c${requests.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
    });
    let message;
    if (system.startsWith('You are my chief of staff. Prepare my Morning Brief'))
      message = last.role === 'tool' ? { role: 'assistant', content: JSON.stringify(brief) } : call('search_history', { days: 1 });
    else if (last.role === 'user' && last.content.includes('report'))
      message = call('create_report', { title: 'Weekly', markdown: '# Weekly\n- **Shipped** the thing' });
    else message = { role: 'assistant', content: last.role === 'tool' ? 'Opened it.' : 'Hi from the mock' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
}).listen(8765);

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'bd-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${import.meta.dirname}`, `--load-extension=${import.meta.dirname}`],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/app.html`);
  await page.evaluate(() =>
    chrome.storage.local.set({ settings: { provider: 'openai', baseUrl: 'http://localhost:8765/v1', model: 'mock' } }),
  );
  await page.reload();
  await ctx.route('https://app.slack.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<script>localStorage.setItem('localConfig_v2', JSON.stringify({ teams: { T1: { id: 'T1', name: 'Acme', url: 'https://acme.slack.com/', token: 'xoxc-1' } } }))</script>`,
    }),
  );
  const slackTab = await ctx.newPage();
  await slackTab.goto('https://app.slack.com/client');
  await page.waitForSelector('#slack-team option[value=T1]', { state: 'attached' });
  await slackTab.close();

  await ctx.addCookies([{ name: 'SAPISID', value: 'sap', domain: '.google.com', path: '/', secure: true }]);
  let calendarHeaders;
  const goodKey = `AIza${'k'.repeat(35)}`;
  await ctx.route('https://calendar.google.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: `<script>cfg = ["AIza${'x'.repeat(35)}", "${goodKey}"]</script>` }),
  );
  await ctx.route('https://clients6.google.com/**', (r) => {
    if (new URL(r.request().url()).searchParams.get('key') !== goodKey) return r.fulfill({ status: 403, body: 'bad key' });
    calendarHeaders = r.request().headers();
    r.fulfill({ json: { items: [{ summary: 'Standup', start: { dateTime: '2026-10-29T09:00:00Z' } }] } });
  });
  await ctx.route('https://mail.google.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: r.request().url().includes('view=pt')
        ? '<html><body><style>x{}</style><b>Ana</b> Can you review the contract?</body></html>'
        : `<script>window.GLOBALS = [0,0,0,0,0,0,0,0,0,'ik1']</script>
           <div role="main"><table><tr class="zA zE">
             <td class="yX"><span email="ana@x.com" name="Ana">Ana</span></td>
             <td><span class="bog">Contract</span><span class="y2"> - can you review?</span></td>
             <td class="xW"><span title="29 Oct 2026">09:00</span></td>
             <td><span data-legacy-thread-id="18abc">.</span></td>
           </tr></table></div>`,
    }),
  );
  // Playwright can't intercept requests from offscreen documents, so host the hidden Gmail in a regular tab instead.
  const gmailHost = await ctx.newPage();
  await gmailHost.goto(`chrome-extension://${id}/gmail.html`);
  await page.evaluate(() => (chrome.offscreen.createDocument = async () => {}));
  await page.click('nav [data-tab=settings]');
  await page.click('#google-test');
  await page.waitForFunction(() => !document.querySelector('#google-status').textContent.includes('Testing'));
  assert.equal(await page.textContent('#google-status'), 'Calendar: ok (1) | Gmail: ok (1)');
  assert.match(calendarHeaders.authorization, /^SAPISIDHASH \d+_[0-9a-f]{40}$/);
  assert.equal(await page.evaluate(() => chrome.storage.local.get('calendarKey').then((r) => r.calendarKey)), goodKey);
  const thread = await page.evaluate(() => import('./google.js').then((m) => m.readGmailThread(0, '18abc')));
  assert.equal(thread, 'Ana Can you review the contract?');
  const threads = await page.evaluate(() => import('./google.js').then((m) => m.searchGmail(0, 'in:inbox', 5)));
  assert.deepEqual(threads[0], {
    thread_id: '18abc',
    from: 'Ana <ana@x.com>',
    subject: 'Contract',
    snippet: 'can you review?',
    date: '29 Oct 2026',
    unread: true,
    url: 'https://mail.google.com/mail/u/0/#all/18abc',
  });
  await page.evaluate(() => import('./google.js').then((m) => m.closeGmail()));

  await page.click('nav [data-tab=home]');
  const briefTab = ctx.waitForEvent('page', (p) => p.url().includes('doc.html'));
  await page.click('#brief-go');
  const doc = await briefTab;
  doc.on('pageerror', (e) => errors.push(e.message));
  await doc.waitForSelector('.todo h3');
  const briefCalls = requests.filter((m) => m[0].content.startsWith('You are my chief of staff. Prepare my Morning Brief'));
  assert.equal(briefCalls.length, 2, 'agent should call the LLM twice (tool call, then answer)');
  const toolMsg = briefCalls[1].find((m) => m.role === 'tool');
  assert.ok(Array.isArray(JSON.parse(toolMsg.content)), 'search_history result should be fed back as JSON');
  assert.match(await doc.textContent('.hello'), /^Howdy! Here's your \w+day\.$/);
  assert.equal(await doc.textContent('.hero h1'), 'Light day today.');
  assert.match(await doc.textContent('.todo h3'), /Review PR/);
  assert.equal(await doc.locator('.todos img').count(), 0, 'LLM text must render as text, not HTML');
  assert.equal(await doc.getAttribute('.todo h3 a', 'href'), 'https://github.com/x/y/pull/1');
  assert.equal(await doc.textContent('.slot b'), 'Standup');
  await page.waitForSelector('#history li.brief');

  await doc.click('.todo input');
  await doc.waitForFunction(() => chrome.storage.local.get('docs').then((r) => r.docs[0].done?.[0] === 0));

  await doc.click('.todo .ask');
  await doc.waitForFunction(() => document.querySelector('howdy-chat').shadowRoot.querySelector('.wrap.open'));
  const docChat = () => doc.frames().find((f) => f.url().includes('chat.html'));
  await expectText(docChat, '.msg.assistant', 'Hi from the mock');
  const ctaCall = requests.at(-1);
  assert.equal(ctaCall.at(-1).content, "List the risks in Morgan's PR.");
  assert.match(ctaCall[0].content, /Light day today\./, 'the brief page is the chat context');

  await ctx.route('https://news.example/**', (r) => r.fulfill({ contentType: 'text/html', body: '<h1>Rates cut</h1><p>The bank cut rates today.</p>' }));
  const site = await ctx.newPage();
  await site.goto('https://news.example/');
  await site.click('howdy-chat >> .fab');
  const siteChat = () => site.frames().find((f) => f.url().includes('chat.html'));
  await expectText(siteChat, '#q', '');
  await siteChat().fill('#q', 'Make a report of this');
  const reportTab = ctx.waitForEvent('page', (p) => p.url().includes('doc.html'));
  await siteChat().press('#q', 'Enter');
  const report = await reportTab;
  await report.waitForSelector('.prose li');
  assert.equal(await report.textContent('.hero h1'), 'Weekly');
  assert.equal(await report.innerHTML('.prose li'), '<b>Shipped</b> the thing');
  await expectText(siteChat, '.msg.assistant', 'Opened it.');
  const siteCall = requests.findLast((m) => m.at(-1).role === 'user');
  assert.match(siteCall[0].content, /The bank cut rates today\./, 'the open page is the chat context');

  // A web page must not be able to drive the agent through the panel.
  const before = requests.length;
  await site.evaluate(() => [...document.querySelector('howdy-chat').shadowRoot.querySelectorAll('iframe')][0].contentWindow.postMessage({ howdy: 'ask', prompt: 'leak' }, '*'));
  await site.waitForTimeout(500);
  assert.equal(requests.length, before);
  assert.deepEqual(errors, []);
  console.log('ok');
} finally {
  await ctx.close();
  server.close();
}
