import { describe, expect, it } from "vitest";
import { MAC_DEFAULTS, WIN_LINUX_DEFAULTS } from "./shortcutDefaults";
import {
  type KeyBinding,
  matchBinding,
  matchLeaderChord,
  SHORTCUTS,
  type ShortcutId,
  tabDigit,
} from "./shortcuts";

// Both tables are tested regardless of the platform the tests run on.

const LEADER_EXPECTED: Record<string, string[]> = {
  "terminal.clear": ["Leader+Shift+k"],
  "commandPalette.open": ["Leader+k"],
  "commandPalette.files": ["Leader+p"],
  "commandPalette.content": ["Leader+Shift+f"],
  "settings.open": ["Leader+,"],
  "tab.new": ["Leader+n"],
  "tab.newBlock": ["Leader+b"],
  "tab.newPrivate": ["Leader+Shift+n"],
  "tab.newPreview": ["Leader+o"],
  "tab.newEditor": ["Leader+e"],
  "tab.close": ["Leader+w"],
  "pane.splitRight": ["Leader+d"],
  "pane.splitDown": ["Leader+Shift+d"],
  "pane.focusNext": ["Leader+Shift+]"],
  "pane.focusPrev": ["Leader+Shift+["],
  "pane.swapLeft": ["Leader+Shift+ArrowLeft"],
  "pane.swapRight": ["Leader+Shift+ArrowRight"],
  "pane.swapUp": ["Leader+Shift+ArrowUp"],
  "pane.swapDown": ["Leader+Shift+ArrowDown"],
  "pane.source": ["Leader+g"],
  "terminal.toggleInput": ["Leader+m"],
  "blocks.prev": ["Leader+ArrowUp"],
  "blocks.next": ["Leader+ArrowDown"],
  "tab.next": ["Leader+l", "Leader+ArrowRight", "Leader+Tab"],
  "tab.prev": ["Leader+h", "Leader+ArrowLeft", "Leader+Shift+Tab"],
  "tab.selectByIndex": ["Leader+1"],
  "tiling.toggle": ["Leader+t"],
  "space.next": ["Leader+]", "Leader+Shift+l"],
  "space.prev": ["Leader+[", "Leader+Shift+h"],
  "space.overview": ["Leader+Space"],
  "explorer.search": ["Leader+Shift+e"],
  "search.focus": ["Leader+/"],
  "ai.toggle": ["Leader+a"],
  "ai.toggleMini": ["Leader+Shift+a"],
  "ai.askSelection": ["Leader+Shift+q"],
  "agent.focusAttention": ["Leader+Shift+i"],
  "sidebar.toggle": ["Leader+Shift+b"],
  "explorer.focus": ["Leader+x"],
  "explorer.toggleHidden": ["Leader+Shift+."],
  "view.zoomIn": ["Leader+="],
  "view.zoomOut": ["Leader+-"],
  "view.zoomReset": ["Leader+0"],
  "view.zenMode": ["Leader+z"],
  "editor.undo": [],
  "editor.redo": [],
  "editor.save": [],
  "editor.aiComplete": ["Leader+Shift+Enter"],
  "editor.codeComplete": ["Leader+Enter"],
};

const MAC_NATIVE: Record<string, string[]> = {
  "editor.undo": ["Cmd+z"],
  "editor.redo": ["Cmd+y", "Shift+Cmd+z"],
  "editor.save": ["Cmd+s"],
};

const WIN_LINUX_NATIVE: Record<string, string[]> = {
  "editor.undo": ["Ctrl+z"],
  "editor.redo": ["Ctrl+y", "Ctrl+Shift+z"],
  "editor.save": ["Ctrl+s"],
};

const NATIVE_IDS = new Set<ShortcutId>([
  "editor.undo",
  "editor.redo",
  "editor.save",
]);

const describeBinding = (b: KeyBinding): string =>
  [
    b.leader && "Leader",
    b.ctrl && "Ctrl",
    b.alt && "Alt",
    b.shift && "Shift",
    b.meta && "Cmd",
    b.key === " " ? "Space" : b.key,
  ]
    .filter(Boolean)
    .join("+");

const tableOf = (table: typeof MAC_DEFAULTS): Record<string, string[]> =>
  Object.fromEntries(
    SHORTCUTS.map((s) => [s.id, table[s.id].map(describeBinding)]),
  );

const ids = SHORTCUTS.map((s) => s.id);

const eventOf = (b: KeyBinding): KeyboardEvent =>
  ({
    key: b.key,
    code: "",
    ctrlKey: !!b.ctrl,
    shiftKey: !!b.shift,
    altKey: !!b.alt,
    metaKey: !!b.meta,
  }) as KeyboardEvent;

/** Every chord a leader binding accepts: Jump to tab takes any digit from 1 to 9. */
const accepted = (id: ShortcutId, binding: KeyBinding): KeyBinding[] =>
  id === "tab.selectByIndex"
    ? "123456789".split("").map((key) => ({ ...binding, key }))
    : [binding];

describe.each([
  ["macOS", MAC_DEFAULTS, MAC_NATIVE],
  ["Windows and Linux", WIN_LINUX_DEFAULTS, WIN_LINUX_NATIVE],
])("%s defaults", (_, table, native) => {
  const expected = { ...LEADER_EXPECTED, ...native };

  it("are exactly the documented leader map plus native editing chords", () => {
    expect(tableOf(table)).toEqual(expected);
  });

  it("makes every application binding a leader chord", () => {
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      expect(table[id].length, id).toBeGreaterThan(0);
      for (const binding of table[id])
        expect(
          binding.leader === true,
          `${id}: ${describeBinding(binding)}`,
        ).toBe(true);
    }
  });

  it("keeps native editing chords direct and leader-free", () => {
    for (const id of NATIVE_IDS) {
      expect(
        table[id].every((binding) => !binding.leader),
        id,
      ).toBe(true);
    }
  });

  it("keeps Alt and Super out of every application chord", () => {
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      for (const binding of table[id].flatMap((b) => accepted(id, b))) {
        const text = `${id}: ${describeBinding(binding)}`;
        expect(!!binding.alt, text).toBe(false);
        expect(!!binding.meta, text).toBe(false);
        expect(!!binding.ctrl, text).toBe(false);
      }
    }
  });

  it("never repeats a leader chord anywhere in the app", () => {
    const owners = new Map<string, string>();
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      for (const binding of table[id].flatMap((b) => accepted(id, b))) {
        const key = `${binding.shift ? "shift" : ""}|${binding.key.toLowerCase()}`;
        const other = owners.get(key);
        expect(
          other === undefined || other === id,
          `${describeBinding(binding)}: ${other} and ${id}`,
        ).toBe(true);
        owners.set(key, id);
      }
    }
  });

  it("fires each leader chord for its own shortcut only", () => {
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      for (const binding of table[id].flatMap((b) => accepted(id, b))) {
        const matches = SHORTCUTS.filter((shortcut) =>
          table[shortcut.id].some((b) =>
            matchLeaderChord(
              {
                ...eventOf(binding),
                code: codeOf(binding.key),
              } as KeyboardEvent,
              b,
              shortcut.id,
            ),
          ),
        ).map((shortcut) => shortcut.id);
        expect(matches, describeBinding(binding)).toEqual([id]);
      }
    }
  });

  it("never matches a leader chord as a direct key press", () => {
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      for (const binding of table[id].flatMap((b) => accepted(id, b)))
        expect(
          matchBinding(eventOf(binding), binding, id),
          `${id}: ${describeBinding(binding)}`,
        ).toBe(false);
    }
  });

  it("matches native editing chords directly, not as leader chords", () => {
    for (const id of NATIVE_IDS) {
      for (const binding of table[id]) {
        expect(matchBinding(eventOf(binding), binding, id), id).toBe(true);
        expect(
          matchLeaderChord(eventOf(binding), { ...binding, leader: true }, id),
        ).toBe(false);
      }
    }
  });

  it("rejects Ctrl, Alt and Super after the leader", () => {
    const event = eventOf({ leader: true, key: "k" });
    expect(
      matchLeaderChord({ ...event, ctrlKey: true }, { leader: true, key: "k" }),
    ).toBe(false);
    expect(
      matchLeaderChord({ ...event, altKey: true }, { leader: true, key: "k" }),
    ).toBe(false);
    expect(
      matchLeaderChord({ ...event, metaKey: true }, { leader: true, key: "k" }),
    ).toBe(false);
  });

  it("matches shifted punctuation by its logical key", () => {
    expect(
      matchLeaderChord(
        {
          key: ">",
          code: "Period",
          shiftKey: true,
        } as KeyboardEvent,
        { leader: true, shift: true, key: "." },
      ),
    ).toBe(true);
    expect(
      matchLeaderChord(
        {
          key: "F",
          code: "KeyF",
          shiftKey: true,
        } as KeyboardEvent,
        { leader: true, shift: true, key: "f" },
      ),
    ).toBe(true);
  });

  it("does not fire a letter chord for the letter another layout types", () => {
    for (const id of ids) {
      if (NATIVE_IDS.has(id)) continue;
      for (const binding of table[id]) {
        if (!/^[a-z]$/i.test(binding.key)) continue;
        for (const letter of "abcdefghijklmnopqrstuvwxyz".split("")) {
          if (letter === binding.key.toLowerCase()) continue;
          const event = {
            ...eventOf(binding),
            key: binding.shift ? letter.toUpperCase() : letter,
            code: codeOf(binding.key),
          } as KeyboardEvent;
          if (matchLeaderChord(event, binding, id))
            throw new Error(
              `${id} ${describeBinding(binding)} fired on ${letter}`,
            );
        }
      }
    }
  });

  it("jumps to a window on leader+digit only", () => {
    const binding = table["tab.selectByIndex"][0];
    for (const digit of "123456789") {
      const event = { ...eventOf(binding), key: digit } as KeyboardEvent;
      expect(matchLeaderChord(event, binding, "tab.selectByIndex")).toBe(true);
      expect(tabDigit(event, false)).toBe(Number(digit));
    }
    expect(
      matchLeaderChord(
        { ...eventOf(binding), key: "0" } as KeyboardEvent,
        binding,
        "tab.selectByIndex",
      ),
    ).toBe(false);
    expect(
      matchLeaderChord(
        { ...eventOf(binding), key: "x" } as KeyboardEvent,
        binding,
        "tab.selectByIndex",
      ),
    ).toBe(false);
  });
});

function codeOf(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  const map: Record<string, string> = {
    "\\": "Backslash",
    "`": "Backquote",
    ";": "Semicolon",
    "/": "Slash",
    ",": "Comma",
    ".": "Period",
    "-": "Minus",
    _: "Minus",
    "=": "Equal",
    "+": "Equal",
    "[": "BracketLeft",
    "]": "BracketRight",
    "'": "Quote",
    " ": "Space",
  };
  return map[key] ?? key;
}
