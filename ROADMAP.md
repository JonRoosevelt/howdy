# Roadmap

## Done (v0.1)

- [x] MV3 extension for Chromium browsers
- [x] Bring your own LLM: OpenAI-compatible APIs (OpenAI, DeepSeek, OpenRouter, Gemini, Groq, Ollama) and Anthropic
- [x] Agent loop with parallel tool calls
- [x] Scheduled Morning Brief as JSON, rendered with `textContent`
- [x] Reports by period (1/7/30 days) with an optional focus
- [x] Chat with the same tools; brief CTAs and meeting prep open the chat
- [x] Slack through the browser session (`xoxc` + cookies)
- [x] Google Calendar through the browser session (`SAPISIDHASH`)
- [x] Invisible Gmail (offscreen document + iframe) with search and thread reading
- [x] Browser history
- [x] End-to-end check with Playwright (`npm run check`)

## Next

### 1. More sources

High priority: much of the to-do list for people working with tickets and PRs lives here. Reuse the browser session wherever possible.

- [ ] **GitHub:** a `github_search(url)` tool that reads a GitHub URL, fetching `github.com/pulls/review-requested`, `github.com/pulls` and `github.com/notifications` with cookies.
- [ ] **Jira/Confluence:** REST `/{site}.atlassian.net/rest/api/3/search?jql=assignee=currentUser() AND updated>=-3d` and Confluence CQL, both with session cookies. Discover `site` from browser history.
- [ ] **Notion:** the internal `www.notion.so/api/v3/search` with the `token_v2` cookie, or the public API with an integration. Evaluate how stable each is.
- [ ] **Linear:** GraphQL on `api.linear.app` with the session; a `list_linear_notifications` tool for the inbox.
- [ ] **`list_recent_people`:** combine Gmail senders, meeting attendees and Slack DMs to map who the user works with most, and use it to scope the other searches.

### 2. Brief quality

- [ ] **To-do verifier sub-agent:** a second pass that checks every `top_todo` against the user's own sent messages before publishing.
- [ ] **`important_people`:** a short blurb per person in today's meetings (role, recent context), with web research for external people.
- [ ] **`proactive_work`:** the agent starts a draft for the most important to-do.
- [ ] **Avatars** (`avatar_urls`) from Slack (`users.info`) and Google.
- [ ] **Persistent user context** (role, team, projects) between runs, so each brief does not rediscover it.

### 3. Design

- [ ] A designed brief: greeting card, project pills, source icons, agenda timeline, "Looking ahead".
- [ ] An image of the day, e.g. an open-access painting (National Gallery of Art, Met Open Access).
- [ ] Optional brief on the new tab page (`chrome_url_overrides.newtab`).
- [ ] Chat in a side panel (`chrome.sidePanel`; `sidebar_action` on Firefox).

### 4. Robustness

- [ ] **Slack:**
  - page through all DMs instead of the 15 most recent;
  - retry on `ratelimited`;
  - confirm that searching for `<@USERID>` finds mentions.
- [ ] **Gmail:**
  - if the list markup changes, fall back to capturing Gmail's internal `/sync/u/N/i/bv` responses;
  - page beyond 50 results.
- [ ] **DeepSeek in thinking mode:** check how it handles `reasoning_content` sent back between tool calls.
- [ ] **Scheduled briefs:** show progress (today only a badge appears when done) and keep an error log.
- [ ] **Context size:** summarize large tool results before sending them back to the model.
- [ ] **Firefox:** MV3 with `background.scripts`; there is no `offscreen` API there.

### 5. Security

- [ ] Encrypt the LLM API key (WebCrypto + passphrase) instead of storing plain text in `chrome.storage.local`.
- [ ] Narrow permissions: replace `*.google.com` with exact hosts (`mail.google.com`, `clients6.google.com`, `www.google.com` for the cookie).
- [ ] Prompt injection: tools are read-only, but links produced by the LLM are clickable. Consider a domain allowlist for `source_url`.
