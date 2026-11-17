# Noctalia live palette

Bubble's built-in **Noctalia** theme can follow the Noctalia shell's colors
live. When you switch color schemes in Noctalia, or matugen regenerates the
palette from your wallpaper, Bubble picks up the new colors within a few
seconds — no restart, no manual re-theming.

This works through [Noctalia's user
templates](https://docs.noctalia.dev/noctalia/v5.4.0/theming/app-theming/):
Noctalia renders its resolved palette into app config files whenever the
palette changes, and Bubble watches the rendered file.

Without the template, the Noctalia theme uses its built-in static palette
(the upstream "Noctalia legacy" community palette), so the theme works even
when Noctalia itself isn't installed.

## Setup

1. **Copy the Bubble template** to Noctalia's template directory:

   ```sh
   mkdir -p ~/.config/noctalia/templates
   cp docs/noctalia/bubble-theme.json ~/.config/noctalia/templates/bubble.json
   ```

2. **Register it** in `~/.config/noctalia/templates.toml` (create the file if
   it doesn't exist):

   ```toml
   [theme.templates.user.bubble]
   input_path  = "$XDG_CONFIG_HOME/noctalia/templates/bubble.json"
   output_path = "$XDG_CONFIG_HOME/bubble/noctalia.json"
   ```

3. **Apply the palette** — change any color scheme setting in Noctalia
   (Settings → Color Scheme), or rerender the enabled templates over IPC:

   ```sh
   noctalia msg templates-apply
   ```

4. **Select Noctalia** in Bubble (Settings → Themes). Bubble reads
   `~/.config/bubble/noctalia.json` and follows every palette change from
   there on.

## How it works

- The template renders Noctalia's Material tokens (including the flattened
  `terminal_*` tokens) into a JSON file with complete dark **and** light
  variants, so Bubble maps colors by its own light/dark mode rather than by
  whichever mode Noctalia rendered last.
- Bubble polls the file every few seconds and re-checks on window focus;
  Noctalia only rewrites it when the palette actually changes, so unchanged
  palettes cost nothing.
- If the file is missing, incomplete, or unreadable, Bubble falls back to the
  built-in static palette — deleting the template file is enough to opt out.
- Terminal selection colors are rendered as translucent tints: Bubble's
  selection token sets only a background, while Noctalia's selection colors
  assume the terminal also swaps the foreground.
