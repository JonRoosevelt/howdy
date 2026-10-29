import { setupGoogleHeaders } from './google.js';
import { generate, get, settings } from './lib.js';

setupGoogleHeaders();

async function briefAt() {
  const { briefHour } = await settings();
  return new Date().setHours(Number(briefHour), 0, 0, 0);
}

async function schedule() {
  const at = await briefAt();
  chrome.alarms.create('brief', { when: at > Date.now() ? at : at + 864e5, periodInMinutes: 1440 });
}

async function brief() {
  // MV3 kills a service worker after ~30s without extension API calls; long LLM fetches alone don't count.
  const keepAlive = setInterval(chrome.runtime.getPlatformInfo, 20e3);
  try {
    await generate('brief');
    chrome.action.setBadgeText({ text: '1' });
  } catch (e) {
    console.error(e);
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.storage.onChanged.addListener((c) => c.settings && schedule());
chrome.alarms.onAlarm.addListener(({ name }) => name === 'brief' && brief());
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'app.html' }));

// The alarm doesn't fire while the browser is closed, so catch up on the first open of the day.
chrome.runtime.onStartup.addListener(async () => {
  await schedule();
  const at = await briefAt();
  if (Date.now() > at && ((await get('brief'))?.at ?? 0) < at) brief();
});
