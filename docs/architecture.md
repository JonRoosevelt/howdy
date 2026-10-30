# Architecture

## Files

| File | Role |
|---|---|
| `manifest.json` | Permissions, content scripts, service worker |
| `background.js` | Runs brief/report generation, schedules the Morning Brief (`chrome.alarms`), installs the header rules |
| `lib.js` | Tools, agent loop (OpenAI and Anthropic APIs), prompts, generation, document history |
| `google.js` | Calendar via `SAPISIDHASH`, Gmail via the offscreen document |
| `gmail.html`, `gmail-offscreen.js` | Hidden page that hosts Gmail in an iframe |
| `gmail-frame.js` | Runs inside the hidden Gmail: reads search results and threads |
| `slack-session.js` | Picks up the Slack web session |
| `themes.js` | Color theme presets |
| `theme.js` | Applies the saved theme on every Howdy page |
| `app.html`, `app.js` | Popup: generate, history, settings |
| `doc.html`, `doc.js` | Page for one brief or report, opened in a new tab |
| `page.js` | Chat button and side panel; content script on every site, plain script on `doc.html` |
| `chat.html`, `chat.js` | Chat UI inside the panel iframe |
| `ui.js` | DOM and markdown helpers shared by the pages |
| `theme.css`, `fonts/` | Colour tokens and shared styles for the extension pages; Fraunces (OFL 1.1) bundled as variable woff2, no remote fonts |
| `check.js` | End-to-end check with Playwright and mocks |

## Agent

`agent()` in `lib.js` runs a tool-calling loop against either API shape:
- OpenAI-compatible `/chat/completions` with `tools` / `tool_calls`;
- Anthropic `/v1/messages` with `tool_use` / `tool_result`.

Tool calls in one step run in parallel. Each tool call times out after 120 s and each model request after 180 s. Every step logs its timings to the service worker console (`[howdy 42s] step 3: ...`). The loop stops when the model answers without tool calls, and the last step forces `tool_choice: none`, so it always ends with an answer. Tool output is capped at 20k characters.

Tools:

| Tool | Source |
|---|---|
| `read_calendar` | Google Calendar events between `days_back` and `days_ahead` |
| `search_gmail` | Gmail search with Gmail operators |
| `read_gmail_thread` | Full Gmail thread text |
| `slack_activity` | Slack mentions and recent DMs |
| `search_slack` | Slack search with Slack operators |
| `read_slack_thread` | Full Slack thread |
| `search_jira` | Jira issues by JQL |
| `read_jira_issue` | Jira issue description and latest comments |
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

The page renders it with `textContent`, so text from email or Slack cannot inject HTML. Links render only for `https://` URLs. `cta_prompt` and `prep_prompt` become buttons that open the chat panel with that prompt.

Reports and chat use the same tools with markdown output. A small renderer escapes HTML first, then allows headings, lists, bold text, inline code and `https` links.

## Documents and history

Every brief and report is saved by `saveDoc()` in `chrome.storage.local` under `docs` (newest 60), as `{ id, kind, at, title, text, json?, days?, painting, done? }`, and opened as `doc.html?id=<id>`. The popup lists them. `painting` comes from The Met's open-access API (Drawings and Prints, public-domain botanical studies, top 50 hits), picked by day, skipping hits without an image; `doc.html` prints it in blue over pink with CSS blend modes. If the API fails the hero falls back to a CSS-only arch. Checked to-dos are stored in `done`.

Generation runs in the service worker, not the popup, because the popup closes when it loses focus. Progress goes to `chrome.storage.session` under `job`, which the popup shows; a job older than 15 minutes counts as abandoned.

## Chat panel

`page.js` adds a button in a shadow root on every `http(s)` page. On first click it creates an iframe of `chat.html` (a web-accessible resource) in a panel on the right. Before each question, `chat.js` asks its parent for `{ url, title, text }` with `postMessage`, and puts the first 15k characters into the system prompt as data.

The chat gets one extra tool, `create_report({ title, markdown })`, which saves a report to the history and opens it in a new tab.

A web page can post messages to the iframe too, so the only message it can usefully send is the page context, which is page content anyway. Prompts (`ask`) are accepted only from Howdy's own origin, which is how the brief page's buttons drive the chat; a site cannot make the agent run.

## Sessions instead of OAuth

Every source reuses the session the user already has in the browser, so there is nothing to set up.

**Slack.** `slack-session.js` runs on `app.slack.com` and reads `localStorage.localConfig_v2`, where Slack's web client keeps a per-workspace `xoxc-` token. API calls go to `https://<workspace>.slack.com/api/<method>` with that token in the body and `credentials: 'include'`, so the browser adds the `d` session cookie.

**Jira.** Jira Cloud sites are suggested from browser history (`*.atlassian.net` hosts, most visited first), or set in the Sources tab. Calls go to `https://<site>/rest/api/3/search/jql` and `/rest/api/3/issue/<key>` with `credentials: 'include'`, so the browser adds the Atlassian session cookie. Descriptions and comments come as Atlassian Document Format and are flattened to text.

**Google Calendar.** The extension:
1. reads the `SAPISID` cookie with `chrome.cookies`;
2. builds `Authorization: SAPISIDHASH <ts>_<sha1(ts + " " + SAPISID + " https://calendar.google.com")>`;
3. calls `https://clients6.google.com/calendar/v3/calendars/primary/events` with the browser API key that Calendar on the web uses. No key is bundled: candidates are read from the user's own `calendar.google.com/calendar/u/N/r` page, each is tried, and the one that works is cached in `chrome.storage.local`. If the cached key stops working, discovery runs again.

A `declarativeNetRequest` session rule sets `Origin` and `Referer` to `https://calendar.google.com` on those requests, because `fetch` cannot set `Origin` itself. The `X-Goog-AuthUser` header picks the account.

**Gmail.**
- **Hidden Gmail:** `google.js` creates an offscreen document (`gmail.html`, reason `DOM_SCRAPING`). It loads `mail.google.com/mail/u/N/?bd=<nonce>#search/<query>` in an iframe. A second `declarativeNetRequest` rule strips `X-Frame-Options` and `Content-Security-Policy` from `mail.google.com` sub-frames, only for requests outside tabs (`tabId -1`), which means only extension contexts.
- **Search:** `gmail-frame.js` is a `MAIN`-world content script that captures the nonce at `document_start`. It waits for the results list and reads each row (`tr.zA`: sender `[email]`, subject `.bog`, snippet `.y2`, date `.xW [title]`, unread `.zE`, thread id `data-legacy-thread-id`), then posts the rows to the parent page with `postMessage`.
- **Threads:** a search also returns Gmail's `ik` token (`GLOBALS[9]`), which is cached per account. With it, a thread is a single `fetch` of the print view (`?ik=<ik>&view=pt&permthid=thread-f:<id>`) with the session cookies, so threads read in parallel without booting Gmail. Without a cached `ik`, or if that fetch fails, the hidden frame loads Gmail and fetches the print view itself.

Calls share one offscreen document, so they run one at a time. The document closes when the agent finishes. Two agents at once (say, a scheduled brief and a chat) share it too, and whichever finishes first closes it.

## Scheduling

`background.js` creates a daily `brief` alarm at the configured hour. Alarms do not fire while the browser is closed, so on startup it generates the brief if today's run was missed. While generating, it calls `chrome.runtime.getPlatformInfo` every 20 s, because the service worker would otherwise be stopped after 30 s without extension API calls.

## Security notes

- The `cookies` permission on `*.google.com` gives access as broad as the signed-in Google account, not only read access to Gmail and Calendar.
- Host access to `*.atlassian.net` lets the extension act as the signed-in Jira user; the tools only read.
- The LLM API key and the Slack `xoxc` token are stored unencrypted in `chrome.storage.local`.
- Tools are read-only, except `create_report` in the chat, which only writes to the local history. Source content and page content are untrusted, and the prompts tell the model to treat them as data, not instructions.
- The chat content script runs on every `http(s)` site, so the extension asks for access to all sites at install.
