import { usePreferencesStore } from "@/modules/settings/preferences";
import { resolveTerminalFont, useTheme } from "@/modules/theme";
import { useMemo } from "react";

/**
 * A terminal font supplied from Custom CSS via `--terminal-font-family`. This lets
 * a `@font-face` declared in the CSS settings drive the terminal without needing
 * the separate Terminal font setting, while theme colours are untouched.
 */
function cssTerminalFont(): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--terminal-font-family")
    .trim();
}

export function useTerminalFont() {
  const fontFamily = usePreferencesStore((p) => p.terminalFontFamily);
  const fontWeight = usePreferencesStore((p) => p.terminalFontWeight);
  const fontSize = usePreferencesStore((p) => p.terminalFontSize);
  const customCss = usePreferencesStore((p) => p.customCss);
  const { activeTheme, resolvedMode } = useTheme();

  // Re-read the CSS variable only when the injected stylesheet declares one;
  // `customCss` is the signal that the stylesheet (and any declaration) changed.
  const cssFamily = useMemo(
    () =>
      customCss.includes("--terminal-font-family") ? cssTerminalFont() : "",
    [customCss],
  );
  return useMemo(
    () =>
      resolveTerminalFont(
        { fontFamily: fontFamily || cssFamily, fontWeight, fontSize },
        activeTheme,
        resolvedMode,
      ),
    [fontFamily, cssFamily, fontWeight, fontSize, activeTheme, resolvedMode],
  );
}
