import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import type { Theme, ThemeVariant, TerminalPalette } from "./types";
import { noctalia as noctaliaStatic } from "./themes/noctalia";

/**
 * Live Noctalia palette support.
 *
 * The Noctalia shell renders its resolved palette (scheme or
 * matugen/wallpaper colors) into app config files through user templates.
 * Bubble ships the matching template in `docs/noctalia/bubble-theme.json`;
 * when the user registers it (see `docs/noctalia.md`), Noctalia writes the
 * rendered palette to `~/.config/bubble/noctalia.json` on every palette
 * change. While the Noctalia theme is selected and that file exists, its
 * content overrides the built-in static palette and updates live; without
 * the file the static fallback palette is used unchanged.
 */

/** Output path of the Bubble template, relative to the user's home. */
const OUTPUT_RELATIVE = ".config/bubble/noctalia.json";
const POLL_MS = 4000;

type RawVariant = Record<string, unknown>;

export interface NoctaliaPaletteFile {
  version?: unknown;
  dark?: RawVariant;
  light?: RawVariant;
}

const COLOR_KEYS = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebarForeground",
  "sidebarPrimary",
  "sidebarPrimaryForeground",
  "sidebarAccent",
  "sidebarAccentForeground",
  "sidebarBorder",
  "sidebarRing",
] as const;

const isColor = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Bubble's terminal selection token sets only a background; the foreground
 * under the selection is not swapped. Noctalia's `terminal_selection_bg` is
 * designed for terminals that swap both, so an opaque color is rendered as a
 * translucent tint instead — otherwise selected text becomes unreadable.
 */
export function selectionAsTint(color: string): string {
  const hex = color.trim();
  let r: number | null = null;
  let g: number | null = null;
  let b: number | null = null;
  let a = 1;
  if (/^#[\da-fA-F]{6}$/.test(hex)) {
    r = Number.parseInt(hex.slice(1, 3), 16);
    g = Number.parseInt(hex.slice(3, 5), 16);
    b = Number.parseInt(hex.slice(5, 7), 16);
  } else if (/^#[\da-fA-F]{8}$/.test(hex)) {
    r = Number.parseInt(hex.slice(1, 3), 16);
    g = Number.parseInt(hex.slice(3, 5), 16);
    b = Number.parseInt(hex.slice(5, 7), 16);
    a = Number.parseInt(hex.slice(7, 9), 16) / 255;
  } else {
    const m = hex.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) {
      r = Number(m[1]);
      g = Number(m[2]);
      b = Number(m[3]);
      const alpha = hex.match(/([\d.]+)\s*\)\s*$/);
      if (alpha) a = Number(alpha[1]);
    }
  }
  if (r === null || g === null || b === null) return color;
  return `rgba(${r}, ${g}, ${b}, ${(0.3 * a).toFixed(2)})`;
}

function mapNoctaliaVariant(raw: unknown): ThemeVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as RawVariant;
  const colors: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    if (!isColor(v[key])) return null;
    colors[key] = v[key].trim();
  }
  const ansi = v.ansi;
  if (
    !Array.isArray(ansi) ||
    ansi.length !== 16 ||
    !ansi.every(isColor)
  ) {
    return null;
  }
  const terminal = {
    background: isColor(v.terminalBackground)
      ? v.terminalBackground.trim()
      : colors.background,
    foreground: isColor(v.terminalForeground)
      ? v.terminalForeground.trim()
      : colors.foreground,
    cursor: isColor(v.cursor) ? v.cursor.trim() : colors.primary,
    cursorAccent: isColor(v.cursorAccent)
      ? v.cursorAccent.trim()
      : colors.background,
    selection: selectionAsTint(
      isColor(v.selection) ? v.selection.trim() : colors.primary,
    ),
    ansi: ansi.map((c) => c.trim()) as unknown as TerminalPalette["ansi"],
  };
  return { colors, terminal };
}

/**
 * Maps a rendered `noctalia.json` to a Bubble theme. Returns null when the
 * file is missing required colors (partial renders, foreign JSON, …) so the
 * caller can fall back to the static palette.
 */
export function mapNoctaliaPalette(raw: unknown): Theme | null {
  if (!raw || typeof raw !== "object") return null;
  const file = raw as NoctaliaPaletteFile;
  const dark = mapNoctaliaVariant(file.dark);
  const light = mapNoctaliaVariant(file.light);
  if (!dark && !light) return null;
  return {
    id: "noctalia",
    name: "Noctalia",
    description: "Noctalia shell palette (live from user template).",
    author: "Noctalia (noctalia.dev)",
    editorTheme: noctaliaStatic.editorTheme,
    variants: {
      ...(dark ? { dark } : {}),
      ...(light ? { light } : {}),
    },
  };
}

export function noctaliaPalettePath(home: string): string {
  const base = home.replace(/[\\/]+$/, "");
  return `${base}/${OUTPUT_RELATIVE}`;
}

/**
 * Reads and maps the rendered palette file. Null when Noctalia has not
 * rendered it (or it is unreadable) — the caller falls back to the static
 * palette.
 */
export async function readNoctaliaTheme(home?: string): Promise<Theme | null> {
  let path: string;
  try {
    path = noctaliaPalettePath(home ?? (await homeDir()));
  } catch {
    return null;
  }
  try {
    const res = await invoke<{ kind: string; content?: string }>(
      "fs_read_file",
      { path },
    );
    if (res.kind !== "text" || !res.content) return null;
    return mapNoctaliaPalette(JSON.parse(res.content));
  } catch {
    return null;
  }
}

/**
 * Polls the palette file while the Noctalia theme is active and calls `apply`
 * whenever the rendered content changes. Returns a stop function. Polling
 * (plus a refresh on window focus) is enough because Noctalia rewrites the
 * file only when the palette actually changes.
 */
export function watchNoctaliaPalette(
  apply: (theme: Theme | null) => void,
  home?: string,
): () => void {
  let alive = true;
  let last: string | null = null;
  const tick = async () => {
    const theme = await readNoctaliaTheme(home);
    if (!alive) return;
    const fingerprint = theme ? JSON.stringify(theme) : null;
    if (fingerprint === last) return;
    last = fingerprint;
    apply(theme);
  };
  void tick();
  const timer = window.setInterval(() => void tick(), POLL_MS);
  const onFocus = () => void tick();
  window.addEventListener("focus", onFocus);
  return () => {
    alive = false;
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  };
}
