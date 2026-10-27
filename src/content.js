(() => {
  if (globalThis.__aceJumpLoaded) return;
  globalThis.__aceJumpLoaded = true;

  const { DEFAULTS, buildCss, loadSettings, generateLabels, normalizeLabelChars } = globalThis.AceJumpShared;

  const MAX_MATCHES = 1500;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'IFRAME', 'OBJECT', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'HEAD', 'TITLE']);
  const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'tel', 'number']);
  const CARET_HINT = 'hjkl/arrows move · w b Ctrl+←→ word · 0 $ line · v visual · y copy · s jump · Esc exit';

  let settings = { ...DEFAULTS };
  let settingsReady = loadSettings().then((s) => (settings = s));

  // ---------- state ----------
  const state = {
    mode: 'idle', // idle | input | labels | caret
    matches: [],
    typed: '',
    prevFocus: null,
    extendAnchor: null, // {node, offset} when jumping from visual mode
    visual: false,
    searchTimer: 0,
    rafPending: false,
  };

  // ---------- UI (shadow DOM) ----------
  let host, shadow, styleEl, root, bar, input, countEl, layer, caretEl, modeEl, toastEl, toastTimer, caretSink;

  function ensureUi() {
    if (host?.isConnected) return;
    host = document.createElement('acejump-root');
    host.style.cssText = 'all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;';
    shadow = host.attachShadow({ mode: 'open' });
    styleEl = document.createElement('style');
    styleEl.textContent = buildCss(settings);
    root = el('div', 'aj-root');
    layer = el('div', 'aj-layer');
    bar = el('div', 'aj-bar');
    bar.hidden = true;
    const prompt = el('span', 'aj-prompt', 'Jump to');
    input = el('input', 'aj-input');
    Object.assign(input, { type: 'text', spellcheck: false, autocomplete: 'off', placeholder: 'type text, then Enter' });
    input.setAttribute('aria-label', 'AceJump search');
    countEl = el('span', 'aj-count');
    bar.append(prompt, input, countEl);
    caretEl = el('div', 'aj-caret');
    caretEl.hidden = true;
    modeEl = el('div', 'aj-mode');
    modeEl.hidden = true;
    modeEl.append(el('span', 'aj-mode-name'), el('span', 'aj-mode-hint'));
    toastEl = el('div', 'aj-toast');
    toastEl.hidden = true;
    // Focus target during caret mode. Keyboard extensions such as Vimium pass keys through
    // while a text field is focused; the page selection is unaffected by it.
    caretSink = el('input', 'aj-sink');
    Object.assign(caretSink, { type: 'text', tabIndex: -1, readOnly: true });
    caretSink.setAttribute('aria-hidden', 'true');
    caretSink.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0;';
    caretSink.addEventListener('blur', () => {
      setTimeout(() => {
        if (state.mode === 'caret' && shadow.activeElement !== caretSink && document.hasFocus()) exitCaret();
      }, 0);
    });
    root.append(layer, caretEl, bar, modeEl, toastEl, caretSink);
    shadow.append(styleEl, root);
    (document.documentElement || document.body).append(host);

    input.addEventListener('input', onQueryInput);
    bar.addEventListener('mousedown', (e) => { if (e.target !== input) e.preventDefault(); });
    input.addEventListener('blur', () => {
      if (state.mode !== 'input' && state.mode !== 'labels') return;
      setTimeout(() => {
        if (state.mode !== 'input' && state.mode !== 'labels') return;
        const active = document.activeElement;
        // Window switch: the host keeps document focus, nothing to do.
        if (active === host && document.hasFocus() === false) return;
        // Focus dropped to nowhere: something (e.g. Vimium handling Esc) blurred us on purpose.
        if (!active || active === document.body || active === document.documentElement) { cancel(); return; }
        // Keep focus while the bar is open (page scripts sometimes steal it).
        input.focus({ preventScroll: true });
      }, 0);
    });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function applySettings() {
    if (styleEl) styleEl.textContent = buildCss(settings);
    if (bar) bar.dataset.position = settings.inputPosition;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue === undefined ? DEFAULTS[k] : newValue;
    applySettings();
  });

  function toast(text, ms = 1400) {
    ensureUi();
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
  }

  function shake() {
    bar.classList.remove('aj-shake');
    void bar.offsetWidth;
    bar.classList.add('aj-shake');
  }

  // ---------- activation ----------
  async function activate() {
    await settingsReady;
    if (state.mode === 'input' || state.mode === 'labels') return cancel();

    let extendAnchor = null;
    if (state.mode === 'caret') {
      const sel = getSelection();
      if (state.visual && sel.anchorNode) extendAnchor = { node: sel.anchorNode, offset: sel.anchorOffset };
      exitCaret(true);
    }

    ensureUi();
    applySettings();
    state.prevFocus = deepActiveElement();
    state.extendAnchor = extendAnchor;
    state.mode = 'input';
    state.typed = '';
    state.matches = [];
    bar.dataset.mode = 'input';
    bar.classList.remove('aj-error');
    bar.hidden = false;
    input.readOnly = false;

    let initial = '';
    if (settings.rememberLastQuery) {
      try { initial = (await chrome.storage.local.get('lastQuery')).lastQuery ?? ''; } catch {}
    }
    input.value = initial;
    input.focus({ preventScroll: true });
    input.select();
    countEl.textContent = extendAnchor ? 'extend' : '';
    if (initial) runSearch();
  }

  function cancel() {
    const prev = state.prevFocus;
    teardown();
    if (prev?.isConnected && prev !== document.body) prev.focus?.({ preventScroll: true });
  }

  function teardown() {
    clearTimeout(state.searchTimer);
    state.mode = 'idle';
    state.matches = [];
    state.typed = '';
    state.extendAnchor = null;
    if (!host) return;
    layer.replaceChildren();
    bar.hidden = true;
    if (shadow.activeElement === input) input.blur();
  }

  function deepActiveElement() {
    let a = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  // ---------- searching ----------
  function onQueryInput() {
    if (state.mode !== 'input') return;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(runSearch, 40);
  }

  function buildRegex(query) {
    if (!query) return null;
    const insensitive = settings.caseMode === 'insensitive' || (settings.caseMode === 'smart' && query === query.toLowerCase());
    const src = query
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    return new RegExp(src, insensitive ? 'gi' : 'g');
  }

  function runSearch() {
    const query = input.value;
    bar.classList.remove('aj-error');
    if (!query) {
      state.matches = [];
      countEl.textContent = state.extendAnchor ? 'extend' : '';
      render();
      return;
    }
    state.matches = findMatches(buildRegex(query));
    const n = state.matches.length;
    countEl.textContent = n === 0 ? 'no match' : `${n}${n >= MAX_MATCHES ? '+' : ''} match${n === 1 ? '' : 'es'}`;
    bar.classList.toggle('aj-error', n === 0);
    render();
  }

  function inViewport(r) {
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  function findMatches(regex) {
    const matches = [...findTextMatches(regex)];
    if (settings.includeInputs) matches.push(...findFieldMatches(regex));
    matches.sort((a, b) => a.rects[0].top - b.rects[0].top || a.rects[0].left - b.rects[0].left);
    return matches.slice(0, MAX_MATCHES);
  }

  function findTextMatches(regex) {
    const body = document.body;
    if (!body) return [];
    const visCache = new Map();
    const blockCache = new Map();
    const isVisible = (e) => {
      let v = visCache.get(e);
      if (v === undefined) {
        v = e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
        visCache.set(e, v);
      }
      return v;
    };
    const blockOf = (e) => {
      const start = e;
      if (blockCache.has(start)) return blockCache.get(start);
      while (e && e !== body) {
        const d = getComputedStyle(e).display;
        if (!d.startsWith('inline') && d !== 'contents') break;
        e = e.parentElement;
      }
      blockCache.set(start, e);
      return e;
    };

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (SKIP_TAGS.has(node.tagName.toUpperCase()) || node === host) return NodeFilter.FILTER_REJECT;
          if (node.checkVisibility && !node.checkVisibility({ opacityProperty: true })) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const range = document.createRange();
    const segs = [];
    let text = '';
    let lastBlock = null;
    let gap = true;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue;
      const parent = node.parentElement;
      if (!value || !parent || !isVisible(parent)) { gap = true; continue; }
      if (value.trim()) {
        range.selectNodeContents(node);
        if (!inViewport(range.getBoundingClientRect())) { gap = true; continue; }
      }
      const block = blockOf(parent);
      if (gap || block !== lastBlock) text += '\u0000';
      segs.push({ node, start: text.length });
      text += value;
      lastBlock = block;
      gap = false;
    }
    if (!segs.length) return [];

    const locate = (index) => {
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].start <= index) lo = mid; else hi = mid - 1;
      }
      return segs[lo];
    };

    const out = [];
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) && out.length < MAX_MATCHES) {
      if (!m[0].length) { regex.lastIndex++; continue; }
      const s = locate(m.index);
      const e = locate(m.index + m[0].length - 1);
      const r = document.createRange();
      r.setStart(s.node, m.index - s.start);
      r.setEnd(e.node, m.index + m[0].length - e.start);
      const match = { kind: 'text', range: r, rects: [] };
      updateRects(match);
      if (match.rects.length && inViewport(match.rects[0])) out.push(match);
    }
    return out;
  }

  function findFieldMatches(regex) {
    const out = [];
    for (const f of document.querySelectorAll('input, textarea')) {
      if (f.tagName === 'INPUT' && !TEXT_INPUT_TYPES.has(f.type)) continue;
      if (f.disabled || !f.value) continue;
      const box = f.getBoundingClientRect();
      if (!inViewport(box) || (f.checkVisibility && !f.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(f.value)) && out.length < MAX_MATCHES) {
        if (!m[0].length) { regex.lastIndex++; continue; }
        const match = { kind: 'field', field: f, start: m.index, end: m.index + m[0].length, rects: [] };
        updateRects(match);
        if (match.rects.length) out.push(match);
      }
    }
    return out;
  }

  function updateRects(match) {
    if (match.kind === 'text') {
      match.rects = [...match.range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    } else {
      match.rects = fieldRects(match.field, match.start, match.end);
    }
  }

  const MIRROR_PROPS = ['boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'direction'];

  // Approximates the on-screen boxes of text inside an <input>/<textarea> with a hidden mirror element.
  function fieldRects(f, start, end) {
    const cs = getComputedStyle(f);
    const box = f.getBoundingClientRect();
    const isArea = f.tagName === 'TEXTAREA';
    const mirror = document.createElement('div');
    for (const p of MIRROR_PROPS) mirror.style[p] = cs[p];
    Object.assign(mirror.style, {
      position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, visibility: 'hidden', overflow: 'hidden',
      whiteSpace: isArea ? 'pre-wrap' : 'pre', overflowWrap: isArea ? 'break-word' : 'normal', margin: '0',
    });
    const value = f.type === 'password' ? '•'.repeat(f.value.length) : f.value;
    const span = document.createElement('span');
    span.textContent = value.slice(start, end);
    mirror.append(value.slice(0, start), span, value.slice(end) || '\u200b');
    document.documentElement.append(mirror);
    const dx = -f.scrollLeft;
    const dy = -f.scrollTop;
    let rects = [...span.getClientRects()].map((r) => {
      let top = r.top + dy;
      if (!isArea) top = box.top + (box.height - r.height) / 2;
      return new DOMRect(r.left + dx, top, r.width, r.height);
    });
    mirror.remove();
    rects = rects.filter((r) => r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1);
    return rects;
  }

  // ---------- rendering ----------
  function render() {
    layer.replaceChildren();
    const frag = document.createDocumentFragment();
    const showBoxes = state.mode === 'labels' || settings.liveHighlight;
    const typed = state.typed;
    for (const match of state.matches) {
      const visible = !match.label || match.label.startsWith(typed);
      if (showBoxes) {
        for (const r of match.rects) {
          if (!inViewport(r)) continue;
          const box = el('div', 'aj-match');
          if (!visible) box.classList.add('aj-hidden');
          place(box, r.left, r.top, r.width, r.height);
          frag.append(box);
        }
      }
      if (state.mode === 'labels' && match.label && visible) {
        const r = match.rects[0];
        if (!r || !inViewport(r)) continue;
        const label = el('div', 'aj-label');
        const shown = settings.uppercaseLabels ? match.label.toUpperCase() : match.label;
        if (typed) label.append(el('span', 'aj-typed', shown.slice(0, typed.length)));
        label.append(shown.slice(typed.length));
        place(label, Math.max(0, r.left), Math.max(0, r.top));
        frag.append(label);
      }
    }
    layer.append(frag);
  }

  function place(node, left, top, width, height) {
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    if (width !== undefined) node.style.width = `${width}px`;
    if (height !== undefined) node.style.height = `${height}px`;
  }

  function onViewportChange() {
    if (state.rafPending || state.mode === 'idle') return;
    state.rafPending = true;
    requestAnimationFrame(() => {
      state.rafPending = false;
      if (state.mode === 'input') runSearch();
      else if (state.mode === 'labels') { state.matches.forEach(updateRects); render(); }
      else if (state.mode === 'caret') drawCaret(false);
    });
  }
  addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  addEventListener('resize', onViewportChange, { passive: true });

  // ---------- labels ----------
  function enterLabels() {
    runSearch();
    const n = state.matches.length;
    if (n === 0) { shake(); return; }
    if (settings.rememberLastQuery) chrome.storage.local.set({ lastQuery: input.value }).catch(() => {});
    if (n === 1 && settings.autoJumpSingle) { jumpTo(state.matches[0]); return; }
    const labels = generateLabels(n, settings.labelChars);
    state.matches.forEach((m, i) => (m.label = labels[i]));
    state.mode = 'labels';
    state.typed = '';
    bar.dataset.mode = 'labels';
    input.readOnly = true;
    countEl.textContent = `${n} · type label`;
    render();
  }

  function typeLabelChar(ch) {
    const typed = state.typed + ch.toLowerCase();
    const candidates = state.matches.filter((m) => m.label.startsWith(typed));
    if (!candidates.length) { shake(); return; }
    const exact = candidates.find((m) => m.label === typed);
    if (exact) { jumpTo(exact); return; }
    state.typed = typed;
    countEl.textContent = `${candidates.length} · type label`;
    render();
  }

  function backToInput() {
    state.mode = 'input';
    state.typed = '';
    state.matches.forEach((m) => delete m.label);
    bar.dataset.mode = 'input';
    input.readOnly = false;
    input.focus({ preventScroll: true });
    runSearch();
  }

  // ---------- jumping ----------
  function jumpTo(match) {
    const extendAnchor = state.extendAnchor;
    teardown();

    if (match.kind === 'field') {
      const f = match.field;
      f.focus({ preventScroll: true });
      const [s, e] = settings.jumpTarget === 'end' ? [match.end, match.end] : settings.jumpTarget === 'select' ? [match.start, match.end] : [match.start, match.start];
      try { f.setSelectionRange(s, e); } catch {}
      return;
    }

    const r = match.range;
    const startEl = r.startContainer.parentElement;
    const editable = startEl?.isContentEditable ? startEl.closest('[contenteditable]:not([contenteditable="false"])') || startEl : null;
    const useCaret = !editable && settings.caretMode;
    if (editable) editable.focus({ preventScroll: true });
    else if (useCaret) {
      // Focus first: focusing an element afterwards would clear the page selection.
      ensureUi();
      caretSink.focus({ preventScroll: true });
    } else {
      const active = deepActiveElement();
      if (active && active !== document.body) active.blur?.();
    }

    const sel = getSelection();
    if (extendAnchor?.node?.isConnected) {
      const after = r.comparePoint(extendAnchor.node, extendAnchor.offset) < 0;
      sel.setBaseAndExtent(extendAnchor.node, extendAnchor.offset, after ? r.endContainer : r.startContainer, after ? r.endOffset : r.startOffset);
    } else if (settings.jumpTarget === 'select') {
      sel.setBaseAndExtent(r.startContainer, r.startOffset, r.endContainer, r.endOffset);
    } else if (settings.jumpTarget === 'end') {
      sel.collapse(r.endContainer, r.endOffset);
    } else {
      sel.collapse(r.startContainer, r.startOffset);
    }

    if (useCaret) enterCaret(!sel.isCollapsed);
  }

  // ---------- caret / visual mode (emulated caret browsing) ----------
  function enterCaret(visual) {
    ensureUi();
    state.mode = 'caret';
    state.visual = visual;
    updateModeIndicator();
    drawCaret(true);
  }

  function exitCaret(keepUiForJump = false) {
    state.mode = 'idle';
    state.visual = false;
    if (!host) return;
    caretEl.hidden = true;
    if (!keepUiForJump) modeEl.hidden = true;
    if (shadow.activeElement === caretSink) caretSink.blur();
  }

  function updateModeIndicator() {
    modeEl.hidden = false;
    modeEl.firstChild.textContent = state.visual ? 'VISUAL' : 'CARET';
    const hint = modeEl.lastChild;
    hint.textContent = CARET_HINT;
    hint.hidden = !settings.showModeHint;
  }

  function focusRect() {
    const sel = getSelection();
    const node = sel.focusNode;
    if (!node) return null;
    const off = sel.focusOffset;
    const r = document.createRange();
    try {
      r.setStart(node, off);
      r.collapse(true);
      const rect = [...r.getClientRects()].find((x) => x.height > 0);
      if (rect) return { left: rect.left, top: rect.top, height: rect.height };
      if (node.nodeType === 3) {
        if (off < node.length) {
          r.setEnd(node, off + 1);
          const x = r.getClientRects()[0];
          if (x) return { left: x.left, top: x.top, height: x.height };
        }
        if (off > 0) {
          r.setStart(node, off - 1);
          r.setEnd(node, off);
          const x = r.getClientRects()[0];
          if (x) return { left: x.right, top: x.top, height: x.height };
        }
      }
      const target = node.nodeType === 1 ? node.childNodes[off] || node : node.parentElement;
      const x = target?.getBoundingClientRect?.();
      if (x) return { left: x.left, top: x.top, height: x.height || 16 };
    } catch {}
    return null;
  }

  function drawCaret(scroll) {
    let rect = focusRect();
    if (!rect) { caretEl.hidden = true; return; }
    if (scroll && (rect.top < 0 || rect.top + rect.height > innerHeight || rect.left < 0 || rect.left > innerWidth)) {
      const node = getSelection().focusNode;
      (node.nodeType === 1 ? node : node.parentElement)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      rect = focusRect() || rect;
    }
    caretEl.hidden = false;
    // Restart the blink animation so the caret is visible right after moving.
    caretEl.style.animation = 'none';
    void caretEl.offsetWidth;
    caretEl.style.animation = '';
    place(caretEl, rect.left, rect.top, undefined, rect.height);
  }

  const MOVES = {
    h: ['backward', 'character'], ArrowLeft: ['backward', 'character'],
    l: ['forward', 'character'], ArrowRight: ['forward', 'character'],
    j: ['forward', 'line'], ArrowDown: ['forward', 'line'],
    k: ['backward', 'line'], ArrowUp: ['backward', 'line'],
    w: ['forward', 'word'], e: ['forward', 'word'], b: ['backward', 'word'],
    0: ['backward', 'lineboundary'], Home: ['backward', 'lineboundary'], '^': ['backward', 'lineboundary'],
    $: ['forward', 'lineboundary'], End: ['forward', 'lineboundary'],
    '{': ['backward', 'paragraph'], '}': ['forward', 'paragraph'],
    ')': ['forward', 'sentence'], '(': ['backward', 'sentence'],
    G: ['forward', 'documentboundary'], g: ['backward', 'documentboundary'],
  };

  function handleCaretKey(e) {
    const sel = getSelection();
    const key = e.key;
    if (key === 'Escape') { exitCaret(); return; }
    if (key === 'Enter') { exitCaret(); return; }
    if (key === 'v') {
      state.visual = !state.visual;
      if (!state.visual && sel.focusNode) sel.collapse(sel.focusNode, sel.focusOffset);
      updateModeIndicator();
      drawCaret(false);
      return;
    }
    if (key === 'V') {
      sel.modify('move', 'backward', 'lineboundary');
      sel.modify('extend', 'forward', 'lineboundary');
      state.visual = true;
      updateModeIndicator();
      drawCaret(true);
      return;
    }
    if (key === 'o' && state.visual && sel.anchorNode) {
      sel.setBaseAndExtent(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset);
      drawCaret(true);
      return;
    }
    if (key === 'y') { copySelection(); return; }
    if (key === 's' || key === '/' || key === 'f') { activate(); return; }
    const move = MOVES[key];
    if (move) {
      const alter = state.visual || e.shiftKey && key.startsWith('Arrow') ? 'extend' : 'move';
      if (key === 'w') wordStartForward(sel, alter);
      else sel.modify(alter, move[0], move[1]);
      if (alter === 'extend' && !state.visual) { state.visual = true; updateModeIndicator(); }
      drawCaret(true);
    }
  }

  // Vim-like `w`: start of the next word. Selection.modify word steps stop at word ends
  // on Linux/macOS, so go to the next word end and step back to its start.
  function wordStartForward(sel, alter) {
    const start = document.createRange();
    start.setStart(sel.focusNode, sel.focusOffset);
    const advanced = () => sel.focusNode && start.comparePoint(sel.focusNode, sel.focusOffset) > 0;
    sel.modify(alter, 'forward', 'word');
    sel.modify(alter, 'backward', 'word');
    if (advanced()) return;
    sel.modify(alter, 'forward', 'word');
    sel.modify(alter, 'forward', 'word');
    sel.modify(alter, 'backward', 'word');
    if (!advanced()) sel.modify(alter, 'forward', 'word');
  }

  async function copySelection() {
    const text = getSelection().toString();
    if (!text) { toast('Nothing selected (press v to select)'); return; }
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    if (!ok) {
      // clipboard.writeText can stay pending forever (e.g. permission prompt), so cap the wait.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));
      try { await Promise.race([navigator.clipboard.writeText(text), timeout]); ok = true; } catch {}
    }
    exitCaret();
    toast(ok ? `Copied ${text.length} character${text.length === 1 ? '' : 's'}` : 'Copy failed');
  }

  // ---------- keyboard ----------
  function isOurInputFocused() {
    return host && shadow.activeElement === input;
  }

  function onKeyDown(e) {
    if (state.mode === 'idle' || e.isComposing) return;

    if (state.mode === 'input' || state.mode === 'labels') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancel(); return; }
      if (!isOurInputFocused()) return;
      e.stopImmediatePropagation();
      if (e.key === 'Tab') { e.preventDefault(); return; }
      if (state.mode === 'input') {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(state.searchTimer); enterLabels(); }
        return;
      }
      // labels mode: the input is read-only, keys pick a label
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.key === 'Backspace') {
        if (state.typed) { state.typed = state.typed.slice(0, -1); render(); } else backToInput();
      } else if (e.key === 'Enter') {
        const first = state.matches.find((m) => m.label.startsWith(state.typed));
        if (first) jumpTo(first);
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        typeLabelChar(e.key);
      }
      return;
    }

    if (state.mode === 'caret') {
      if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveByWord(e.key === 'ArrowRight' ? 'forward' : 'backward', e.shiftKey);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // let Ctrl+C etc. through
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handleCaretKey(e);
    }
  }

  function swallow(e) {
    if (state.mode === 'input' || state.mode === 'labels') {
      // Vimium (and similar extensions) swallow the Escape keydown while an input is focused,
      // so the keyup is the only Escape we see. If the keydown reached us, we're idle by now.
      if (e.type === 'keyup' && e.key === 'Escape') { e.stopImmediatePropagation(); cancel(); return; }
      if (isOurInputFocused()) e.stopImmediatePropagation();
    } else if (state.mode === 'caret' && (!(e.ctrlKey || e.metaKey || e.altKey) || isCtrlArrow(e))) {
      e.stopImmediatePropagation();
    }
  }

  function isCtrlArrow(e) {
    return e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  }

  // Ctrl+Left/Right moves by word, with Shift it extends the selection (like in text fields).
  function moveByWord(direction, extend) {
    const sel = getSelection();
    if (!sel.focusNode) return;
    const alter = extend || state.visual ? 'extend' : 'move';
    sel.modify(alter, direction, 'word');
    if (alter === 'extend' && !state.visual) { state.visual = true; updateModeIndicator(); }
    drawCaret(true);
  }

  addEventListener('keydown', onKeyDown, true);
  addEventListener('keypress', swallow, true);
  addEventListener('keyup', swallow, true);
  addEventListener('mousedown', (e) => {
    if (state.mode === 'caret') exitCaret();
    else if ((state.mode === 'input' || state.mode === 'labels') && !e.composedPath().includes(host)) cancel();
  }, true);
  // With focus on the sink, native copy would copy the (empty) field, so supply the page selection.
  addEventListener('copy', (e) => {
    if (state.mode !== 'caret' || shadow?.activeElement !== caretSink) return;
    const text = getSelection().toString();
    if (!text) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  addEventListener('focusin', () => {
    if (state.mode !== 'caret') return;
    const a = deepActiveElement();
    if (a === caretSink) return;
    if (a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) exitCaret();
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'acejump:activate') {
      activate();
      sendResponse({ ok: true });
    }
  });

  // Exposed for automated tests only.
  globalThis.__aceJumpDebug = { state, activate, get host() { return host; }, normalizeLabelChars };
})();
