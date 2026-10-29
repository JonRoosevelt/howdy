// Slack's web client keeps a per-workspace session token (xoxc-) here; paired with the browser's `d` cookie it authenticates API calls as the user.
const teams = JSON.parse(localStorage.getItem('localConfig_v2') || '{}').teams;
if (teams) {
  chrome.storage.local.set({
    slackTeams: Object.values(teams).map(({ id, name, url, token }) => ({ id, name, url, token })),
  });
}
