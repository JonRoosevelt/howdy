import { docs, set } from './lib.js';
import { $, el, link, md } from './ui.js';

const id = new URLSearchParams(location.search).get('id');
const doc = (await docs()).find((d) => d.id === id);
const page = $('#page');

const ask = (label, prompt) =>
  prompt && el('button', { className: 'btn ask', textContent: `${label} →`, onclick: () => globalThis.howdyAsk(prompt) });
const tag = (i) => i.label && el('span', { className: `tag${i.label_style === 'active' ? ' active' : ''}`, textContent: i.label });
const source = (i, text) => i.source_url?.startsWith('https://') && link(i.source_url, `${text ?? i.source_name ?? 'Source'} ↗`, 'src');
const section = (title, body) => [el('h2', { className: 'section', textContent: title }), body];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function art(p) {
  const riso = el('div', { className: p?.url?.startsWith('https://') ? 'riso' : 'riso empty', ariaHidden: 'true' });
  if (!riso.classList.contains('empty')) {
    const ink = el('div', { className: 'ink' });
    ink.append(el('img', { src: p.url, alt: '', onload: () => ink.classList.add('loaded'), onerror: () => riso.classList.add('empty') }));
    riso.append(ink);
  }
  const credit = p && [p.title, p.artist, p.date].filter(Boolean).join(', ');
  return el('figure', { className: 'art' }, riso, credit && el('figcaption', { className: 'caption' }, link(p.link, credit), ' · The Met, open access'));
}

function hero(hello, title, counts = []) {
  const at = new Date(doc.at);
  return [
    el(
      'div',
      { className: 'top' },
      el('span', { className: 'logo', textContent: 'Howdy' }),
      el('span', {
        className: 'date',
        textContent: `${at.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
      }),
    ),
    el(
      'header',
      { className: 'hero' },
      el(
        'div',
        {},
        el('p', { className: 'hello', textContent: hello }),
        el('h1', { textContent: title }),
        counts.length > 0 && el('div', { className: 'counts' }, ...counts.map((c) => el('span', { textContent: c }))),
      ),
      art(doc.painting),
    ),
  ];
}

async function saveDone(done) {
  const all = await docs();
  await set('docs', all.map((d) => (d.id === id ? { ...d, done } : d)));
}

function brief(b) {
  const done = new Set(doc.done ?? []);
  const todo = (t, i) => {
    const box = el('input', { type: 'checkbox', checked: done.has(i), title: 'Done' });
    const card = el(
      'article',
      { className: `todo${done.has(i) ? ' done' : ''}` },
      box,
      el('div', {}, el('h3', {}, link(t.source_url, t.title)), el('p', { textContent: t.body }), el('div', { className: 'meta' }, tag(t), source(t, t.source_name && `from ${t.source_name}`))),
      ask(t.cta_label || 'Ask', t.cta_prompt) || el('span'),
    );
    box.onchange = () => {
      box.checked ? done.add(i) : done.delete(i);
      card.classList.toggle('done', box.checked);
      saveDone([...done]);
    };
    return card;
  };
  const update = (u, i) =>
    el(
      'article',
      { className: `update${i % 2 ? '' : ' ink'}` },
      u.source_name && el('span', { className: 'from', textContent: `from ${u.source_name}` }),
      el('h3', {}, link(u.source_url, u.title)),
      el('p', { textContent: u.body }),
      el('div', { className: 'meta' }, tag(u), source(u, 'open')),
    );
  const slot = (m) =>
    el(
      'div',
      { className: 'slot' },
      el('span', { className: 'time' }, m.time, m.end_time && el('small', { textContent: `to ${m.end_time}` })),
      el('div', {}, el('b', { textContent: m.title }), m.note && el('p', { textContent: m.note })),
      ask('Prep me', m.prep_prompt) || el('span'),
    );
  const part = (name, items = []) => items.length && [el('div', { className: 'part', textContent: name }), ...items.map(slot)];
  const todos = b.top_todos ?? [];
  const updates = b.new_updates ?? [];
  const slots = [...(b.your_day?.morning ?? []), ...(b.your_day?.afternoon ?? [])];
  const day = [...(part('Morning', b.your_day?.morning) || []), ...(part('Afternoon', b.your_day?.afternoon) || [])];
  const weekday = new Date(doc.at).toLocaleDateString('en-US', { weekday: 'long' });
  const counts = [
    todos.length && plural(todos.length, 'to-do'),
    updates.length && plural(updates.length, 'update'),
    slots.length && `${slots.length} on the calendar`,
  ].filter(Boolean);
  page.append(
    ...hero(`Howdy! Here's your ${weekday}.`, b.header?.greeting || 'Morning Brief', counts),
    ...(todos.length ? section('On your plate', el('div', { className: 'todos' }, ...todos.map(todo))) : []),
    ...(updates.length ? section('Fresh this morning', el('div', { className: 'updates' }, ...updates.map(update))) : []),
    ...(day.length ? section('How the day grows', el('div', { className: 'stem' }, ...day)) : []),
    ...(b.looking_ahead_blurb
      ? section('Up ahead', el('div', { className: 'ahead' }, el('div', { className: 'moon', ariaHidden: 'true' }), el('p', { textContent: b.looking_ahead_blurb })))
      : []),
    footer('Picked this morning by', b.footer?.sources ?? []),
  );
}

function prose(text) {
  const body = el('article', { className: 'prose' });
  body.innerHTML = md(text);
  return body;
}

function footer(lead, sources) {
  const links = sources.map((s) => link(s.url, s.name)).filter((s) => typeof s !== 'string');
  const list = links.flatMap((a, i) => [i === 0 ? ' from ' : i === links.length - 1 ? ' & ' : ', ', a]);
  return el('footer', {}, `${lead} `, el('span', { className: 'logo', textContent: 'Howdy' }), ...list);
}

if (!doc) {
  page.append(el('p', { textContent: 'This document is no longer in the history.' }));
} else {
  document.title = `${doc.title} · Howdy`;
  if (doc.kind === 'brief' && doc.json) brief(doc.json);
  else {
    const days = doc.days ? ` · last ${plural(doc.days, 'day')}` : '';
    // The title is already in the hero, so drop the report's own leading H1.
    const text = doc.text.replace(/^\s*# .*\n/, '');
    page.append(...hero(`${doc.kind === 'brief' ? 'Morning Brief' : 'Report'}${days}`, doc.title), prose(text), footer('Picked by', []));
  }
}
