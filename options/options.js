const { DEFAULTS, THEMES, THEME_OPTIONS, buildCss, loadSettings, generateLabels } = globalThis.AceJumpShared;

const $ = (sel) => document.querySelector(sel);
const fields = [...document.querySelectorAll('[data-key]')];
let settings = { ...DEFAULTS };

const EXAMPLE_CSS = `/* Bigger, rounder labels */
:host {
  --aj-label-font-size: 13px;
  --aj-radius: 6px;
}
.aj-label {
  border-radius: 999px;
  padding: 1px 6px;
}

/* Compact input bar */
.aj-bar {
  width: 360px;
}
.aj-prompt {
  display: none;
}
`;

// ---------- theme select + swatches ----------
const themeSelect = $('#theme');
for (const [id, name] of THEME_OPTIONS) themeSelect.append(new Option(name, id));

const swatches = $('#swatches');
for (const [id, name] of THEME_OPTIONS) {
  const vars = id === 'auto' ? null : THEMES[id].vars;
  const sw = document.createElement('button');
  sw.type = 'button';
  sw.className = 'swatch';
  sw.dataset.theme = id;
  sw.setAttribute('role', 'radio');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = 'AJ';
  if (vars) {
    chip.style.background = vars['--aj-label-bg'];
    chip.style.color = vars['--aj-label-fg'];
    chip.style.border = `1px solid ${vars['--aj-label-border']}`;
  } else {
    chip.style.background = `linear-gradient(135deg, ${THEMES.light.vars['--aj-label-bg']} 50%, ${THEMES.dark.vars['--aj-label-bg']} 50%)`;
    chip.style.color = '#fff';
  }
  sw.append(chip, id === 'auto' ? 'Auto' : name);
  sw.addEventListener('click', () => save({ theme: id }));
  swatches.append(sw);
}

// ---------- variable reference ----------
const varList = $('#var-list');
for (const v of ['--aj-font', '--aj-label-font', '--aj-font-size', '--aj-label-font-size', '--aj-radius', ...Object.keys(THEMES.dark.vars)]) {
  const li = document.createElement('li');
  const code = document.createElement('code');
  code.textContent = v;
  li.append(code);
  varList.append(li);
}

// ---------- preview ----------
const preview = $('#preview');
const pShadow = preview.attachShadow({ mode: 'open' });
const pStyle = document.createElement('style');
const pageStyle = document.createElement('style');
pageStyle.textContent = `
  .page { padding: 70px 22px 0; font: 15px/1.7 Georgia, serif; color: #444; }
  @media (prefers-color-scheme: dark) { .page { color: #bbb; } }
  .page p { margin: 0 0 8px; max-width: 640px; }
  .w { position: relative; }
`;
const page = document.createElement('div');
page.className = 'page';
page.innerHTML = `
  <p>The <span class="w">quick</span> brown fox jumps over the lazy dog. A <span class="w">quick</span> movement of the enemy will jeopardize six gunboats.</p>
  <p>Pack my box with five dozen liquor jugs, then <span class="w">quick</span>ly zip the <span class="caret-here">bag</span> before the <span class="w">quick</span> train leaves.</p>`;
const ajRoot = document.createElement('div');
ajRoot.className = 'aj-root';
ajRoot.innerHTML = `
  <div class="aj-layer"></div>
  <div class="aj-bar" data-mode="labels">
    <span class="aj-prompt">Jump to</span>
    <input class="aj-input" value="quick" readonly tabindex="-1">
    <span class="aj-count">4 · type label</span>
  </div>
  <div class="aj-caret"></div>
  <div class="aj-mode"><span class="aj-mode-name">VISUAL</span><span class="aj-mode-hint"></span></div>`;
pShadow.append(pStyle, pageStyle, page, ajRoot);

function renderPreview() {
  pStyle.textContent = buildCss(settings);
  ajRoot.querySelector('.aj-bar').dataset.position = settings.inputPosition;
  const hint = ajRoot.querySelector('.aj-mode-hint');
  hint.textContent = 'hjkl move · v visual · y copy · Esc exit';
  hint.hidden = !settings.showModeHint;

  requestAnimationFrame(() => {
    const layer = ajRoot.querySelector('.aj-layer');
    layer.replaceChildren();
    const origin = preview.getBoundingClientRect();
    const words = [...page.querySelectorAll('.w')];
    const labels = generateLabels(words.length, settings.labelChars);
    words.forEach((w, i) => {
      const r = w.getBoundingClientRect();
      const left = r.left - origin.left - 1;
      const top = r.top - origin.top - 1;
      const box = document.createElement('div');
      box.className = 'aj-match';
      Object.assign(box.style, { left: `${left}px`, top: `${top}px`, width: `${r.width}px`, height: `${r.height}px` });
      const label = document.createElement('div');
      label.className = 'aj-label';
      label.style.left = `${left}px`;
      label.style.top = `${top}px`;
      let text = labels[i] ?? '';
      if (settings.uppercaseLabels) text = text.toUpperCase();
      // Show the second label with its first character already typed.
      if (i === 1 && text.length > 1) {
        const typed = document.createElement('span');
        typed.className = 'aj-typed';
        typed.textContent = text[0];
        label.append(typed, text.slice(1));
      } else label.textContent = text;
      layer.append(box, label);
    });
    const c = page.querySelector('.caret-here').getBoundingClientRect();
    Object.assign(ajRoot.querySelector('.aj-caret').style, { left: `${c.left - origin.left}px`, top: `${c.top - origin.top}px`, height: `${c.height}px` });
  });
}
new ResizeObserver(renderPreview).observe(preview);

// ---------- form binding ----------
function fillForm() {
  for (const f of fields) {
    const v = settings[f.dataset.key];
    if (f.type === 'checkbox') f.checked = !!v;
    else if (f !== document.activeElement) f.value = v ?? '';
  }
  for (const sw of swatches.children) sw.setAttribute('aria-checked', String(sw.dataset.theme === settings.theme));
  $('#css-size').textContent = settings.customCss ? `${settings.customCss.length} chars` : '';
  renderPreview();
}

let statusTimer;
function flash(text = 'Saved') {
  const s = $('#status');
  s.textContent = text;
  s.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => s.classList.remove('show'), 1200);
}

let saveTimer;
let pending = {};
function save(patch, { debounce = false } = {}) {
  Object.assign(settings, patch);
  Object.assign(pending, patch);
  fillForm();
  clearTimeout(saveTimer);
  const write = async () => {
    const data = pending;
    pending = {};
    try {
      await chrome.storage.sync.set(data);
      flash();
    } catch (err) {
      flash(`Not saved: ${err.message}`);
    }
  };
  if (debounce) saveTimer = setTimeout(write, 400);
  else write();
}

for (const f of fields) {
  const key = f.dataset.key;
  if (f.type === 'checkbox') {
    f.addEventListener('change', () => save({ [key]: f.checked }));
  } else if (f.tagName === 'SELECT') {
    f.addEventListener('change', () => save({ [key]: f.value }));
  } else if (key === 'labelChars') {
    f.addEventListener('input', () => {
      const unique = [...new Set(f.value.toLowerCase().replace(/\s/g, ''))].join('');
      f.setCustomValidity(unique.length < 2 ? 'Use at least 2 different characters' : '');
      if (unique.length >= 2) save({ labelChars: unique }, { debounce: true });
    });
    f.addEventListener('blur', () => fillForm());
  } else {
    f.addEventListener('input', () => save({ [key]: f.value }, { debounce: true }));
  }
}

$('#customCss').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  e.target.setRangeText('  ', e.target.selectionStart, e.target.selectionEnd, 'end');
  e.target.dispatchEvent(new Event('input'));
});

function appendCss(text) {
  const ta = $('#customCss');
  const current = ta.value.trimEnd();
  ta.value = current ? `${current}\n\n${text}` : text;
  save({ customCss: ta.value });
  ta.focus();
}
$('#insert-example').addEventListener('click', () => appendCss(EXAMPLE_CSS));
$('#insert-vars').addEventListener('click', () => {
  const id = settings.theme === 'auto' ? 'light' : settings.theme;
  const vars = (THEMES[id] ?? THEMES.dark).vars;
  appendCss(`/* ${THEMES[id]?.name ?? id} variables */\n:host {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`);
});

$('#reset').addEventListener('click', async () => {
  if (!confirm('Reset all AceJump settings, including your custom CSS?')) return;
  await chrome.storage.sync.clear();
  settings = { ...DEFAULTS };
  for (const f of fields) if (f.type !== 'checkbox') f.value = settings[f.dataset.key];
  fillForm();
  flash('Reset');
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'acejump-settings.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const patch = Object.fromEntries(Object.entries(data).filter(([k, v]) => k in DEFAULTS && typeof v === typeof DEFAULTS[k]));
    for (const f of fields) if (f.dataset.key in patch && f.type !== 'checkbox') f.value = patch[f.dataset.key];
    save(patch);
    flash('Imported');
  } catch (err) {
    flash(`Import failed: ${err.message}`);
  }
});

// ---------- shortcut ----------
async function showShortcut() {
  const cmds = await chrome.commands.getAll();
  const cmd = cmds.find((c) => c.name === 'activate');
  $('#shortcut').textContent = cmd?.shortcut || 'not set';
}
$('#open-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
addEventListener('focus', showShortcut);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [k, { newValue }] of Object.entries(changes)) {
    if (k in pending) continue;
    settings[k] = newValue === undefined ? DEFAULTS[k] : newValue;
  }
  fillForm();
});

(async () => {
  settings = await loadSettings();
  for (const f of fields) if (f.type !== 'checkbox') f.value = settings[f.dataset.key] ?? '';
  fillForm();
  showShortcut();
})();
