import type { Theme } from "../types";

/**
 * "Noctalia (community templates color scheme)".
 *
 * The palette Noctalia's community templates export as a color scheme —
 * sourced from noctalia-dev/community-palettes, entry "Noctalia legacy"
 * (purple primary on a deep violet surface in dark mode, same hues lifted
 * onto near-white paper in light mode). The shell's palettes can change
 * upstream; re-sync from that repo's JSON if they do.
 *
 * This static palette is the fallback: when the Noctalia shell renders its
 * live palette (see `../noctaliaLive.ts` and `docs/noctalia.md`), that file
 * overrides these colors while the theme is selected.
 *
 * Mapping: surface → background, surface_container → card/muted, primary →
 * primary, error → destructive, on_surface_variant → muted text, terminal
 * normal/bright → terminal ansi[0..15]. Upstream's solid selection colors
 * assume the terminal also swaps the selection foreground, which Bubble's
 * selection token doesn't do — so selection is rendered as a translucent
 * tint of the mode's primary instead.
 */
export const noctalia: Theme = {
  id: "noctalia",
  name: "Noctalia",
  description: "Noctalia (community templates color scheme) — soft violet on deep indigo.",
  author: "Noctalia community",
  editorTheme: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
  variants: {
    dark: {
      colors: {
        background: "#1c1822",
        foreground: "#e9e4f0",
        card: "#262130",
        cardForeground: "#e9e4f0",
        popover: "#262130",
        popoverForeground: "#e9e4f0",
        primary: "#c7a1d8",
        primaryForeground: "#1a151f",
        secondary: "#9f75bd",
        secondaryForeground: "#f3edf7",
        muted: "#262130",
        mutedForeground: "#a79ab0",
        accent: "#262130",
        accentForeground: "#e9e4f0",
        destructive: "#e9899d",
        border: "rgba(233,228,240,0.10)",
        input: "rgba(233,228,240,0.14)",
        ring: "#c7a1d8",
        sidebar: "#120f18",
        sidebarForeground: "#e9e4f0",
        sidebarPrimary: "#c7a1d8",
        sidebarPrimaryForeground: "#1a151f",
        sidebarAccent: "#262130",
        sidebarAccentForeground: "#e9e4f0",
        sidebarBorder: "rgba(233,228,240,0.10)",
        sidebarRing: "#c7a1d8",
      },
      terminal: {
        background: "#1c1822",
        foreground: "#e9e4f0",
        cursor: "#c7a1d8",
        cursorAccent: "#1c1822",
        selection: "rgba(199,161,216,0.28)",
        ansi: [
          "#262130",
          "#e9899d",
          "#e0b7c9",
          "#c7a1d8",
          "#a984c4",
          "#e9899d",
          "#e0b7c9",
          "#e9e4f0",
          "#3e364e",
          "#e9899d",
          "#e0b7c9",
          "#c7a1d8",
          "#a984c4",
          "#e9899d",
          "#e0b7c9",
          "#ffffff",
        ],
      },
    },
    light: {
      colors: {
        background: "#f5f1fa",
        foreground: "#1c1822",
        card: "#e7dfee",
        cardForeground: "#1c1822",
        popover: "#e7dfee",
        popoverForeground: "#1c1822",
        primary: "#9b59ba",
        primaryForeground: "#ffffff",
        secondary: "#784999",
        secondaryForeground: "#ffffff",
        muted: "#e7dfee",
        mutedForeground: "#4a3d59",
        accent: "#e7dfee",
        accentForeground: "#1c1822",
        destructive: "#e9899d",
        border: "rgba(28,24,34,0.12)",
        input: "rgba(28,24,34,0.16)",
        ring: "#9b59ba",
        sidebar: "#e7dfee",
        sidebarForeground: "#1c1822",
        sidebarPrimary: "#9b59ba",
        sidebarPrimaryForeground: "#ffffff",
        sidebarAccent: "#cebedc",
        sidebarAccentForeground: "#1c1822",
        sidebarBorder: "rgba(28,24,34,0.12)",
        sidebarRing: "#9b59ba",
      },
      terminal: {
        background: "#f5f1fa",
        foreground: "#1c1822",
        cursor: "#9b59ba",
        cursorAccent: "#f5f1fa",
        selection: "rgba(155,89,186,0.22)",
        ansi: [
          "#e7dfee",
          "#e9899d",
          "#c17093",
          "#9b59ba",
          "#784999",
          "#e9899d",
          "#c17093",
          "#1c1822",
          "#cebedc",
          "#e9899d",
          "#c17093",
          "#9b59ba",
          "#784999",
          "#e9899d",
          "#c17093",
          "#1c1822",
        ],
      },
    },
  },
};
