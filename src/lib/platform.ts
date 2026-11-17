import { platform } from "@tauri-apps/plugin-os";

const PLATFORM = (() => {
  try {
    return platform();
  } catch {
    return "";
  }
})();

export const IS_MAC = PLATFORM === "macos";
export const IS_LINUX = PLATFORM === "linux";
export const IS_WINDOWS = PLATFORM === "windows";

/** Custom window controls (min/max/close) are rendered by us only on
 * non-macOS platforms — macOS keeps the native traffic lights via the
 * overlay title bar. */
export const USE_CUSTOM_WINDOW_CONTROLS = !IS_MAC && PLATFORM !== "";

/**
 * The CSS chrome (rounded corners, painted border, transparent window) only
 * makes sense while Bubble owns the titlebar. Turn it off when the user opts
 * into native window decorations.
 */
export function applyWindowChrome(systemDecorations: boolean): void {
  if (typeof document === "undefined" || !USE_CUSTOM_WINDOW_CONTROLS) return;
  if (systemDecorations) {
    delete document.documentElement.dataset.chrome;
  } else {
    document.documentElement.dataset.chrome = "borderless";
  }
}

/** KeyBinding property name for the platform's primary modifier. */
export const MOD_PROP: "meta" | "ctrl" = IS_MAC ? "meta" : "ctrl";
/** Cmd on macOS, Ctrl on Windows/Linux: each OS's native file-manager
 * convention for toggling one item in/out of a multi-selection. */
export function isPrimaryModifierPressed(e: {
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}
export const KEY_SEP = IS_MAC ? "" : "+";

export function fmtShortcut(...parts: string[]): string {
  return parts.join(KEY_SEP);
}
