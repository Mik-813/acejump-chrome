// Shared between the content script and the options page.
globalThis.AceJumpShared = (() => {
  const DEFAULTS = Object.freeze({
    labelChars: 'sadfjklewcmpgh',
    uppercaseLabels: true,
    caseMode: 'smart', // smart | insensitive | sensitive
    autoJumpSingle: true,
    liveHighlight: true,
    includeInputs: true,
    rememberLastQuery: true,
    inputPosition: 'top', // top | center | bottom
    jumpTarget: 'start', // start | end | select
    caretMode: true,
    showModeHint: true,
    theme: 'auto',
    customCss: '',
  });

  const THEMES = {
    dark: {
      name: 'Dark',
      vars: {
        '--aj-bar-bg': '#1e1f26',
        '--aj-bar-fg': '#e4e6eb',
        '--aj-bar-border': '#3a3c47',
        '--aj-input-bg': '#2a2c35',
        '--aj-input-fg': '#ffffff',
        '--aj-input-border': '#454856',
        '--aj-accent': '#7aa2f7',
        '--aj-error': '#f7768e',
        '--aj-label-bg': '#7aa2f7',
        '--aj-label-fg': '#11121a',
        '--aj-label-border': '#3d59a1',
        '--aj-label-typed-fg': 'rgba(17, 18, 26, 0.35)',
        '--aj-match-bg': 'rgba(122, 162, 247, 0.22)',
        '--aj-match-border': 'rgba(122, 162, 247, 0.75)',
        '--aj-caret': '#f7768e',
        '--aj-shadow': '0 8px 30px rgba(0, 0, 0, 0.45)',
      },
    },
    light: {
      name: 'Light',
      vars: {
        '--aj-bar-bg': '#ffffff',
        '--aj-bar-fg': '#1f2328',
        '--aj-bar-border': '#d0d7de',
        '--aj-input-bg': '#f6f8fa',
        '--aj-input-fg': '#1f2328',
        '--aj-input-border': '#d0d7de',
        '--aj-accent': '#0969da',
        '--aj-error': '#cf222e',
        '--aj-label-bg': '#0969da',
        '--aj-label-fg': '#ffffff',
        '--aj-label-border': '#0550ae',
        '--aj-label-typed-fg': 'rgba(255, 255, 255, 0.45)',
        '--aj-match-bg': 'rgba(9, 105, 218, 0.15)',
        '--aj-match-border': 'rgba(9, 105, 218, 0.6)',
        '--aj-caret': '#cf222e',
        '--aj-shadow': '0 8px 24px rgba(140, 149, 159, 0.35)',
      },
    },
    vimium: {
      name: 'Vimium (yellow)',
      vars: {
        '--aj-bar-bg': '#fffbe6',
        '--aj-bar-fg': '#302505',
        '--aj-bar-border': '#e3be23',
        '--aj-input-bg': '#ffffff',
        '--aj-input-fg': '#302505',
        '--aj-input-border': '#e3be23',
        '--aj-accent': '#c38a22',
        '--aj-error': '#d1242f',
        '--aj-label-bg': 'linear-gradient(to bottom, #fff785 0%, #ffc542 100%)',
        '--aj-label-fg': '#302505',
        '--aj-label-border': '#c38a22',
        '--aj-label-typed-fg': '#d4ac3a',
        '--aj-match-bg': 'rgba(255, 197, 66, 0.3)',
        '--aj-match-border': 'rgba(195, 138, 34, 0.8)',
        '--aj-caret': '#d1242f',
        '--aj-shadow': '0 3px 7px rgba(0, 0, 0, 0.3)',
      },
    },
    dracula: {
      name: 'Dracula',
      vars: {
        '--aj-bar-bg': '#282a36',
        '--aj-bar-fg': '#f8f8f2',
        '--aj-bar-border': '#44475a',
        '--aj-input-bg': '#1e1f29',
        '--aj-input-fg': '#f8f8f2',
        '--aj-input-border': '#6272a4',
        '--aj-accent': '#bd93f9',
        '--aj-error': '#ff5555',
        '--aj-label-bg': '#ff79c6',
        '--aj-label-fg': '#282a36',
        '--aj-label-border': '#bd93f9',
        '--aj-label-typed-fg': 'rgba(40, 42, 54, 0.4)',
        '--aj-match-bg': 'rgba(189, 147, 249, 0.25)',
        '--aj-match-border': 'rgba(189, 147, 249, 0.8)',
        '--aj-caret': '#50fa7b',
        '--aj-shadow': '0 8px 30px rgba(0, 0, 0, 0.5)',
      },
    },
    nord: {
      name: 'Nord',
      vars: {
        '--aj-bar-bg': '#2e3440',
        '--aj-bar-fg': '#eceff4',
        '--aj-bar-border': '#4c566a',
        '--aj-input-bg': '#3b4252',
        '--aj-input-fg': '#eceff4',
        '--aj-input-border': '#4c566a',
        '--aj-accent': '#88c0d0',
        '--aj-error': '#bf616a',
        '--aj-label-bg': '#88c0d0',
        '--aj-label-fg': '#2e3440',
        '--aj-label-border': '#5e81ac',
        '--aj-label-typed-fg': 'rgba(46, 52, 64, 0.4)',
        '--aj-match-bg': 'rgba(136, 192, 208, 0.22)',
        '--aj-match-border': 'rgba(136, 192, 208, 0.75)',
        '--aj-caret': '#ebcb8b',
        '--aj-shadow': '0 8px 30px rgba(0, 0, 0, 0.4)',
      },
    },
    solarized: {
      name: 'Solarized light',
      vars: {
        '--aj-bar-bg': '#fdf6e3',
        '--aj-bar-fg': '#586e75',
        '--aj-bar-border': '#d6cfb8',
        '--aj-input-bg': '#eee8d5',
        '--aj-input-fg': '#073642',
        '--aj-input-border': '#d6cfb8',
        '--aj-accent': '#268bd2',
        '--aj-error': '#dc322f',
        '--aj-label-bg': '#b58900',
        '--aj-label-fg': '#fdf6e3',
        '--aj-label-border': '#8a6a00',
        '--aj-label-typed-fg': 'rgba(253, 246, 227, 0.45)',
        '--aj-match-bg': 'rgba(181, 137, 0, 0.18)',
        '--aj-match-border': 'rgba(181, 137, 0, 0.7)',
        '--aj-caret': '#d33682',
        '--aj-shadow': '0 8px 24px rgba(88, 110, 117, 0.3)',
      },
    },
    contrast: {
      name: 'High contrast',
      vars: {
        '--aj-bar-bg': '#000000',
        '--aj-bar-fg': '#ffffff',
        '--aj-bar-border': '#ffffff',
        '--aj-input-bg': '#000000',
        '--aj-input-fg': '#ffff00',
        '--aj-input-border': '#ffffff',
        '--aj-accent': '#ffff00',
        '--aj-error': '#ff3b3b',
        '--aj-label-bg': '#ffff00',
        '--aj-label-fg': '#000000',
        '--aj-label-border': '#000000',
        '--aj-label-typed-fg': '#9a9a00',
        '--aj-match-bg': 'rgba(255, 255, 0, 0.3)',
        '--aj-match-border': '#ffff00',
        '--aj-caret': '#ff00ff',
        '--aj-shadow': 'none',
      },
    },
  };

  const THEME_OPTIONS = [
    ['auto', 'Auto (follow system: Light / Dark)'],
    ...Object.entries(THEMES).map(([id, t]) => [id, t.name]),
  ];

  const varsBlock = (selector, vars) =>
    `${selector} {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;

  function themeCss(theme) {
    if (theme === 'auto') {
      return `${varsBlock(':host', THEMES.light.vars)}\n@media (prefers-color-scheme: dark) {\n${varsBlock(':host', THEMES.dark.vars)}\n}`;
    }
    return varsBlock(':host', (THEMES[theme] ?? THEMES.dark).vars);
  }

  const BASE_CSS = `
:host {
  --aj-font: system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif;
  --aj-label-font: ui-monospace, "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace;
  --aj-font-size: 14px;
  --aj-label-font-size: 12px;
  --aj-radius: 10px;
}
[hidden] { display: none !important; }
.aj-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: var(--aj-font);
  font-size: var(--aj-font-size);
  line-height: 1.3;
  color: var(--aj-bar-fg);
}
.aj-bar {
  position: fixed;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  background: var(--aj-bar-bg);
  color: var(--aj-bar-fg);
  border: 1px solid var(--aj-bar-border);
  border-radius: var(--aj-radius);
  box-shadow: var(--aj-shadow);
  pointer-events: auto;
  z-index: 3;
}
.aj-bar[data-position="center"] { top: 30%; }
.aj-bar[data-position="bottom"] { top: auto; bottom: 16px; }
.aj-prompt { font-weight: 600; opacity: 0.8; white-space: nowrap; }
.aj-input {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 6px 9px;
  font: inherit;
  color: var(--aj-input-fg);
  background: var(--aj-input-bg);
  border: 1px solid var(--aj-input-border);
  border-radius: calc(var(--aj-radius) - 4px);
  outline: none;
  caret-color: var(--aj-accent);
}
.aj-input:focus { border-color: var(--aj-accent); }
.aj-bar[data-mode="labels"] .aj-input { opacity: 0.6; }
.aj-count {
  font-size: 12px;
  opacity: 0.75;
  min-width: 7ch;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.aj-bar.aj-error .aj-input { border-color: var(--aj-error); }
.aj-bar.aj-error .aj-count { color: var(--aj-error); opacity: 1; }
.aj-bar.aj-shake { animation: aj-shake 0.3s; }
@keyframes aj-shake {
  0%, 100% { transform: translateX(-50%); }
  25% { transform: translateX(calc(-50% - 6px)); }
  75% { transform: translateX(calc(-50% + 6px)); }
}
.aj-match {
  position: fixed;
  box-sizing: border-box;
  background: var(--aj-match-bg);
  outline: 1px solid var(--aj-match-border);
  border-radius: 2px;
  z-index: 1;
}
.aj-label {
  position: fixed;
  z-index: 2;
  box-sizing: border-box;
  padding: 1px 3px;
  font-family: var(--aj-label-font);
  font-size: var(--aj-label-font-size);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--aj-label-fg);
  background: var(--aj-label-bg);
  border: 1px solid var(--aj-label-border);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transform: translateY(-15%);
}
.aj-label .aj-typed { color: var(--aj-label-typed-fg); }
.aj-label.aj-hidden, .aj-match.aj-hidden { display: none; }
.aj-caret {
  position: fixed;
  width: 2px;
  margin-left: -1px;
  background: var(--aj-caret);
  box-shadow: 0 0 4px var(--aj-caret);
  z-index: 2;
  animation: aj-blink 1s steps(1) infinite;
}
@keyframes aj-blink { 50% { opacity: 0; } }
.aj-mode {
  position: fixed;
  right: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 12px;
  background: var(--aj-bar-bg);
  color: var(--aj-bar-fg);
  border: 1px solid var(--aj-bar-border);
  border-radius: 999px;
  box-shadow: var(--aj-shadow);
  z-index: 3;
}
.aj-mode-name {
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--aj-accent);
}
.aj-mode-hint { opacity: 0.7; }
.aj-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 6px 12px;
  font-size: 13px;
  background: var(--aj-bar-bg);
  color: var(--aj-bar-fg);
  border: 1px solid var(--aj-accent);
  border-radius: 999px;
  box-shadow: var(--aj-shadow);
  z-index: 4;
}
`;

  function buildCss(settings) {
    return `${BASE_CSS}\n${themeCss(settings.theme)}\n/* custom */\n${settings.customCss ?? ''}`;
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(null);
      return { ...DEFAULTS, ...stored };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function normalizeLabelChars(chars) {
    const unique = [...new Set([...(chars || '').toLowerCase()].filter((c) => /\S/.test(c)))];
    return unique.length >= 2 ? unique : [...DEFAULTS.labelChars];
  }

  // Vimium-style prefix-free label generation.
  function generateLabels(count, labelChars) {
    const chars = normalizeLabelChars(labelChars);
    if (count <= 0) return [];
    let hints = [''];
    let offset = 0;
    while (hints.length - offset < count || hints.length === 1) {
      const hint = hints[offset++];
      for (const ch of chars) hints.push(ch + hint);
    }
    hints = hints.slice(offset, offset + count);
    return hints.sort().map((h) => [...h].reverse().join(''));
  }

  return { DEFAULTS, THEMES, THEME_OPTIONS, BASE_CSS, buildCss, loadSettings, normalizeLabelChars, generateLabels };
})();
