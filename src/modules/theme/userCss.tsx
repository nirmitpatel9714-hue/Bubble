import { usePreferencesStore } from "@/modules/settings/preferences";
import { useEffect } from "react";

const STYLE_ID = "bubble-user-css";
const TERMINAL_CSS_ATTR = "terminal-css";

/**
 * Inject the user's custom CSS into the document and toggle the sharp-cornered
 * terminal styling. The stylesheet is appended after every other author sheet,
 * so user rules win over the bundled styles, while theme colours stay driven by
 * the `--*` custom properties (a custom `font-family` never repaints colours).
 */
export function applyUserCss(css: string, terminalCss: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (terminalCss) root.setAttribute(`data-${TERMINAL_CSS_ATTR}`, "on");
  else root.removeAttribute(`data-${TERMINAL_CSS_ATTR}`);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css.trim()) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // textContent (not innerHTML) so the browser parses it purely as CSS.
  style.textContent = css;
}

/** Keeps the injected stylesheet and terminal-CSS flag in sync with preferences. */
export function UserCssBridge() {
  const customCss = usePreferencesStore((s) => s.customCss);
  const terminalCss = usePreferencesStore((s) => s.terminalCss);

  useEffect(() => {
    applyUserCss(customCss, terminalCss);
  }, [customCss, terminalCss]);

  // Also apply on mount in case preferences hydrated after first paint.
  useEffect(() => {
    applyUserCss(
      usePreferencesStore.getState().customCss,
      usePreferencesStore.getState().terminalCss,
    );
  }, []);

  return null;
}
