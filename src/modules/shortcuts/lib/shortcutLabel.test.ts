import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyBinding } from "../shortcuts";

const prefsMock = vi.hoisted(() => ({
  shortcuts: {} as Record<string, KeyBinding[]>,
  leaderKey: { ctrl: true, key: "b" } as KeyBinding,
}));

vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: {
    getState: () => ({
      shortcuts: prefsMock.shortcuts,
      leaderKey: prefsMock.leaderKey,
    }),
  },
}));

import { labelToHint, shortcutLabel } from "./shortcutLabel";

beforeEach(() => {
  prefsMock.shortcuts = {};
  prefsMock.leaderKey = { ctrl: true, key: "b" };
});

describe("shortcutLabel", () => {
  it("opens the palette with the direct Ctrl+Space chord", () => {
    expect(shortcutLabel("commandPalette.open")).toBe("Ctrl Space");
  });

  it("prefixes a default leader chord with the configured leader", () => {
    expect(shortcutLabel("commandPalette.files")).toBe("Ctrl B P");
  });

  it("keeps Shift in the chord", () => {
    expect(shortcutLabel("commandPalette.content")).toBe("Ctrl B Shift F");
    expect(shortcutLabel("tab.newPrivate")).toBe("Ctrl B Shift N");
  });

  it("uses the configured leader key", () => {
    prefsMock.leaderKey = { ctrl: true, key: ";" };
    expect(shortcutLabel("commandPalette.files")).toBe("Ctrl ; P");
  });

  it("prefers a user override over the default binding", () => {
    prefsMock.shortcuts = {
      "commandPalette.open": [{ leader: true, key: "g" }],
    };
    expect(shortcutLabel("commandPalette.open")).toBe("Ctrl B G");
  });

  it("still renders a recorded native chord", () => {
    prefsMock.shortcuts = {
      "editor.save": [{ ctrl: true, alt: true, key: "PageDown" }],
    };
    expect(shortcutLabel("editor.save")).toBe("Ctrl Alt PageDown");
  });
});

describe("labelToHint", () => {
  const hint = (id: Parameters<typeof shortcutLabel>[0]) =>
    labelToHint(shortcutLabel(id));

  it("spells the binding that fires, inline", () => {
    expect(hint("tab.new")).toBe("Ctrl+B+N");
    expect(hint("tab.newPreview")).toBe("Ctrl+B+O");
    expect(hint("terminal.toggleInput")).toBe("Ctrl+B+M");
    expect(hint("tab.selectByIndex")).toBe("Ctrl+B+1");
  });

  it("includes Shift in a leader chord", () => {
    expect(hint("commandPalette.content")).toBe("Ctrl+B+Shift+F");
  });

  it("follows a user override", () => {
    prefsMock.shortcuts = {
      "tab.new": [{ ctrl: true, alt: true, key: "PageDown" }],
    };
    expect(labelToHint(shortcutLabel("tab.new"))).toBe("Ctrl+Alt+PageDown");
  });
});
