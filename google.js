const CALENDAR_ORIGIN = 'https://calendar.google.com';

// clients6 only honours SAPISIDHASH when Origin matches the origin baked into the hash, and fetch can't set Origin itself.
// Gmail refuses framing via XFO/CSP; rule 2 lifts that only for frames loaded by this extension's offscreen page (tabId -1).
export function setupGoogleHeaders() {
  return chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1, 2],
    addRules: [
      {
        id: 2,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: { requestDomains: ['mail.google.com'], resourceTypes: ['sub_frame'], tabIds: [-1] },
      },
      {
        id: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin', operation: 'set', value: CALENDAR_ORIGIN },
            { header: 'referer', operation: 'set', value: `${CALENDAR_ORIGIN}/` },
          ],
        },
        condition: { requestDomains: ['clients6.google.com'], initiatorDomains: [chrome.runtime.id] },
      },
    ],
  });
}

async function sapisidHash(origin) {
  const c = await chrome.cookies.get({ url: 'https://www.google.com', name: 'SAPISID' });
  if (!c) throw new Error('Google not connected: sign in to Google in this browser');
  const ts = Math.floor(Date.now() / 1000);
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${c.value} ${origin}`));
  return `SAPISIDHASH ${ts}_${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// No key is bundled: clients6 wants the browser key Calendar on the web uses, so read candidates from the user's own Calendar page.
async function discoverCalendarKeys(user) {
  const html = await (await fetch(`${CALENDAR_ORIGIN}/calendar/u/${user}/r`, { credentials: 'include' })).text();
  return [...new Set(html.match(/AIza[0-9A-Za-z_-]{35}/g) ?? [])];
}

export async function calendarEvents(user, timeMin, timeMax) {
  const { calendarKey } = await chrome.storage.local.get('calendarKey');
  const keys = calendarKey ? [calendarKey] : await discoverCalendarKeys(user);
  if (!keys.length) throw new Error('Calendar not available: sign in to calendar.google.com in this browser');
  let error;
  for (const key of keys) {
    const p = new URLSearchParams({ key, timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
    const r = await fetch(`https://clients6.google.com/calendar/v3/calendars/primary/events?${p}`, {
      credentials: 'include',
      headers: {
        authorization: await sapisidHash(CALENDAR_ORIGIN),
        'x-goog-authuser': String(user),
        'x-origin': CALENDAR_ORIGIN,
      },
    });
    if (r.ok) {
      if (key !== calendarKey) await chrome.storage.local.set({ calendarKey: key });
      return (await r.json()).items ?? [];
    }
    error = `Calendar ${r.status}: ${(await r.text()).slice(0, 300)}`;
  }
  if (calendarKey) {
    await chrome.storage.local.remove('calendarKey');
    return calendarEvents(user, timeMin, timeMax);
  }
  throw new Error(error);
}

let queue = Promise.resolve();
// One offscreen document hosts the hidden Gmail, so calls take turns.
const serial = (fn) => (queue = queue.then(fn, fn));

async function hiddenGmail(url) {
  await chrome.offscreen
    .createDocument({ url: 'gmail.html', reasons: ['DOM_SCRAPING'], justification: "Read Gmail with the user's session" })
    .catch(() => {});
  const nonce = String(Date.now());
  const sep = url.includes('?') ? '&' : '?';
  const [path, hash = ''] = url.split('#');
  const r = await chrome.runtime.sendMessage({ target: 'gmail-offscreen', url: `${path}${sep}bd=${nonce}${hash && `#${hash}`}`, nonce });
  if (!r?.ok) throw new Error(r?.error ?? 'Gmail unavailable');
  return r.result;
}

export const closeGmail = () => chrome.offscreen.closeDocument().catch(() => {});

export const searchGmail = (user, query, max) =>
  serial(async () => {
    const hash = encodeURIComponent(query).replace(/%20/g, '+');
    const threads = await hiddenGmail(`https://mail.google.com/mail/u/${user}/#search/${hash}`);
    return threads.slice(0, max).map((t) => ({ ...t, url: `https://mail.google.com/mail/u/${user}/#all/${t.thread_id}` }));
  });

export const readGmailThread = (user, threadId) =>
  serial(async () => {
    if (!/^[0-9a-f]+$/i.test(threadId)) throw new Error('Invalid thread_id');
    return hiddenGmail(`https://mail.google.com/mail/u/${user}/?bdthread=${threadId}#inbox`);
  });
