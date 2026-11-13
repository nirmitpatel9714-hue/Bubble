import { describe, expect, it } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import {
  buildShortcuts,
  getBindingTokens,
  getLeaderChordTokens,
  type KeyBinding,
  matchBinding,
  matchLeaderChord,
  SHORTCUTS,
  type Shortcut,
} from "./shortcuts";

// These tests run in the vitest node environment, where the Tauri OS plugin is
// unavailable so `IS_MAC` resolves to false. That makes the non-mac token
// branch deterministic across host platforms.

function event(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  } as KeyboardEvent;
}

const LEADER: KeyBinding = { ctrl: true, key: " " };

describe("getBindingTokens", () => {
  it("returns nothing for an undefined binding", () => {
    expect(getBindingTokens(undefined)).toEqual([]);
  });

  it("lists modifiers in order, then the key", () => {
    const binding: KeyBinding = { key: "k", ctrl: true, shift: true };
    expect(getBindingTokens(binding)).toEqual(["Ctrl", "Shift", "K"]);
  });

  it("labels space and arrow keys", () => {
    expect(getBindingTokens({ key: " ", meta: true })).toEqual([
      "Win",
      "Space",
    ]);
    expect(getBindingTokens({ key: "ArrowUp", alt: true })).toEqual([
      "Alt",
      "↑",
    ]);
  });

  it("uppercases a single-character key", () => {
    expect(getBindingTokens({ key: "c" })).toEqual(["C"]);
  });

  it("prefixes a leader chord with the configured leader", () => {
    expect(getBindingTokens({ leader: true, key: "p" }, LEADER)).toEqual([
      "Ctrl",
      "Space",
      "P",
    ]);
    expect(
      getBindingTokens({ leader: true, shift: true, key: "f" }, LEADER),
    ).toEqual(["Ctrl", "Space", "Shift", "F"]);
  });

  it("falls back to the generic leader label when the leader is unknown", () => {
    expect(getBindingTokens({ leader: true, key: "p" })).toEqual([
      "Leader",
      "P",
    ]);
  });

  it("keeps a custom leader's key token", () => {
    expect(
      getBindingTokens({ leader: true, key: "t" }, { ctrl: true, key: ";" }),
    ).toEqual(["Ctrl", ";", "T"]);
  });
});

describe("getLeaderChordTokens", () => {
  it("omits the leader prefix", () => {
    expect(getLeaderChordTokens({ leader: true, key: "t" })).toEqual(["T"]);
    expect(
      getLeaderChordTokens({ leader: true, shift: true, key: "ArrowDown" }),
    ).toEqual(["Shift", "↓"]);
  });

  it("returns nothing for a direct or missing binding", () => {
    expect(getLeaderChordTokens({ key: "t", ctrl: true })).toEqual([]);
    expect(getLeaderChordTokens(undefined)).toEqual([]);
  });
});

describe("matchBinding", () => {
  it("matches when key and all modifiers agree", () => {
    expect(
      matchBinding(event({ key: "c", ctrlKey: true }), {
        key: "c",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("matches the key case-insensitively", () => {
    expect(
      matchBinding(event({ key: "C", ctrlKey: true }), {
        key: "c",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("fails when a required modifier is missing", () => {
    expect(matchBinding(event({ key: "c" }), { key: "c", ctrl: true })).toBe(
      false,
    );
  });

  it("fails when an extra modifier is pressed", () => {
    expect(
      matchBinding(event({ key: "c", ctrlKey: true, shiftKey: true }), {
        key: "c",
        ctrl: true,
      }),
    ).toBe(false);
  });

  it("never matches a leader chord before the leader press", () => {
    expect(matchBinding(event({ key: "p" }), { leader: true, key: "p" })).toBe(
      false,
    );
  });

  it("falls back to the physical code for alt combinations", () => {
    // Alt often rewrites e.key (here to "ç"); the binding still matches via e.code.
    expect(
      matchBinding(event({ key: "ç", code: "KeyC", altKey: true }), {
        key: "c",
        alt: true,
      }),
    ).toBe(true);
    expect(
      matchBinding(event({ key: "ç", code: "KeyD", altKey: true }), {
        key: "c",
        alt: true,
      }),
    ).toBe(false);
  });

  it("matches recognized shifted punctuation by its logical key", () => {
    // The logical ">" names period even when its physical position moves.
    expect(
      matchBinding(
        event({ key: ">", code: "Period", shiftKey: true, metaKey: true }),
        { key: ".", shift: true, meta: true },
      ),
    ).toBe(true);
    expect(
      matchBinding(
        event({ key: ">", code: "Comma", shiftKey: true, metaKey: true }),
        { key: ".", shift: true, meta: true },
      ),
    ).toBe(true);
  });

  it("follows a layout that types another letter on the key (Dvorak Ctrl+Shift+C is on KeyI)", () => {
    const toggleAi = { ctrl: true, shift: true, key: "i" };
    const dvorakC = event({
      key: "C",
      code: "KeyI",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(matchBinding(dvorakC, toggleAi)).toBe(false);
    expect(matchBinding(dvorakC, { ctrl: true, shift: true, key: "c" })).toBe(
      true,
    );
    expect(
      matchBinding(
        event({ key: "W", code: "Comma", ctrlKey: true, shiftKey: true }),
        { ctrl: true, shift: true, key: "," },
      ),
    ).toBe(false);
  });

  it("still falls back to the physical key for another script or a dead key", () => {
    expect(
      matchBinding(
        event({ key: "Ш", code: "KeyI", ctrlKey: true, shiftKey: true }),
        { ctrl: true, shift: true, key: "i" },
      ),
    ).toBe(true);
    expect(
      matchBinding(
        event({ key: "Dead", code: "KeyE", altKey: true, metaKey: true }),
        { alt: true, meta: true, key: "e" },
      ),
    ).toBe(true);
  });
});

describe("matchLeaderChord", () => {
  const chord: KeyBinding = { leader: true, key: "p" };

  it("matches the plain key after the leader", () => {
    expect(matchLeaderChord(event({ key: "p" }), chord)).toBe(true);
    expect(matchLeaderChord(event({ key: "P" }), chord)).toBe(true);
  });

  it("requires the exact Shift state", () => {
    const shifted: KeyBinding = { leader: true, shift: true, key: "f" };
    expect(matchLeaderChord(event({ key: "F", shiftKey: true }), shifted)).toBe(
      true,
    );
    expect(matchLeaderChord(event({ key: "f" }), shifted)).toBe(false);
    expect(matchLeaderChord(event({ key: "F", shiftKey: true }), chord)).toBe(
      false,
    );
  });

  it("rejects Ctrl, Alt and Super pressed with the chord", () => {
    expect(matchLeaderChord(event({ key: "p", ctrlKey: true }), chord)).toBe(
      false,
    );
    expect(matchLeaderChord(event({ key: "p", altKey: true }), chord)).toBe(
      false,
    );
    expect(matchLeaderChord(event({ key: "p", metaKey: true }), chord)).toBe(
      false,
    );
  });

  it("rejects a direct binding", () => {
    expect(matchLeaderChord(event({ key: "p" }), { key: "p" })).toBe(false);
  });

  it("matches shifted punctuation by its logical key", () => {
    expect(
      matchLeaderChord(event({ key: ">", code: "Period", shiftKey: true }), {
        leader: true,
        shift: true,
        key: ".",
      }),
    ).toBe(true);
  });

  it("only accepts digit keys for the jump-to-window chord", () => {
    const jump: KeyBinding = { leader: true, key: "1" };
    expect(
      matchLeaderChord(
        event({ key: "7", code: "Digit7" }),
        jump,
        "tab.selectByIndex",
      ),
    ).toBe(true);
    expect(
      matchLeaderChord(
        event({ key: "x", code: "KeyX" }),
        jump,
        "tab.selectByIndex",
      ),
    ).toBe(false);
    expect(
      matchLeaderChord(event({ key: "0" }), jump, "tab.selectByIndex"),
    ).toBe(false);
  });

  it("replays a recorded chord verbatim", () => {
    const recorded: KeyBinding = { leader: true, key: "/" };
    expect(
      matchLeaderChord(
        event({ key: "/", code: "Slash" }),
        recorded,
        undefined,
        true,
      ),
    ).toBe(true);
    expect(
      matchLeaderChord(
        event({ key: "?", code: "Slash" }),
        recorded,
        undefined,
        true,
      ),
    ).toBe(false);
  });
});

describe("SHORTCUTS registry", () => {
  it("binds Mod+S to editor.save as a native direct chord", () => {
    const save = SHORTCUTS.find((s) => s.id === "editor.save");
    expect(save).toBeDefined();
    expect(save!.defaultBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "s", [MOD_PROP]: true }),
      ]),
    );
    expect(save!.defaultBindings.every((b) => !b.leader)).toBe(true);
  });

  it("binds leader+t to tiling.toggle", () => {
    const tiling = SHORTCUTS.find((s) => s.id === "tiling.toggle");
    expect(tiling?.defaultBindings).toEqual([{ leader: true, key: "t" }]);
  });
});

describe("palette shortcuts", () => {
  const defaults = (list: Shortcut[], id: string) =>
    list.find((s) => s.id === id)?.defaultBindings ?? [];
  const press = (key: string, over: Partial<KeyboardEvent> = {}) =>
    event({ key, ...over });

  it.each([
    ["macOS", true],
    ["Windows and Linux", false],
  ])(
    "opens files on leader+p and commands on leader+k (%s)",
    (_name, isMac) => {
      const list = buildShortcuts(isMac);
      const [files] = defaults(list, "commandPalette.files");
      const [commands] = defaults(list, "commandPalette.open");
      const [content] = defaults(list, "commandPalette.content");
      expect(matchLeaderChord(press("p"), files)).toBe(true);
      expect(matchLeaderChord(press("k"), commands)).toBe(true);
      expect(matchLeaderChord(press("F", { shiftKey: true }), content)).toBe(
        true,
      );
      // A Ctrl/Command press is never the chord, even on the same letter.
      expect(
        matchLeaderChord(press("p", { ctrlKey: true, metaKey: true }), files),
      ).toBe(false);
    },
  );

  it("keeps the terminal clear ahead of the palette in registry order", () => {
    const ids = buildShortcuts(true).map((s) => s.id);
    expect(ids.indexOf("terminal.clear")).toBeLessThan(
      ids.indexOf("commandPalette.open"),
    );
  });

  it.each([
    ["macOS", true],
    ["Windows and Linux", false],
  ])(
    "gives no default binding to two shortcuts in the same context (%s)",
    (_name, isMac) => {
      const seen = new Map<string, string>();
      for (const s of buildShortcuts(isMac)) {
        for (const b of s.defaultBindings) {
          const keys =
            s.id === "tab.selectByIndex" ? "123456789".split("") : [b.key];
          for (const key of keys) {
            const sig = [
              b.leader ? "leader" : "direct",
              b.ctrl,
              b.shift,
              b.alt,
              b.meta,
              key.toLowerCase(),
            ].join("|");
            const other = seen.get(sig);
            if (other) throw new Error(`${s.id} and ${other} share ${sig}`);
            seen.set(sig, s.id);
          }
        }
      }
    },
  );
});
