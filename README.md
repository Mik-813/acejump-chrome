# AceJump for Chrome

Keyboard jumping for web pages, inspired by the AceJump / MetaJump IDE plugins.
Search for text, hop to any visible match with a short label, then keep selecting with the keyboard.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Optional: change the shortcut at `chrome://extensions/shortcuts` (default `Alt+J`).

## Usage

| Step | Keys |
| --- | --- |
| Open the jump bar | `Alt+J` (or click the toolbar icon) |
| Search | type text, `Enter` (matches highlight live while typing) |
| Jump | type the label shown on the match (`Enter` picks the first one) |
| Back to editing the query | `Backspace` with nothing typed |
| Cancel | `Esc` |

A single match is jumped to directly. Matches in `<input>` and `<textarea>` fields focus the field and place the cursor there.

### Caret mode

After jumping into page text the caret is shown and you can move or select with Vim-like keys:

| Key | Action |
| --- | --- |
| `h j k l` / arrows | character / line |
| `w` `e` `b` | next word start / word end / previous word |
| `0` `^` `$` `Home` `End` | line start / end |
| `(` `)` `{` `}` | sentence / paragraph |
| `g` `G` | document start / end |
| `v` | toggle visual (selection) mode; `Shift+arrows` also extend |
| `V` | select line |
| `o` | swap selection ends |
| `y` | copy selection and exit |
| `s` `/` `f` | jump again; in visual mode this extends the selection to the new match |
| `Esc` `Enter` | leave caret mode (the selection stays) |

Clicking anywhere also leaves caret mode.

## Settings

Open the options page from the extension's **Details → Extension options**. There you can set:

- **Theme**: Auto (follows system light/dark), Dark, Light, Vimium, Dracula, Nord, Solarized, High contrast.
- **Bar position**, uppercase labels, label characters, case sensitivity (smart case by default), jump target (start / end / select match), and caret mode.
- **Custom CSS** applied on top of the theme, with a live preview.

### Custom CSS

The UI lives in a shadow root, so page styles don't leak in and your CSS only affects AceJump.
Override variables on `:host` or style the classes directly:

```css
:host {
  --aj-label-bg: #ff0;
  --aj-label-fg: #000;
  --aj-label-font-size: 14px;
}
.aj-label { border-radius: 999px; }
.aj-bar { width: 360px; }
```

Classes: `.aj-bar` (with `[data-mode="input|labels"]` and `[data-position]`), `.aj-prompt`, `.aj-input`, `.aj-count`,
`.aj-match`, `.aj-label`, `.aj-typed` (already-typed label characters), `.aj-caret`, `.aj-mode`, `.aj-mode-name`, `.aj-mode-hint`, `.aj-toast`.
The options page lists every variable and can insert the current theme's values as a starting point.

Settings sync through `chrome.storage.sync` (about 8 KB per item, which limits the size of the custom CSS).

## Limitations

- Chrome doesn't let extensions run on `chrome://` pages, the Chrome Web Store, or other extensions' pages.
- Only the top-level document is searched. Text inside iframes and closed shadow roots is skipped.
- Only text that is currently visible in the viewport is labelled.
- Caret mode is emulated with the Selection API (extensions can't toggle Chrome's F7 caret browsing), so motions follow Chrome's word and line rules.
- On `file://` URLs, enable **Allow access to file URLs** in the extension details.
