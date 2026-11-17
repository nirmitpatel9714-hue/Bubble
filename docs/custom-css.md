# Custom CSS

Bubble ships with a small stylesheet escape hatch: **Settings → CSS → Custom CSS**.
Whatever you paste there is appended to the document after the built-in styles,
in every Bubble window (main window and Settings). It is stored in
`bubble-settings.json` and survives restarts, theme changes, and updates.

The CSS tab also has **Terminal CSS**, a one-switch shortcut that sets
`--radius: 0` and squares off panes, cards, and terminal corners. Leave it on if
you want a sharp-edged look without writing any CSS.

## How it works

- Rules are injected as a `<style>` element at the end of `<head>`, so they win
  over the bundled styles at equal specificity.
- Only CSS is evaluated; markup or script in the sheet is ignored. External
  resources must satisfy the app's Content Security Policy, which allows
  `data:` and `https:` images but not remote stylesheets (`@import`).
- The stylesheet runs in both light and dark mode. Prefer the theme variables
  below over hard-coded colours so your rules keep working when the theme
  changes.
- Invalid rules are ignored by the browser; the rest of your sheet still
  applies. There is no save-time validation.
- Changes take effect immediately after pressing **Save**. Use **Clear** to
  remove the sheet and return to the stock look.

## Theme variables

Every theme writes these custom properties onto `:root` (and `.dark` for dark
mode). They are the safest thing to style with.

| Variable | Meaning |
| --- | --- |
| `--background` | Window and editor background |
| `--foreground` | Primary text |
| `--card`, `--card-foreground` | Cards and panels |
| `--popover`, `--popover-foreground` | Menus, popovers, autocomplete |
| `--primary`, `--primary-foreground` | Accent colour and text on it |
| `--secondary`, `--secondary-foreground` | Secondary surfaces |
| `--muted`, `--muted-foreground` | Muted surfaces and secondary text |
| `--accent`, `--accent-foreground` | Hover / active surfaces |
| `--destructive` | Errors and destructive actions |
| `--border`, `--input`, `--ring` | Borders, inputs, focus rings |
| `--sidebar*` | Explorer / sidebar-specific palette |
| `--radius` | Global corner radius |
| `--terminal-background`, `--terminal-foreground` | Terminal surface and text |
| `--terminal-cursor`, `--terminal-selection` | Terminal cursor and selection |
| `--terminal-ansi-*` | ANSI black/red/…/bright-white |
| `--pane-radius`, `--pane-shadow` | Pane chrome |
| `--editor-font-size` | Editor text size (already includes the UI zoom) |

Colours can be combined with `color-mix()`:

```css
background: color-mix(in srgb, var(--background) 92%, var(--primary));
```

## Useful selectors

| Selector | Targets |
| --- | --- |
| `.bubble-pane` | Each terminal / editor pane frame |
| `.bubble-bg-surface` | The background layer behind panes |
| `#root` | Main window root |
| `#settings-root` | Settings window root |
| `.cm-editor`, `.cm-content`, `.cm-scroller` | CodeMirror editor |
| `.cm-gutters`, `.cm-lineNumbers` | Editor gutter |
| `[data-tauri-drag-region]` | Draggable window chrome |
| `[data-tab-active="true"]` | The active tab |
| `html[data-terminal-css="on"]` | Matches while Terminal CSS is enabled |

Prefer classes and variables over `*` selectors and positional `:nth-child`
rules: the layout can change between releases.

## Recipes

### Focus ring on the editor

```css
.cm-editor.cm-focused {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}
```

### Hide scrollbars everywhere

```css
* {
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  display: none;
}
```

### Tighter pane borders

```css
.bubble-pane {
  border-color: color-mix(in srgb, var(--border) 50%, transparent);
}
```

### Accent-coloured active tab

```css
[data-tab-active="true"] {
  box-shadow: inset 0 -2px 0 var(--primary);
}
```

### Rounder panes

```css
:root {
  --radius: 0.9rem;
  --pane-radius: 0.9rem;
}
```

### Subtle editor line height

```css
.cm-scroller {
  line-height: 1.65;
}
```

### Dim the window chrome

```css
[data-tauri-drag-region] {
  opacity: 0.92;
}
```

## Tips and caveats

- If a rule does not stick, increase specificity (for example
  `#root .bubble-pane`) before reaching for `!important`. Some layout styles are
  set inline by React and only yield to `!important`.
- Do not hard-code light-mode colours unless you guard them:
  `:root { … }` applies in both modes, while `.dark { … }` applies only in dark
  mode.
- Custom CSS is global. It applies to Settings too, so an over-broad rule can
  make the settings window hard to use. If that happens, reopen Settings and
  press **Clear**.
- The terminal renderer draws glyphs on a canvas; CSS can size and frame the
  pane, but colours come from the terminal palette variables and the active
  theme. Change terminal font settings in Settings → General.
- Custom CSS is a presentation layer only. It cannot add behaviour, change
  keybindings, or reach the filesystem.
