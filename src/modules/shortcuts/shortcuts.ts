import { IS_MAC } from "@/lib/platform";
import { MAC_DEFAULTS, WIN_LINUX_DEFAULTS } from "./shortcutDefaults";

/**
 * Single source of truth for keyboard shortcuts.
 */

export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.files"
  | "commandPalette.content"
  | "tab.new"
  | "tab.newBlock"
  | "tab.newPrivate"
  | "tab.newPreview"
  | "tab.newEditor"
  | "tab.close"
  | "tab.next"
  | "tab.prev"
  | "tab.selectByIndex"
  | "tiling.toggle"
  | "space.next"
  | "space.prev"
  | "space.overview"
  | "pane.splitRight"
  | "pane.splitDown"
  | "pane.focusNext"
  | "pane.focusPrev"
  | "pane.swapLeft"
  | "pane.swapRight"
  | "pane.swapUp"
  | "pane.swapDown"
  | "pane.source"
  | "terminal.clear"
  | "terminal.toggleInput"
  | "blocks.prev"
  | "blocks.next"
  | "search.focus"
  | "explorer.search"
  | "explorer.focus"
  | "explorer.toggleHidden"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "ai.toggle"
  | "ai.toggleMini"
  | "ai.askSelection"
  | "agent.focusAttention"
  | "settings.open"
  | "sidebar.toggle"
  | "editor.undo"
  | "editor.redo"
  | "editor.save"
  | "editor.aiComplete"
  | "editor.codeComplete";

export type ShortcutGroup =
  | "General"
  | "Workspaces"
  | "Windows"
  | "Panes"
  | "Terminal"
  | "Search"
  | "AI"
  | "View"
  | "Editor";

export type KeyBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** A two-step chord: press the leader, then this key. */
  leader?: boolean;
};

export type Shortcut = {
  id: ShortcutId;
  label: string;
  group: ShortcutGroup;
  defaultBindings: KeyBinding[];
  allowRepeat?: boolean;
};

// Matching walks this list in order and skips a shortcut its host disables, so
// terminal.clear stays ahead of commandPalette.open: leader+Shift+K clears a
// focused terminal and leader+K opens the palette everywhere else.
const SHORTCUT_META: Omit<Shortcut, "defaultBindings">[] = [
  {
    id: "terminal.clear",
    label: "Clear terminal",
    group: "Terminal",
  },
  {
    id: "commandPalette.open",
    label: "Open command palette",
    group: "General",
  },
  {
    id: "commandPalette.files",
    label: "Go to file",
    group: "General",
  },
  {
    id: "commandPalette.content",
    label: "Find in files",
    group: "General",
  },
  {
    id: "settings.open",
    label: "Open settings",
    group: "General",
  },
  {
    id: "tab.new",
    label: "New window",
    group: "Windows",
  },
  {
    id: "tab.newBlock",
    label: "New Blocks terminal",
    group: "Windows",
  },
  {
    id: "tab.newPrivate",
    label: "New private terminal",
    group: "Windows",
  },
  {
    id: "tab.newPreview",
    label: "New web preview",
    group: "Windows",
  },
  {
    id: "tab.newEditor",
    label: "New editor window",
    group: "Windows",
  },
  {
    id: "tab.close",
    label: "Close window or pane",
    group: "Windows",
  },
  {
    id: "pane.splitRight",
    label: "Split pane right",
    group: "Panes",
  },
  {
    id: "pane.splitDown",
    label: "Split pane down",
    group: "Panes",
  },
  {
    id: "pane.focusNext",
    label: "Focus next pane",
    group: "Panes",
  },
  {
    id: "pane.focusPrev",
    label: "Focus previous pane",
    group: "Panes",
  },
  {
    id: "pane.swapLeft",
    label: "Swap pane left",
    group: "Panes",
  },
  {
    id: "pane.swapRight",
    label: "Swap pane right",
    group: "Panes",
  },
  {
    id: "pane.swapUp",
    label: "Swap pane up",
    group: "Panes",
  },
  {
    id: "pane.swapDown",
    label: "Swap pane down",
    group: "Panes",
  },
  {
    id: "pane.source",
    label: "Toggle source panel",
    group: "Panes",
  },
  {
    id: "terminal.toggleInput",
    label: "Toggle Shell / AI input",
    group: "Terminal",
  },
  {
    id: "blocks.prev",
    label: "Previous command block",
    group: "Terminal",
    allowRepeat: true,
  },
  {
    id: "blocks.next",
    label: "Next command block",
    group: "Terminal",
    allowRepeat: true,
  },
  {
    id: "tab.next",
    label: "Next window",
    group: "Windows",
    allowRepeat: true,
  },
  {
    id: "tab.prev",
    label: "Previous window",
    group: "Windows",
    allowRepeat: true,
  },
  {
    id: "tab.selectByIndex",
    label: "Jump to window 1\u20139",
    group: "Windows",
  },
  {
    id: "tiling.toggle",
    label: "Toggle tiling for this window",
    group: "Windows",
  },
  {
    id: "space.next",
    label: "Next workspace",
    group: "Workspaces",
  },
  {
    id: "space.prev",
    label: "Previous workspace",
    group: "Workspaces",
  },
  {
    id: "space.overview",
    label: "Open workspaces",
    group: "Workspaces",
  },
  {
    id: "explorer.search",
    label: "Search files",
    group: "Search",
  },
  {
    id: "search.focus",
    label: "Find in window",
    group: "Search",
  },
  {
    id: "ai.toggle",
    label: "Toggle AI agent",
    group: "AI",
  },
  {
    id: "ai.toggleMini",
    label: "Toggle AI chat window",
    group: "AI",
  },
  {
    id: "ai.askSelection",
    label: "Ask AI about selection",
    group: "AI",
  },
  {
    id: "agent.focusAttention",
    label: "Jump to agent needing attention",
    group: "AI",
  },
  {
    id: "sidebar.toggle",
    label: "Toggle file explorer",
    group: "View",
  },
  {
    id: "explorer.focus",
    label: "Toggle file explorer focus",
    group: "View",
  },
  {
    id: "explorer.toggleHidden",
    label: "Toggle hidden files",
    group: "View",
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    group: "View",
    allowRepeat: true,
  },
  {
    id: "view.zoomOut",
    label: "Zoom out",
    group: "View",
    allowRepeat: true,
  },
  {
    id: "view.zoomReset",
    label: "Reset zoom",
    group: "View",
  },
  {
    id: "view.zenMode",
    label: "Toggle zen mode",
    group: "View",
  },
  {
    id: "editor.undo",
    label: "Undo",
    group: "Editor",
  },
  {
    id: "editor.redo",
    label: "Redo",
    group: "Editor",
  },
  {
    id: "editor.save",
    label: "Save file",
    group: "Editor",
  },
  {
    id: "editor.aiComplete",
    label: "Trigger AI completion",
    group: "Editor",
  },
  {
    id: "editor.codeComplete",
    label: "Trigger code completion",
    group: "Editor",
  },
];

export function buildShortcuts(isMac: boolean): Shortcut[] {
  const defaults = isMac ? MAC_DEFAULTS : WIN_LINUX_DEFAULTS;
  return SHORTCUT_META.map((meta) => ({
    ...meta,
    defaultBindings: [...defaults[meta.id]],
  }));
}

export const SHORTCUTS: Shortcut[] = buildShortcuts(IS_MAC);

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "General",
  "Workspaces",
  "Windows",
  "Panes",
  "Terminal",
  "View",
  "Search",
  "AI",
  "Editor",
];

/**
 * Matching logic: checks if a KeyboardEvent matches a KeyBinding.
 */
const CODE_TO_KEY: Record<string, string> = {
  Backslash: "\\",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Space: " ",
};

const UNSHIFTED_PUNCTUATION: Record<string, string> = {
  "~": "`",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
};
const PUNCTUATION_BASE_KEYS = new Set(Object.values(UNSHIFTED_PUNCTUATION));

// Option and Shift combinations rewrite e.key (macOS Option gives "«", "…",
// dead keys; Shift turns "." into ">"); the physical key survives in e.code.
function keyFromCode(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return CODE_TO_KEY[code] ?? null;
}

/**
 * The digit 1 to 9 a Jump to tab press names. Under Shift the key is a symbol
 * (`!`, `@`), so the physical digit key is read instead.
 */
export function tabDigit(
  e: Pick<KeyboardEvent, "key" | "code">,
  byCode: boolean,
): number | null {
  const digit = byCode
    ? /^Digit([1-9])$/.exec(e.code)?.[1]
    : /^[1-9]$/.exec(e.key)?.[0];
  return digit === undefined ? null : Number(digit);
}

export function matchBinding(
  e: KeyboardEvent,
  binding: KeyBinding,
  id?: ShortcutId,
  recorded = false,
): boolean {
  // Leader chords are resolved by matchLeaderChord after the leader press.
  if (binding.leader) return false;
  return (
    keyMatches(e, binding, id, recorded) &&
    !!e.ctrlKey === !!binding.ctrl &&
    !!e.shiftKey === !!binding.shift &&
    !!e.altKey === !!binding.alt &&
    !!e.metaKey === !!binding.meta
  );
}

/** True when a key press completes a leader chord (leader already consumed). */
export function matchLeaderChord(
  e: KeyboardEvent,
  binding: KeyBinding,
  id?: ShortcutId,
  recorded = false,
): boolean {
  if (!binding.leader) return false;
  // The leader itself is a single non-Alt, non-Super chord.
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (!!e.shiftKey !== !!binding.shift) return false;
  return keyMatches(e, binding, id, recorded);
}

function keyMatches(
  e: KeyboardEvent,
  binding: KeyBinding,
  id?: ShortcutId,
  recorded = false,
): boolean {
  const eventKey = e.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  // Special case for Jump to Tab 1-9
  if (id === "tab.selectByIndex") {
    if (tabDigit(e, !!binding.shift) === null) return false;
  } else if (recorded) {
    // The recorder stores KeyboardEvent.key verbatim, including layout symbols.
    if (eventKey !== bindingKey) return false;
  } else if (binding.shift && !binding.alt && UNSHIFTED_PUNCTUATION[eventKey]) {
    // Recognized shifted punctuation names its logical key, even on Dvorak.
    if (
      UNSHIFTED_PUNCTUATION[eventKey] !==
      (UNSHIFTED_PUNCTUATION[bindingKey] ?? bindingKey)
    )
      return false;
  } else if (
    eventKey !== bindingKey ||
    (binding.shift && !binding.alt && PUNCTUATION_BASE_KEYS.has(bindingKey))
  ) {
    if (!binding.alt && !binding.shift) return false;
    // A Latin letter is the layout's own answer (Dvorak, Colemak).
    if (/^[a-z]$/.test(eventKey)) return false;
    // Shift alone cannot turn punctuation into a letter shortcut.
    if (
      !binding.alt &&
      /^[a-z]$/.test(bindingKey) &&
      eventKey.length === 1 &&
      !/^\p{L}$/u.test(eventKey)
    )
      return false;
    if (keyFromCode(e.code) !== bindingKey) return false;
  }

  return true;
}

/**
 * Display helpers
 */
function keyToken(key: string): string {
  let keyLabel = key;
  if (keyLabel === " ") keyLabel = "Space";
  else if (keyLabel === "ArrowUp") keyLabel = "↑";
  else if (keyLabel === "ArrowDown") keyLabel = "↓";
  else if (keyLabel === "ArrowLeft") keyLabel = "←";
  else if (keyLabel === "ArrowRight") keyLabel = "→";
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase();
  return keyLabel;
}

function modifierTokens(binding: KeyBinding): string[] {
  const tokens: string[] = [];
  if (IS_MAC) {
    if (binding.ctrl) tokens.push("⌃");
    if (binding.alt) tokens.push("⌥");
    if (binding.shift) tokens.push("⇧");
    if (binding.meta) tokens.push("⌘");
  } else {
    if (binding.ctrl) tokens.push("Ctrl");
    if (binding.alt) tokens.push("Alt");
    if (binding.shift) tokens.push("Shift");
    if (binding.meta) tokens.push("Win");
  }
  return tokens;
}

/** The chord part of a leader binding, without the leader prefix. */
export function getLeaderChordTokens(binding?: KeyBinding): string[] {
  if (!binding?.leader) return [];
  const tokens = IS_MAC
    ? [...(binding.shift ? ["⇧"] : [])]
    : [...(binding.shift ? ["Shift"] : [])];
  tokens.push(keyToken(binding.key));
  return tokens;
}

/** Display tokens for a binding. Leader bindings show the leader prefix when
 *  provided, else the generic "Leader" placeholder. */
export function getBindingTokens(
  binding?: KeyBinding,
  leader?: KeyBinding,
): string[] {
  if (!binding) return [];
  if (binding.leader) {
    const prefix = leader
      ? modifierTokens(leader).concat(keyToken(leader.key))
      : ["Leader"];
    return [...prefix, ...getLeaderChordTokens(binding)];
  }
  return [...modifierTokens(binding), keyToken(binding.key)];
}
