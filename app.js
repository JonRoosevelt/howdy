import { calendarEvents, closeGmail, searchGmail } from './google.js';
import { docs, get, jira, jiraSites, openDoc, set, settings, slack } from './lib.js';
import { $, el, when } from './ui.js';

let checked = false;
function tab(name) {
  document.querySelectorAll('nav button, section').forEach((e) => e.classList.remove('on'));
  document.querySelector(`nav [data-tab=${name}]`).classList.add('on');
  $(`#${name}`).classList.add('on');
  if (name === 'sources' && !checked) {
    checked = true;
    ['google', 'slack', 'jira'].forEach((s) => check(s));
  }
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
  if (c.slackTeams) renderSlackTeams().then(() => check('slack'));
});

const generate = (kind, opts) => chrome.runtime.sendMessage({ type: 'generate', kind, opts });
$('#brief-go').onclick = () => generate('brief');
$('#report-go').onclick = () => generate('report', { days: Number($('#report-days').value), extra: $('#report-extra').value });

const form = $('#settings-form');

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

const CHECKS = {
  async google(gmail) {
    const user = (await settings()).googleUser ?? 0;
    const today = new Date().setHours(0, 0, 0, 0);
    const events = await calendarEvents(user, new Date(today).toISOString(), new Date(today + 864e5).toISOString());
    const cal = `Calendar ok, ${plural(events.length, 'event')} today`;
    if (!gmail) return cal;
    try {
      return `${cal}. Gmail ok, ${plural((await searchGmail(user, 'in:inbox', 5)).length, 'thread')}`;
    } finally {
      await closeGmail();
    }
  },
  async slack() {
    const r = await slack('auth.test');
    return `Signed in as ${r.user} on ${r.team}`;
  },
  async jira() {
    const me = await jira('/rest/api/3/myself');
    return `Signed in as ${me.displayName} on ${me.site}`;
  },
};

async function check(source, ...args) {
  const row = $(`[data-source=${source}]`);
  const status = row.querySelector('.status');
  row.dataset.state = 'checking';
  status.textContent = 'Checking...';
  try {
    status.textContent = await CHECKS[source](...args);
    row.dataset.state = 'ok';
  } catch (e) {
    status.textContent = e.message;
    row.dataset.state = 'error';
  }
}

async function renderSlackTeams() {
  const teams = (await get('slackTeams')) ?? [];
  $('#slack-team').hidden = !teams.length;
  $('#slack-connect').textContent = teams.length ? 'Reconnect' : 'Connect';
  $('#slack-team').replaceChildren(...teams.map((t) => el('option', { value: t.id, textContent: t.name })));
  $('#slack-team').value = (await settings()).slackTeam ?? teams[0]?.id ?? '';
}
await renderSlackTeams();
$('#slack-connect').onclick = () => chrome.tabs.create({ url: 'https://app.slack.com/client' });
$('#gmail-test').onclick = () => check('google', true);

const sites = await jiraSites();
$('#jira-sites').replaceChildren(...sites.map((s) => el('option', { value: s })));
if (sites[0]) $('#jira-site').placeholder = sites[0];
$('#jira-open').onclick = async () => chrome.tabs.create({ url: `https://${(await settings()).jiraSite || sites[0] || 'start.atlassian.com'}` });

const current = await settings();
for (const input of document.querySelectorAll('[data-setting]')) {
  if (current[input.dataset.setting] != null) input.value = current[input.dataset.setting];
  input.onchange = async () => {
    await set('settings', { ...(await settings()), [input.dataset.setting]: input.value.trim() });
    check(input.closest('[data-source]').dataset.source);
  };
}

for (const [k, v] of Object.entries(current)) if (form.elements[k]) form.elements[k].value = v;

form.onsubmit = async (e) => {
  e.preventDefault();
  const s = Object.fromEntries(new FormData(form));
  const def = s.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
  const { protocol, hostname } = new URL(s.baseUrl || def);
  // Must run before any await so the click still counts as a user gesture.
  const granted = chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] });
  await set('settings', { ...(await settings()), ...s });
  $('#saved').textContent = (await granted) ? 'Saved' : 'Saved, but without permission for the LLM host';
};
