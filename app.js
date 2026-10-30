import { calendarEvents, closeGmail, searchGmail } from './google.js';
import { docs, get, openDoc, set, settings } from './lib.js';
import { $, el, when } from './ui.js';

function tab(name) {
  document.querySelectorAll('nav button, section').forEach((e) => e.classList.remove('on'));
  document.querySelector(`nav [data-tab=${name}]`).classList.add('on');
  $(`#${name}`).classList.add('on');
}
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
chrome.action.setBadgeText({ text: '' });

async function renderHistory() {
  const list = await docs();
  $('#empty').hidden = list.length > 0;
  $('#history').replaceChildren(
    ...list.map((d) =>
      el(
        'li',
        { className: d.kind, onclick: () => openDoc(d.id), title: d.title },
        el('span', { className: 'kind', title: d.kind }),
        el('span', { className: 'title', textContent: d.title }),
        el('span', { className: 'muted', textContent: when(d.at) }),
      ),
    ),
  );
}

async function renderJob() {
  const { job } = await chrome.storage.session.get('job');
  const running = job && !job.error;
  $('#brief-go').disabled = $('#report-go').disabled = running;
  const secs = job && Math.round((Date.now() - job.at) / 1000);
  const elapsed = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  $('#job').textContent = !job ? '' : job.error ? `Error: ${job.error}` : `Writing your ${job.kind}: ${job.progress ?? 'starting'}, ${elapsed}`;
}

await Promise.all([renderHistory(), renderJob()]);
setInterval(renderJob, 1000);
chrome.storage.onChanged.addListener((c, area) => {
  if (c.docs) renderHistory();
  if (area === 'session' && c.job) renderJob();
  if (c.slackTeams) renderSlackTeams();
});

const generate = (kind, opts) => chrome.runtime.sendMessage({ type: 'generate', kind, opts });
$('#brief-go').onclick = () => generate('brief');
$('#report-go').onclick = () => generate('report', { days: Number($('#report-days').value), extra: $('#report-extra').value });

const form = $('#settings-form');

async function renderSlackTeams() {
  const teams = (await get('slackTeams')) ?? [];
  $('#slack-team').replaceChildren(...teams.map((t) => el('option', { value: t.id, textContent: t.name })));
  $('#slack-team').value = (await settings()).slackTeam ?? teams[0]?.id ?? '';
}
await renderSlackTeams();
$('#slack-connect').onclick = () => chrome.tabs.create({ url: 'https://app.slack.com/client' });

for (const [k, v] of Object.entries(await settings())) if (form.elements[k]) form.elements[k].value = v;

form.onsubmit = async (e) => {
  e.preventDefault();
  const s = Object.fromEntries(new FormData(form));
  const def = s.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
  const { protocol, hostname } = new URL(s.baseUrl || def);
  // Must run before any await so the click still counts as a user gesture.
  const granted = chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] });
  await set('settings', s);
  $('#saved').textContent = (await granted) ? 'Saved' : 'Saved, but without permission for the LLM host';
};

$('#google-test').onclick = async () => {
  const user = form.elements.googleUser.value || 0;
  const today = new Date().setHours(0, 0, 0, 0);
  const status = $('#google-status');
  status.textContent = 'Testing...';
  const [cal, mail] = await Promise.allSettled([
    calendarEvents(user, new Date(today).toISOString(), new Date(today + 864e5).toISOString()),
    searchGmail(user, 'in:inbox', 5),
  ]);
  await closeGmail();
  const show = (name, r) => `${name}: ${r.status === 'fulfilled' ? `ok (${r.value.length})` : r.reason.message}`;
  status.textContent = `${show('Calendar', cal)} | ${show('Gmail', mail)}`;
};
