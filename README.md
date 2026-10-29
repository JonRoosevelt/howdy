# Howdy

Morning Brief, Reports and Chat over your Google Calendar, Gmail, Slack and browser history. A browser extension for Chromium browsers that works with your own LLM.

## Install

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this folder.
2. Click the extension icon and open the **Settings** tab.

## Setup

**LLM** (must support tool calling)
- OpenAI-compatible: OpenAI, DeepSeek (`https://api.deepseek.com`, model `deepseek-v4-flash`), OpenRouter, Groq, Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`), Ollama/LM Studio (`http://localhost:11434/v1`). The Base URL field suggests these.
- Anthropic: provider `Anthropic`, e.g. model `claude-sonnet-5-5`.

On **Save** the browser asks for permission to call the LLM host. Accept it, or requests are blocked.

**Google (Gmail + Calendar)**
Nothing to configure: Howdy uses the Google account already signed in to the browser. With several accounts, enter the N from `mail.google.com/mail/u/N`. Use **Test Google** to check the connection.

**Slack**
Click **Connect Slack** to open Slack on the web. If you are already signed in, Howdy picks up the session on its own. Then pick the workspace and save. If the session expires, click it again.

## How it works

An agent calls tools in a loop, checks whether each to-do was already handled, and returns the brief as JSON that the page renders. CTA buttons open the chat with the prompt ready to send. See [docs/architecture.md](docs/architecture.md).

The brief runs on its own at the configured hour, or on the first browser start after it, and marks the icon with a badge.

Generated text follows the browser's language (`navigator.language`).

Everything is stored in `chrome.storage.local`, API keys included. Data only leaves the browser to reach the source services and the configured LLM.

## Check

```sh
npm i
npx playwright install chromium
npm run check
```

Loads the extension in Chromium with a mocked LLM, Slack, Calendar and Gmail, and validates the tool loop, the session capture and the brief rendering.

## More

- [docs/architecture.md](docs/architecture.md): how each part works
- [ROADMAP.md](ROADMAP.md): next steps
