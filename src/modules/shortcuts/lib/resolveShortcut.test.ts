import { describe, expect, it } from "vitest";
import { buildShortcuts, type KeyBinding, type ShortcutId } from "../shortcuts";
import { resolveShortcut, type ShortcutMode } from "./resolveShortcut";

const mac = buildShortcuts(true);
const other = buildShortcuts(false);

const CODE_FOR: Record<string, string> = {
  " ": "Space",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight",
  "=": "Equal",
  "-": "Minus",
  "`": "Backquote",
  "\\": "Backslash",
};

function press(
  key: string,
  mods = "",
  over: Partial<KeyboardEvent> = {},
): KeyboardEvent {
  return {
    key,
    code: /^[a-z]$/i.test(key)
      ? `Key${key.toUpperCase()}`
      : (CODE_FOR[key] ?? key),
    ctrlKey: mods.includes("C"),
    shiftKey: mods.includes("S"),
    altKey: mods.includes("A"),
    metaKey: mods.includes("M"),
    repeat: false,
    ...over,
  } as KeyboardEvent;
}

const run = (
  shortcuts: typeof mac,
  event: KeyboardEvent,
  opts: {
    mode: ShortcutMode;
    disabled?: ShortcutId[];
    handlers?: ShortcutId[] | "all";
    user?: Partial<Record<ShortcutId, KeyBinding[]>>;
  },
) =>
  resolveShortcut(event, {
    shortcuts,
    user: opts.user ?? {},
    isDisabled: (id) => opts.disabled?.includes(id) ?? false,
    hasHandler: (id) =>
      opts.handlers === undefined ||
      opts.handlers === "all" ||
      opts.handlers.includes(id),
    mode: opts.mode,
  });

const leader = (
  shortcuts: typeof mac,
  event: KeyboardEvent,
  opts: Omit<Parameters<typeof run>[2], "mode"> = {},
) => run(shortcuts, event, { ...opts, mode: "leader" });

const direct = (
  shortcuts: typeof mac,
  event: KeyboardEvent,
  opts: Omit<Parameters<typeof run>[2], "mode"> = {},
) => run(shortcuts, event, { ...opts, mode: "direct" });

describe.each([
  ["macOS", mac],
  ["Windows and Linux", other],
])("leader mode on %s", (_name, shortcuts) => {
  it("resolves an application shortcut from its plain chord", () => {
    expect(leader(shortcuts, press("p"))).toBe("commandPalette.files");
    expect(leader(shortcuts, press("n"))).toBe("tab.new");
    expect(leader(shortcuts, press("t"))).toBe("tiling.toggle");
    expect(leader(shortcuts, press(" "))).toBe("space.overview");
    expect(leader(shortcuts, press(","))).toBe("settings.open");
  });

  it("treats Shift as part of the chord", () => {
    expect(leader(shortcuts, press("F", "S"))).toBe("commandPalette.content");
    expect(leader(shortcuts, press("f"))).toBeNull();
    expect(leader(shortcuts, press("N", "S"))).toBe("tab.newPrivate");
    expect(leader(shortcuts, press("n"))).toBe("tab.new");
  });

  it("rejects Ctrl, Alt and Super after the leader", () => {
    for (const mods of ["C", "A", "M", "CA", "CM", "AS"])
      expect(leader(shortcuts, press("p", mods))).toBeNull();
  });

  it("resolves arrows and Tab for window switching", () => {
    expect(leader(shortcuts, press("ArrowRight"))).toBe("tab.next");
    expect(leader(shortcuts, press("ArrowLeft"))).toBe("tab.prev");
    expect(leader(shortcuts, press("Tab"))).toBe("tab.next");
    expect(leader(shortcuts, press("Tab", "S"))).toBe("tab.prev");
  });

  it("jumps to a window only on leader+digit", () => {
    expect(leader(shortcuts, press("3", "", { code: "Digit3" }))).toBe(
      "tab.selectByIndex",
    );
    // Leader+0 is Reset zoom, not a window jump.
    expect(leader(shortcuts, press("0", "", { code: "Digit0" }))).toBe(
      "view.zoomReset",
    );
    // A shifted symbol on a digit key is not a jump.
    expect(leader(shortcuts, press("!", "S", { code: "Digit1" }))).toBeNull();
    expect(leader(shortcuts, press("q"))).toBeNull();
  });

  it("never resolves a native editing chord", () => {
    expect(leader(shortcuts, press("s", "C"))).toBeNull();
    expect(leader(shortcuts, press("s", "M"))).toBeNull();
  });

  it("lets a recorded leader binding win over a default", () => {
    const user = { "view.zenMode": [{ leader: true, key: "k" }] };
    expect(leader(shortcuts, press("k"), { user })).toBe("view.zenMode");
    expect(leader(shortcuts, press("z"), { user })).toBeNull();
  });

  it("continues past a disabled recorded match to a default", () => {
    const user = { "view.zenMode": [{ leader: true, key: "k" }] };
    expect(
      leader(shortcuts, press("k"), { user, disabled: ["view.zenMode"] }),
    ).toBe("commandPalette.open");
  });

  it("continues past a disabled default to another default", () => {
    const user = { "commandPalette.open": [{ leader: true, key: "g" }] };
    expect(leader(shortcuts, press("g"), { user })).toBe("commandPalette.open");
    expect(
      leader(shortcuts, press("g"), {
        user,
        disabled: ["commandPalette.open"],
      }),
    ).toBe("pane.source");
  });

  it("ends the search at an enabled shortcut without a handler", () => {
    expect(leader(shortcuts, press("p"), { handlers: [] })).toBeNull();
  });

  it("skips repeats unless the shortcut allows them", () => {
    expect(leader(shortcuts, press("ArrowDown", "", { repeat: true }))).toBe(
      "blocks.next",
    );
    expect(leader(shortcuts, press("t", "", { repeat: true }))).toBeNull();
  });

  it("replays a recorded symbol as typed, not as its logical key", () => {
    const user = { "view.zenMode": [{ leader: true, key: "/" }] };
    expect(leader(shortcuts, press("/"), { user })).toBe("view.zenMode");
    expect(leader(shortcuts, press("?"), { user })).toBeNull();
  });
});

describe.each([
  ["macOS", mac, "M"],
  ["Windows and Linux", other, "C"],
])("direct mode on %s", (_name, shortcuts, mod) => {
  it("resolves native editing chords", () => {
    expect(direct(shortcuts, press("s", mod))).toBe("editor.save");
    expect(direct(shortcuts, press("z", mod))).toBe("editor.undo");
    expect(direct(shortcuts, press("Z", `${mod}S`))).toBe("editor.redo");
  });

  it("requires the chord's modifiers exactly", () => {
    expect(direct(shortcuts, press("s", `${mod}S`))).toBeNull();
    expect(direct(shortcuts, press("s"))).toBeNull();
  });

  it("never resolves a leader chord", () => {
    expect(direct(shortcuts, press("p"))).toBeNull();
    expect(direct(shortcuts, press("t"))).toBeNull();
    expect(direct(shortcuts, press("F", "S"))).toBeNull();
    expect(direct(shortcuts, press("ArrowRight"))).toBeNull();
  });

  it("resolves a recorded direct binding", () => {
    const user = { "view.zenMode": [{ ctrl: true, key: "k" }] };
    expect(direct(shortcuts, press("k", "C"), { user })).toBe("view.zenMode");
    expect(direct(shortcuts, press("z"), { user })).toBeNull();
  });

  it("continues to defaults when a recorded match is disabled", () => {
    const user = {
      "editor.save": [{ ctrl: mod === "C", meta: mod === "M", key: "z" }],
    };
    expect(
      direct(shortcuts, press("z", mod), {
        user,
        disabled: ["editor.save"],
      }),
    ).toBe("editor.undo");
  });

  it("ends the search at an enabled shortcut without a handler", () => {
    expect(direct(shortcuts, press("s", mod), { handlers: [] })).toBeNull();
  });

  it("skips repeats of shortcuts that do not allow them", () => {
    expect(direct(shortcuts, press("z", mod, { repeat: true }))).toBeNull();
  });
});
