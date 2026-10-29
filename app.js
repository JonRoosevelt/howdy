import { calendarEvents, closeGmail, searchGmail } from './google.js';
import { PROMPTS, agent, generate, get, set, settings } from './lib.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Escape first, then whitelist a few markdown constructs; LLM output carries untrusted email/Slack text.
const md = (t) =>
  esc(t)
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(Boolean));
  return e;
};
const link = (url, text) => (url?.startsWith('https://') ? el('a', { href: url, target: '_blank', textContent: text }) : text);
const askBtn = (label, prompt) => prompt && el('button', { className: 'cta', textContent: label, onclick: () => send(prompt) });

function tab(name) {
  document.querySelectorAll('nav button, section').forEach((e) => e.classList.remove('on'));
  document.querySelector(`nav [data-tab=${name}]`).classList.add('on');
  $(`#${name}`).classList.add('on');
}

async function busy(btn, status, fn) {
  btn.disabled = true;
  status.textContent = 'Researching...';
  try {
    await fn((tool) => (status.textContent = `Researching: ${tool}`));
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    return;
  } finally {
    btn.disabled = false;
  }
}

chrome.action.setBadgeText({ text: '' });
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

function renderBrief(doc) {
  const out = $('#brief-out');
  out.replaceChildren();
  $('#brief-at').textContent = doc ? `generated ${new Date(doc.at).toLocaleString()}` : '';
  if (!doc) return;
  const b = doc.json;
  if (!b) return out.append(el('div', { className: 'out', textContent: doc.text }));
  const item = (i) =>
    el(
      'div',
      { className: 'item' },
      el('span', { className: `pill ${i.label_style}`, textContent: i.label }),
      el('h4', {}, link(i.source_url, i.title)),
      el('p', { textContent: i.body }),
      el('small', { className: 'muted', textContent: i.source_name }),
      askBtn(i.cta_label || 'Ask', i.cta_prompt),
    );
  const meeting = (m) =>
    el(
      'div',
      { className: 'item' },
      el('b', { textContent: `${m.time}${m.end_time ? `–${m.end_time}` : ''}  ${m.title}` }),
      el('p', { textContent: m.note }),
      askBtn('Prep', m.prep_prompt),
    );
  const section = (title, nodes) => nodes.length && el('div', {}, el('h3', { textContent: title }), ...nodes);
  out.append(
    el('h2', { textContent: b.header?.greeting }),
    section('Your to-dos', (b.top_todos ?? []).map(item)),
    section('Updates', (b.new_updates ?? []).map(item)),
    section('Your day', [...(b.your_day?.morning ?? []), ...(b.your_day?.afternoon ?? [])].map(meeting)),
    b.looking_ahead_blurb && el('p', { className: 'muted', textContent: b.looking_ahead_blurb }),
    el('p', {}, ...(b.footer?.sources ?? []).map((s) => el('span', {}, link(s.url, s.name), ' '))),
  );
}

renderBrief(await get('brief'));
$('#brief-go').onclick = (e) =>
  busy(e.target, $('#brief-at'), async (onTool) => renderBrief(await generate('brief', { onTool })));

const report = await get('report');
if (report) $('#report-out').innerHTML = md(report.text);
$('#report-go').onclick = (e) =>
  busy(e.target, $('#report-at'), async (onTool) => {
    const doc = await generate('report', { days: Number($('#report-days').value), extra: $('#report-extra').value, onTool });
    $('#report-out').innerHTML = md(doc.text);
    $('#report-at').textContent = `generated ${new Date(doc.at).toLocaleString()}`;
  });

const view = [];
let transcript = [];
const renderChat = () => {
  $('#chat-log').innerHTML = view.map((m) => `<div class="msg out ${m.role}">${md(m.content)}</div>`).join('');
};
async function send(q) {
  tab('chat');
  view.push({ role: 'user', content: q });
  renderChat();
  const status = $('#chat-status');
  await busy($('#q'), status, async (onTool) => {
    const system = `${PROMPTS.chat}\n\nNow: ${new Date().toString()}`;
    const r = await agent(system, [...transcript, { role: 'user', content: q }], onTool);
    transcript = r.messages;
    view.push({ role: 'assistant', content: r.text });
    status.textContent = '';
  });
  renderChat();
}
$('#chat-form').onsubmit = (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  $('#q').value = '';
  if (q) send(q);
};

const form = $('#settings-form');

async function renderSlackTeams() {
  const teams = (await get('slackTeams')) ?? [];
  $('#slack-team').replaceChildren(...teams.map((t) => el('option', { value: t.id, textContent: t.name })));
  $('#slack-team').value = (await settings()).slackTeam ?? teams[0]?.id ?? '';
}
await renderSlackTeams();
chrome.storage.onChanged.addListener((c) => c.slackTeams && renderSlackTeams());
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
