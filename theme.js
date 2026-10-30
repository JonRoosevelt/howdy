function applyTheme(t) {
  const root = document.documentElement;
  root.removeAttribute('style');
  if (!t) return;
  root.style.colorScheme = t.scheme;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
}

// localStorage is synchronous, so pages paint in the chosen theme without a flash; chrome.storage stays the source of truth.
applyTheme(JSON.parse(localStorage.getItem('howdy-theme') || 'null'));
const keep = (t) => {
  localStorage.setItem('howdy-theme', JSON.stringify(t ?? null));
  applyTheme(t);
};
chrome.storage.local.get('theme').then(({ theme }) => keep(theme));
chrome.storage.onChanged.addListener((c) => c.theme && keep(c.theme.newValue));
