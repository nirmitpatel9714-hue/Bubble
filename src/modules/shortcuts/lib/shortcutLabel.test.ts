import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyBinding } from "../shortcuts";

const prefsMock = vi.hoisted(() => ({
  shortcuts: {} as Record<string, KeyBinding[]>,
  leaderKey: { ctrl: true, key: " " } as KeyBinding,
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
  prefsMock.leaderKey = { ctrl: true, key: " " };
});

describe("shortcutLabel", () => {
  it("prefixes a default leader chord with the default leader", () => {
    // Windows and Linux (the test environment): leader is Ctrl+Space.
    expect(shortcutLabel("commandPalette.open")).toBe("Ctrl Space K");
    expect(shortcutLabel("commandPalette.files")).toBe("Ctrl Space P");
  });

  it("keeps Shift in the chord", () => {
    expect(shortcutLabel("commandPalette.content")).toBe("Ctrl Space Shift F");
    expect(shortcutLabel("tab.newPrivate")).toBe("Ctrl Space Shift N");
  });

  it("uses the configured leader key", () => {
    prefsMock.leaderKey = { ctrl: true, key: ";" };
    expect(shortcutLabel("commandPalette.open")).toBe("Ctrl ; K");
  });

  it("prefers a user override over the default binding", () => {
    prefsMock.shortcuts = {
      "commandPalette.open": [{ leader: true, key: "g" }],
    };
    expect(shortcutLabel("commandPalette.open")).toBe("Ctrl Space G");
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
    expect(hint("tab.new")).toBe("Ctrl+Space+N");
    expect(hint("tab.newPreview")).toBe("Ctrl+Space+O");
    expect(hint("terminal.toggleInput")).toBe("Ctrl+Space+M");
    expect(hint("tab.selectByIndex")).toBe("Ctrl+Space+1");
  });

  it("includes Shift in a leader chord", () => {
    expect(hint("commandPalette.content")).toBe("Ctrl+Space+Shift+F");
  });

  it("follows a user override", () => {
    prefsMock.shortcuts = {
      "tab.new": [{ ctrl: true, alt: true, key: "PageDown" }],
    };
    expect(labelToHint(shortcutLabel("tab.new"))).toBe("Ctrl+Alt+PageDown");
  });
});
