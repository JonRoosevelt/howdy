const preset = (name, scheme, [paper, paper2, ink, ink2, ink3, blue, pink]) => ({
  name,
  scheme,
  vars: {
    '--paper': paper,
    '--paper-2': paper2,
    '--ink': ink,
    '--ink-2': ink2,
    '--ink-3': ink3,
    '--line': `color-mix(in srgb, ${ink} 20%, transparent)`,
    '--blue': blue,
    '--on-blue': paper,
    '--pink': pink,
    '--on-pink': paper,
    '--pink-ink': pink,
    '--pink-wash': `color-mix(in srgb, ${pink} 18%, ${paper})`,
    '--riso-ink': blue,
    '--riso-paper': scheme === 'light' ? `color-mix(in srgb, ${pink} 55%, ${paper})` : pink,
  },
});

export const THEMES = {
  riso: { name: 'Riso Garden', scheme: 'light dark', vars: {}, swatch: ['#FBFAF6', '#1E2A78', '#2340B8', '#FF5C9D'] },
  'tokyo-night': preset('Tokyo Night', 'dark', ['#1a1b26', '#24283b', '#c0caf5', '#a9b1d6', '#8089b3', '#7aa2f7', '#bb9af7']),
  catppuccin: preset('Catppuccin', 'dark', ['#1e1e2e', '#313244', '#cdd6f4', '#bac2de', '#9399b2', '#89b4fa', '#f5c2e7']),
  'catppuccin-latte': preset('Catppuccin Latte', 'light', ['#eff1f5', '#e6e9ef', '#4c4f69', '#5c5f77', '#6c6f85', '#1e66f5', '#8839ef']),
  everforest: preset('Everforest', 'dark', ['#2d353b', '#343f44', '#d3c6aa', '#c5bba0', '#9da9a0', '#a7c080', '#e69875']),
  gruvbox: preset('Gruvbox', 'dark', ['#282828', '#3c3836', '#ebdbb2', '#d5c4a1', '#a89984', '#83a598', '#fe8019']),
  kanagawa: preset('Kanagawa', 'dark', ['#1f1f28', '#2a2a37', '#dcd7ba', '#c8c093', '#938aa9', '#7e9cd8', '#d27e99']),
  nord: preset('Nord', 'dark', ['#2e3440', '#3b4252', '#eceff4', '#d8dee9', '#a3abba', '#88c0d0', '#b48ead']),
  'rose-pine': preset('Rosé Pine', 'dark', ['#191724', '#1f1d2e', '#e0def4', '#c4c1de', '#908caa', '#c4a7e7', '#eb6f92']),
  'matte-black': preset('Matte Black', 'dark', ['#121212', '#1e1e1e', '#bebebe', '#a0a0a0', '#8a8a8d', '#e68e0d', '#d35f5f']),
  'flexoki-light': preset('Flexoki Light', 'light', ['#fffcf0', '#f2f0e5', '#100f0f', '#403e3c', '#6f6e69', '#205ea6', '#a02f6f']),
};

export const swatch = (t) => t.swatch ?? ['--paper', '--ink', '--blue', '--pink'].map((k) => t.vars[k]);
