import type { KeyBinding, ShortcutId } from "./shortcuts";

/**
 * Default bindings, one table per platform family. A shortcut means the same
 * thing wherever focus is: nothing here depends on what has focus.
 *
 * Every application binding is a leader chord: press the leader (Ctrl+Space by
 * default, configurable in Settings → Shortcuts), release, then press the
 * chord. Leader chords never use Alt or Super, and they never collide with the
 * readline/TUI control bytes a focused terminal reads, because the shell only
 * sees the leader press and the host consumes the chord.
 *
 * Text-editing keeps its native chords (undo, redo, save): those are muscle
 * memory inside the editor and never reach a shell.
 */

type Defaults = Readonly<Record<ShortcutId, readonly KeyBinding[]>>;

function leader(key: string, shift = false): KeyBinding {
  return { leader: true, key, ...(shift ? { shift: true } : {}) };
}

type LeaderDefaults = Omit<
  Defaults,
  "editor.undo" | "editor.redo" | "editor.save"
>;

const LEADER_DEFAULTS: LeaderDefaults = {
  "commandPalette.open": [leader("k")],
  "commandPalette.files": [leader("p")],
  "commandPalette.content": [leader("f", true)],
  "settings.open": [leader(",")],
  "tab.new": [leader("n")],
  "tab.newBlock": [leader("b")],
  "tab.newPrivate": [leader("n", true)],
  "tab.newPreview": [leader("o")],
  "tab.newEditor": [leader("e")],
  "tab.close": [leader("w")],
  "tiling.toggle": [leader("t")],
  "pane.splitRight": [leader("d")],
  "pane.splitDown": [leader("d", true)],
  "pane.focusNext": [leader("]", true)],
  "pane.focusPrev": [leader("[", true)],
  "pane.swapLeft": [leader("ArrowLeft", true)],
  "pane.swapRight": [leader("ArrowRight", true)],
  "pane.swapUp": [leader("ArrowUp", true)],
  "pane.swapDown": [leader("ArrowDown", true)],
  "pane.source": [leader("g")],
  "terminal.clear": [leader("k", true)],
  "terminal.toggleInput": [leader("m")],
  "blocks.prev": [leader("ArrowUp")],
  "blocks.next": [leader("ArrowDown")],
  "tab.next": [leader("l"), leader("ArrowRight"), leader("Tab")],
  "tab.prev": [leader("h"), leader("ArrowLeft"), leader("Tab", true)],
  "tab.selectByIndex": [leader("1")],
  "space.next": [leader("]"), leader("l", true)],
  "space.prev": [leader("["), leader("h", true)],
  "space.overview": [leader(" ")],
  "explorer.search": [leader("e", true)],
  "search.focus": [leader("/")],
  "ai.toggle": [leader("a")],
  "ai.toggleMini": [leader("a", true)],
  "ai.askSelection": [leader("q", true)],
  "agent.focusAttention": [leader("i", true)],
  "sidebar.toggle": [leader("b", true)],
  "explorer.focus": [leader("x")],
  "explorer.toggleHidden": [leader(".", true)],
  "view.zoomIn": [leader("=")],
  "view.zoomOut": [leader("-")],
  "view.zoomReset": [leader("0")],
  "view.zenMode": [leader("z")],
  "editor.aiComplete": [leader("Enter", true)],
  "editor.codeComplete": [leader("Enter")],
};

export const MAC_DEFAULTS: Defaults = {
  ...LEADER_DEFAULTS,
  "editor.undo": [{ meta: true, key: "z" }],
  "editor.redo": [
    { meta: true, key: "y" },
    { shift: true, meta: true, key: "z" },
  ],
  "editor.save": [{ meta: true, key: "s" }],
};

export const WIN_LINUX_DEFAULTS: Defaults = {
  ...LEADER_DEFAULTS,
  "editor.undo": [{ ctrl: true, key: "z" }],
  "editor.redo": [
    { ctrl: true, key: "y" },
    { ctrl: true, shift: true, key: "z" },
  ],
  "editor.save": [{ ctrl: true, key: "s" }],
};
