import { setupGoogleHeaders } from './google.js';
import { docs, generate, openDoc, settings } from './lib.js';

setupGoogleHeaders();

async function briefAt() {
  const { briefHour } = await settings();
  return new Date().setHours(Number(briefHour), 0, 0, 0);
}

async function schedule() {
  const at = await briefAt();
  chrome.alarms.create('brief', { when: at > Date.now() ? at : at + 864e5, periodInMinutes: 1440 });
}

// storage.session so a job cut short by a browser restart doesn't look like it's still running.
const setJob = (job) => chrome.storage.session.set({ job });

async function run(kind, opts = {}, open = false) {
  const { job } = await chrome.storage.session.get('job');
  if (job && !job.error && Date.now() - job.at < 15 * 60e3) return;
  // MV3 kills a service worker after ~30s without extension API calls; long LLM fetches alone don't count.
  const keepAlive = setInterval(chrome.runtime.getPlatformInfo, 20e3);
  const at = Date.now();
  await setJob({ kind, at });
  try {
    const doc = await generate(kind, { ...opts, onProgress: (progress) => setJob({ kind, at, progress }) });
    await chrome.storage.session.remove('job');
    if (open) openDoc(doc.id);
    else chrome.action.setBadgeText({ text: '1' });
  } catch (e) {
    console.error(e);
    await setJob({ kind, at, error: e.message });
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.storage.onChanged.addListener((c) => c.settings && schedule());
chrome.alarms.onAlarm.addListener(({ name }) => name === 'brief' && run('brief'));
chrome.runtime.onMessage.addListener((m) => m.type === 'generate' && run(m.kind, m.opts, true));

// The alarm doesn't fire while the browser is closed, so catch up on the first open of the day.
chrome.runtime.onStartup.addListener(async () => {
  await schedule();
  const at = await briefAt();
  const last = (await docs()).find((d) => d.kind === 'brief')?.at ?? 0;
  if (Date.now() > at && last < at) run('brief');
});
