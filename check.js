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
const server = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { messages } = JSON.parse(body);
    requests.push(messages);
    const toolDone = messages.some((m) => m.role === 'tool');
    const message = toolDone
      ? { role: 'assistant', content: JSON.stringify(brief) }
      : {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_history', arguments: '{"days":1}' } }],
        };
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

  await page.click('nav [data-tab=brief]');
  await page.click('#brief-go');
  await page.waitForSelector('#brief-out h2');

  assert.equal(requests.length, 2, 'agent should call the LLM twice (tool call, then answer)');
  const toolMsg = requests[1].find((m) => m.role === 'tool');
  assert.ok(Array.isArray(JSON.parse(toolMsg.content)), 'search_history result should be fed back as JSON');
  assert.equal(await page.textContent('#brief-out h2'), 'Light day today.');
  assert.match(await page.textContent('#brief-out'), /Review PR/);
  assert.equal(await page.locator('#brief-out img').count(), 0, 'LLM text must render as text, not HTML');
  assert.equal(await page.getAttribute('#brief-out h4 a', 'href'), 'https://github.com/x/y/pull/1');
  assert.deepEqual(errors, []);
  console.log('ok');
} finally {
  await ctx.close();
  server.close();
}
