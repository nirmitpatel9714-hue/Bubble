import { describe, expect, it } from "vitest";
import { matchesSettingsSearch } from "./settingsSearch";

describe("matchesSettingsSearch", () => {
  it("matches everything for an empty query", () => {
    expect(matchesSettingsSearch("", "Font size", "editor text size")).toBe(
      true,
    );
    expect(matchesSettingsSearch("   ", undefined)).toBe(true);
  });

  it("requires every term to appear across the fields", () => {
    expect(
      matchesSettingsSearch("vim mode", "Editing mode", "helix keybindings"),
    ).toBe(false);
    expect(
      matchesSettingsSearch("vim mode", "Editing mode", "vim and helix modes"),
    ).toBe(true);
  });

  it("ignores case and undefined fields", () => {
    expect(matchesSettingsSearch("TITLE", undefined, "title bar")).toBe(true);
    expect(matchesSettingsSearch("title", undefined)).toBe(false);
  });
});
