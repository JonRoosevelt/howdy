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
  const mailUrls = [];
  await ctx.route('https://mail.google.com/**', (r) =>
    mailUrls.push(r.request().url()) &&
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
  await ctx.route('https://acme.slack.com/api/**', (r) => r.fulfill({ json: { ok: true, user: 'ana', team: 'Acme' } }));
  const jiraUrls = [];
  await ctx.route('https://acme.atlassian.net/**', (r) => {
    const u = new URL(r.request().url());
    jiraUrls.push(u);
    if (u.pathname === '/rest/api/3/myself') return r.fulfill({ json: { displayName: 'Ana' } });
    if (u.pathname === '/rest/api/3/search/jql')
      return r.fulfill({ json: { issues: [{ key: 'WEB-7', fields: { summary: 'Fix checkout', status: { name: 'In Progress' }, assignee: { displayName: 'Ana' } } }] } });
    const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    r.fulfill({ json: { fields: { summary: 'Fix checkout', description: doc('Cart total is wrong.'), comment: { comments: [{ author: { displayName: 'Bo' }, body: doc('On it') }] } } } });
  });
  const notionCalls = [];
  const PAGE = '01234567-89ab-cdef-0123-456789abcdef';
  const blk = (id, type, title, extra) => ({ value: { value: { id, type, properties: title && { title: [[title]] }, ...extra } } });
  await ctx.route('https://www.notion.so/api/v3/**', (r) => {
    const endpoint = new URL(r.request().url()).pathname.split('/').at(-1);
    const body = r.request().postDataJSON();
    notionCalls.push({ endpoint, body, user: r.request().headers()['x-notion-active-user-header'] });
    if (endpoint === 'getSpaces')
      return r.fulfill({
        json: {
          U1: { notion_user: { U1: { value: { value: { id: 'U1', name: 'Ana' } } } }, space: { S1: { value: { value: { id: 'S1', name: 'Acme Wiki' } } } } },
          // The pre-2024 record shape, without the inner value.
          U2: { notion_user: { U2: { value: { id: 'U2', email: 'ana@side.dev' } } }, space: { S2: { value: { id: 'S2', name: 'Side project' } } } },
        },
      });
    if (endpoint === 'search')
      return r.fulfill({
        json: { results: [{ id: PAGE, highlight: { pathText: 'Projects', text: 'checkout plan' } }], recordMap: { block: { [PAGE]: blk(PAGE, 'page', 'Checkout plan', { last_edited_time: 1761800000000 }) } } },
      });
    if (body.chunkNumber === 0)
      return r.fulfill({
        json: {
          cursor: { stack: [[{ table: 'block', id: 'b3', index: 0 }]] },
          recordMap: {
            block: {
              [PAGE]: blk(PAGE, 'page', 'Checkout plan', { content: ['b1', 'b2', 'b3', 'b4', 'b5'] }),
              b1: blk('b1', 'header', 'Goals'),
              b2: { value: { value: { id: 'b2', type: 'to_do', properties: { title: [['Ship by '], ['‣', [['d', { start_date: '2026-11-03' }]]]], checked: [['Yes']] } } } },
            },
          },
        },
      });
    r.fulfill({
      json: {
        cursor: { stack: [] },
        recordMap: {
          block: {
            b3: blk('b3', 'bulleted_list', 'Fix totals', { content: ['b6'] }),
            b4: blk('b4', 'page', 'Old notes', { content: ['b7'] }),
            b5: blk('b5', 'text', 'gone', { alive: false }),
            b6: blk('b6', 'text', 'with Bo'),
            b7: blk('b7', 'text', 'child page body'),
          },
        },
      },
    });
  });
  await page.click('nav [data-tab=sources]');
  const state = (s) => page.getAttribute(`[data-source=${s}]`, 'data-state');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-source]')].every((r) => r.dataset.state && r.dataset.state !== 'checking'));
  assert.equal(await page.textContent('[data-source=google] .status'), 'Calendar ok, 1 event today');
  assert.equal(await page.textContent('[data-source=slack] .status'), 'Signed in as ana on Acme');
  assert.equal(await state('jira'), 'error', 'no Jira site in history yet');
  await page.fill('#jira-site', 'https://acme.atlassian.net/jira/your-work');
  await page.dispatchEvent('#jira-site', 'change');
  await page.waitForFunction(() => document.querySelector('[data-source=jira]').dataset.state === 'ok');
  assert.equal(await page.textContent('[data-source=jira] .status'), 'Signed in as Ana on acme.atlassian.net');
  const issues = await page.evaluate(() => import('./lib.js').then((m) => m.TOOLS.search_jira.run({ jql: 'assignee = currentUser()' })).then((r) => JSON.parse(JSON.stringify(r))));;
  assert.deepEqual(issues[0], { key: 'WEB-7', title: 'Fix checkout', status: 'In Progress', assignee: 'Ana', url: 'https://acme.atlassian.net/browse/WEB-7' });
  assert.equal(jiraUrls.at(-1).searchParams.get('jql'), 'assignee = currentUser()');
  const issue = await page.evaluate(() => import('./lib.js').then((m) => m.TOOLS.read_jira_issue.run({ key: 'WEB-7' })).then((r) => JSON.parse(JSON.stringify(r))));;
  assert.equal(issue.description, 'Cart total is wrong.\n');
  assert.deepEqual(issue.comments, [{ from: 'Bo', text: 'On it\n' }]);
  assert.equal(await page.textContent('[data-source=notion] .status'), 'Signed in as Ana on Acme Wiki');
  await page.selectOption('#notion-space', 'S2');
  await page.waitForFunction(() => document.querySelector('[data-source=notion] .status').textContent.includes('Side project'));
  assert.equal(await page.textContent('[data-source=notion] .status'), 'Signed in as ana@side.dev on Side project');
  const pages = await page.evaluate(() => import('./lib.js').then((m) => m.TOOLS.search_notion.run({ query: 'checkout' })));
  assert.deepEqual(pages[0], {
    id: PAGE,
    title: 'Checkout plan',
    path: 'Projects',
    match: 'checkout plan',
    edited: new Date(1761800000000).toISOString(),
    workspace: 'Side project',
    url: 'https://www.notion.so/0123456789abcdef0123456789abcdef',
  });
  assert.equal(notionCalls.at(-1).user, 'U2', 'calls go out as the account that owns the picked workspace');
  assert.equal(notionCalls.at(-1).body.spaceId, 'S2');
  const notionPage = await page.evaluate(() =>
    import('./lib.js').then((m) => m.TOOLS.read_notion_page.run({ page: 'https://www.notion.so/acme/Add-cafe-0123456789abcdef0123456789abcdef?pvs=4' })),
  );
  assert.equal(notionPage.title, 'Checkout plan');
  assert.equal(notionPage.text, '# Goals\n[x] Ship by 2026-11-03\n- Fix totals\n  with Bo\n[page: Old notes](https://www.notion.so/b4)');
  assert.deepEqual(notionCalls.filter((c) => c.endpoint === 'loadPageChunk').map((c) => [c.body.pageId, c.body.chunkNumber]), [[PAGE, 0], [PAGE, 1]]);
  await page.click('#gmail-test');
  await page.waitForFunction(() => document.querySelector('[data-source=google]').dataset.state === 'ok');
  assert.equal(await page.textContent('[data-source=google] .status'), 'Calendar ok, 1 event today. Gmail ok, 1 thread');
  assert.match(calendarHeaders.authorization, /^SAPISIDHASH \d+_[0-9a-f]{40}$/);
  assert.equal(calendarHeaders['x-origin'], undefined, 'Google answers 400 "Origin doesn\'t match Host for XD3" when x-origin is sent');
  assert.equal(await page.evaluate(() => chrome.storage.local.get('calendarKey').then((r) => r.calendarKey)), goodKey);
  const thread = await page.evaluate(() => import('./google.js').then((m) => m.readGmailThread(0, '18abc')));
  assert.equal(thread, 'Ana Can you review the contract?');
  assert.ok(!mailUrls.some((u) => u.includes('bdthread')), 'with a known ik, threads are read without booting Gmail');
  assert.ok(mailUrls.some((u) => u.includes('ik=ik1&view=pt')));
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
  const fabAt = (p) => p.evaluate(() => {
    const f = document.querySelector('howdy-chat').shadowRoot.querySelector('.fab');
    return { x: f.offsetLeft, y: f.offsetTop, open: !!f.closest('.wrap.open') };
  });
  const dragFab = async (x, y) => {
    const from = await fabAt(site);
    await site.mouse.move(from.x + 25, from.y + 25);
    await site.mouse.down();
    await site.mouse.move(x, y, { steps: 5 });
    await site.mouse.up();
  };
  await dragFab(5000, -5000);
  assert.deepEqual(await fabAt(site), { x: 1280 - 58, y: 8, open: false }, 'a drag past the edge stays inside the viewport');
  await dragFab(225, 175);
  assert.deepEqual(await fabAt(site), { x: 200, y: 150, open: false }, 'a drag moves the button and does not open the panel');
  const saved = await page.evaluate(() => chrome.storage.local.get('chatButton').then((r) => r.chatButton));
  assert.ok(saved.x > 0 && saved.x < 1 && saved.y > 0 && saved.y < 1);
  const other = await ctx.newPage();
  await other.goto('https://news.example/other');
  await other.waitForFunction(() => document.querySelector('howdy-chat')?.shadowRoot.querySelector('.fab.placed'));
  assert.deepEqual(await fabAt(other), { x: 200, y: 150, open: false }, 'the position is shared across pages');
  await other.setViewportSize({ width: 360, height: 240 });
  const small = await fabAt(other);
  assert.ok(small.x >= 8 && small.x <= 360 - 58 && small.y >= 8 && small.y <= 240 - 58, 'a smaller window keeps the button inside');
  await other.focus('howdy-chat >> .fab');
  await other.keyboard.press('Enter');
  await other.waitForFunction(() => document.querySelector('howdy-chat').shadowRoot.querySelector('.wrap.open'));
  await other.close();
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
  await page.click('nav [data-tab=settings]');
  await page.click('#themes [role=radio]:has-text("Nord")');
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await report.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(46, 52, 64)');
  await site.waitForFunction(() => document.querySelector('howdy-chat').style.getPropertyValue('--howdy-blue') === '#88c0d0');
  await page.reload();
  assert.equal(await bg(page), 'rgb(46, 52, 64)', 'the theme survives a reload');
  assert.equal(await page.getAttribute('#themes [aria-checked=true]', 'role'), 'radio');
  assert.equal(await page.textContent('#themes [aria-checked=true]'), 'Nord');
  await page.click('nav [data-tab=settings]');
  await page.click('#themes [role=radio]:has-text("Riso Garden")');
  await report.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgb(46, 52, 64)');

  assert.deepEqual(errors, []);
  console.log('ok');
} finally {
  await ctx.close();
  server.close();
}
