# Architecture

## Files

| File | Role |
|---|---|
| `manifest.json` | Permissions, content scripts, service worker |
| `background.js` | Schedules the Morning Brief (`chrome.alarms`) and installs the header rules |
| `lib.js` | Tools, agent loop (OpenAI and Anthropic APIs), prompts, brief/report generation |
| `google.js` | Calendar via `SAPISIDHASH`, Gmail via the offscreen document |
| `gmail.html`, `gmail-offscreen.js` | Hidden page that hosts Gmail in an iframe |
| `gmail-frame.js` | Runs inside the hidden Gmail: reads search results and threads |
| `slack-session.js` | Picks up the Slack web session |
| `app.html`, `app.js` | UI: Brief, Reports, Chat, Settings |
| `check.js` | End-to-end check with Playwright and mocks |

## Agent

`agent()` in `lib.js` runs a tool-calling loop against either API shape:
- OpenAI-compatible `/chat/completions` with `tools` / `tool_calls`;
- Anthropic `/v1/messages` with `tool_use` / `tool_result`.

Tool calls in one step run in parallel. The loop stops when the model answers without tool calls, and the last step forces `tool_choice: none`, so it always ends with an answer. Tool output is capped at 20k characters.

Tools:

| Tool | Source |
|---|---|
| `read_calendar` | Google Calendar events between `days_back` and `days_ahead` |
| `search_gmail` | Gmail search with Gmail operators |
| `read_gmail_thread` | Full Gmail thread text |
| `slack_activity` | Slack mentions and recent DMs |
| `search_slack` | Slack search with Slack operators |
| `read_slack_thread` | Full Slack thread |
| `search_history` | Local browser history |

## Morning Brief

The brief prompt asks the agent to:
1. sweep every source in parallel;
2. work out who the user is and their priority projects;
3. read the candidate threads and drop anything the user already handled;
4. select up to 5 to-dos and 4 updates, plus the day's agenda.

The final answer is JSON only:

```
header        { date_time, greeting }
top_todos[]   { label, label_style: active|outline, title, body, source_url, source_name, cta_label?, cta_prompt? }
new_updates[] { label, label_style, title, body, source_url, source_name }
your_day      { morning[], afternoon[] }  each { time, end_time, title, note, prep_prompt? }
looking_ahead_blurb
footer        { sources[] { name, url } }
```

The page renders it with `textContent`, so text from email or Slack cannot inject HTML. Links render only for `https://` URLs. `cta_prompt` and `prep_prompt` become buttons that open the chat with that prompt.

Reports and chat use the same tools with markdown output. A small renderer escapes HTML first, then allows headings, bold text and `https` links.

## Sessions instead of OAuth

Every source reuses the session the user already has in the browser, so there is nothing to set up.

**Slack.** `slack-session.js` runs on `app.slack.com` and reads `localStorage.localConfig_v2`, where Slack's web client keeps a per-workspace `xoxc-` token. API calls go to `https://<workspace>.slack.com/api/<method>` with that token in the body and `credentials: 'include'`, so the browser adds the `d` session cookie.

**Google Calendar.** The extension:
1. reads the `SAPISID` cookie with `chrome.cookies`;
2. builds `Authorization: SAPISIDHASH <ts>_<sha1(ts + " " + SAPISID + " https://calendar.google.com")>`;
3. calls `https://clients6.google.com/calendar/v3/calendars/primary/events` with the browser API key that Calendar on the web uses. No key is bundled: candidates are read from the user's own `calendar.google.com/calendar/u/N/r` page, each is tried, and the one that works is cached in `chrome.storage.local`. If the cached key stops working, discovery runs again.

A `declarativeNetRequest` session rule sets `Origin` and `Referer` to `https://calendar.google.com` on those requests, because `fetch` cannot set `Origin` itself. The `X-Goog-AuthUser` header picks the account.

**Gmail.**
- **Hidden Gmail:** `google.js` creates an offscreen document (`gmail.html`, reason `DOM_SCRAPING`). It loads `mail.google.com/mail/u/N/?bd=<nonce>#search/<query>` in an iframe. A second `declarativeNetRequest` rule strips `X-Frame-Options` and `Content-Security-Policy` from `mail.google.com` sub-frames, only for requests outside tabs (`tabId -1`), which means only extension contexts.
- **Search:** `gmail-frame.js` is a `MAIN`-world content script that captures the nonce at `document_start`. It waits for the results list and reads each row (`tr.zA`: sender `[email]`, subject `.bog`, snippet `.y2`, date `.xW [title]`, unread `.zE`, thread id `data-legacy-thread-id`), then posts the rows to the parent page with `postMessage`.
- **Threads:** the frame fetches Gmail's print view (`?ik=<GLOBALS[9]>&view=pt&permthid=thread-f:<id>`) same-origin and returns the text.

Calls share one offscreen document, so they run one at a time. The document closes when the agent finishes.

## Scheduling

`background.js` creates a daily `brief` alarm at the configured hour. Alarms do not fire while the browser is closed, so on startup it generates the brief if today's run was missed. While generating, it calls `chrome.runtime.getPlatformInfo` every 20 s, because the service worker would otherwise be stopped after 30 s without extension API calls.

## Security notes

- The `cookies` permission on `*.google.com` gives access as broad as the signed-in Google account, not only read access to Gmail and Calendar.
- The LLM API key and the Slack `xoxc` token are stored unencrypted in `chrome.storage.local`.
- Tools are read-only. Source content is untrusted, and the prompts tell the model to treat it as data, not instructions.
