import type { Theme, ThemeMode } from "./types";

export type TerminalFont = {
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
};

export function resolveTerminalFont(
  preferences: TerminalFont,
  theme: Theme,
  mode: ThemeMode,
): TerminalFont {
  const variant =
    theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light;
  const terminal = variant?.terminal;
  // An explicitly chosen font (the Terminal font setting, or a `--terminal-font-family`
  // supplied from Custom CSS) always wins. Only when the user has not picked one
  // does the theme's terminal font apply, so custom fonts are never silently
  // overridden by a theme. Weight and size still follow the theme first.
  const family = preferences.fontFamily.trim();
  return {
    fontFamily: family || terminal?.fontFamily || preferences.fontFamily,
    fontWeight: terminal?.fontWeight ?? preferences.fontWeight,
    fontSize: terminal?.fontSize ?? preferences.fontSize,
  };
}
