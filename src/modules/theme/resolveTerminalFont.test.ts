import { describe, expect, it } from "vitest";
import { resolveTerminalFont, type TerminalFont } from "./resolveTerminalFont";
import type { Theme } from "./types";

const preferences: TerminalFont = {
  fontFamily: "JetBrains Mono",
  fontWeight: "normal",
  fontSize: 14,
};

describe("resolveTerminalFont", () => {
  it("keeps an explicitly chosen font family and takes theme size/weight", () => {
    const theme: Theme = {
      id: "custom-theme",
      name: "Custom",
      variants: {
        dark: {
          terminal: {
            fontFamily: "Iosevka",
            fontSize: 16,
          },
        },
      },
    };

    expect(resolveTerminalFont(preferences, theme, "dark")).toEqual({
      fontFamily: "JetBrains Mono",
      fontWeight: "normal",
      fontSize: 16,
    });
  });

  it("falls back to the theme font when the user has not chosen one", () => {
    const theme: Theme = {
      id: "theme-font",
      name: "Theme font",
      variants: { dark: { terminal: { fontFamily: "Iosevka" } } },
    };

    expect(
      resolveTerminalFont(
        { fontFamily: "  ", fontWeight: "normal", fontSize: 14 },
        theme,
        "dark",
      ).fontFamily,
    ).toBe("Iosevka");
  });

  it("restores global preferences when the theme has no font values", () => {
    const theme: Theme = {
      id: "colors-only",
      name: "Colors only",
      variants: { dark: { terminal: { foreground: "#ffffff" } } },
    };

    expect(resolveTerminalFont(preferences, theme, "dark")).toEqual(
      preferences,
    );
  });

  it("uses the same variant fallback order as theme colors", () => {
    const theme: Theme = {
      id: "dark-only",
      name: "Dark only",
      variants: {
        dark: { terminal: { fontWeight: "bold" } },
      },
    };

    expect(resolveTerminalFont(preferences, theme, "light").fontWeight).toBe(
      "bold",
    );
  });
});
