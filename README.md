# Howdy

Morning Brief, Reports and Chat over your Google Calendar, Gmail, Slack and browser history. A browser extension for Chromium browsers that works with your own LLM.

## Install

Works in Chromium browsers with developer mode (Chrome, Arc, Edge, Brave). No build step and no shared secrets: each person uses their own LLM key and their own Google and Slack sessions.

1. Clone the repository:
   ```sh
   git clone https://github.com/JonRoosevelt/howdy.git
   ```
2. Open `chrome://extensions` (or the equivalent page in your browser).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `howdy` folder.
5. Pin the extension, click its icon and open **Settings** to finish the [setup](#setup).

The browser may warn about developer-mode extensions on startup; that is expected for unpacked extensions.

### Update

Unpacked extensions do not update on their own:

```sh
cd howdy && git pull
```

Then click the reload icon on the extension's card in `chrome://extensions`.

## Setup

**LLM** (must support tool calling)
- OpenAI-compatible: OpenAI, DeepSeek (`https://api.deepseek.com`, model `deepseek-v4-flash`), OpenRouter, Groq, Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`), Ollama/LM Studio (`http://localhost:11434/v1`). The Base URL field suggests these.
- Anthropic: provider `Anthropic`, e.g. model `claude-sonnet-5-5`.

On **Save** the browser asks for permission to call the LLM host. Accept it, or requests are blocked.

**Google (Gmail + Calendar)**
Nothing to configure: Howdy uses the Google account already signed in to the browser. With several accounts, enter the N from `mail.google.com/mail/u/N`. Use **Test Google** to check the connection.

**Slack**
Click **Connect Slack** to open Slack on the web. If you are already signed in, Howdy picks up the session on its own. Then pick the workspace and save. If the session expires, click it again.

## Use

- **Popup** (click the icon): generate a Morning Brief or a report, and browse the history. Each brief and report opens as its own page in a new tab, with a public-domain botanical study from The Met, printed in two riso-style inks.
- **Brief page:** check off to-dos (saved), open the source, or click a suggestion button to ask the chat about it.
- **Chat:** a blue leaf-shaped button sits at the bottom right of every page. It opens a panel on the right where you can chat with the agent, and the page you are on is added as context. Ask for a report and the chat writes it, saves it to the history and opens it in a new tab.

## How it works

An agent calls tools in a loop, checks whether each to-do was already handled, and returns the brief as JSON that the page renders. See [docs/architecture.md](docs/architecture.md).

The brief also runs on its own at the configured hour, or on the first browser start after it, and marks the icon with a badge.

Generated text follows the browser's language (`navigator.language`).

Everything is stored in `chrome.storage.local`, API keys included. Data only leaves the browser to reach the source services and the configured LLM.

## Check

```sh
npm i
npx playwright install chromium
npm run check
```

Loads the extension in Chromium with a mocked LLM, Slack, Calendar and Gmail, and validates the tool loop, the session capture, the brief and report pages, the history, and the chat panel on a regular site.

## More

- [docs/architecture.md](docs/architecture.md): how each part works
- [ROADMAP.md](ROADMAP.md): next steps
