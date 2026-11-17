import { describe, expect, it } from "vitest";
import {
  mapNoctaliaPalette,
  noctaliaPalettePath,
  selectionAsTint,
} from "./noctaliaLive";

function renderedVariant(overrides: Record<string, unknown> = {}) {
  return {
    background: "#1c1822",
    foreground: "#e9e4f0",
    card: "#262130",
    cardForeground: "#e9e4f0",
    popover: "#262130",
    popoverForeground: "#e9e4f0",
    primary: "#c7a1d8",
    primaryForeground: "#1a151f",
    secondary: "#9f75bd",
    secondaryForeground: "#f3edf7",
    muted: "#262130",
    mutedForeground: "#a79ab0",
    accent: "#262130",
    accentForeground: "#e9e4f0",
    destructive: "#e9899d",
    border: "#3e364e",
    input: "#3e364e",
    ring: "#c7a1d8",
    sidebar: "#120f18",
    sidebarForeground: "#e9e4f0",
    sidebarPrimary: "#c7a1d8",
    sidebarPrimaryForeground: "#1a151f",
    sidebarAccent: "#262130",
    sidebarAccentForeground: "#e9e4f0",
    sidebarBorder: "#3e364e",
    sidebarRing: "#c7a1d8",
    terminalBackground: "#1c1822",
    terminalForeground: "#e9e4f0",
    cursor: "#c7a1d8",
    cursorAccent: "#1c1822",
    selection: "#c7a1d8",
    ansi: Array.from({ length: 16 }, (_, i) => `#${(i + 1).toString(16)}2345`),
    ...overrides,
  };
}

describe("noctaliaLive", () => {
  it("maps a rendered palette to a theme with both variants", () => {
    const theme = mapNoctaliaPalette({
      version: 1,
      dark: renderedVariant(),
      light: renderedVariant({ background: "#f5f1fa" }),
    });
    expect(theme).not.toBeNull();
    expect(theme?.id).toBe("noctalia");
    expect(theme?.variants.dark?.colors?.primary).toBe("#c7a1d8");
    expect(theme?.variants.light?.colors?.background).toBe("#f5f1fa");
    expect(theme?.variants.dark?.terminal?.ansi).toHaveLength(16);
  });

  it("keeps a variant when only one mode rendered", () => {
    const theme = mapNoctaliaPalette({ dark: renderedVariant() });
    expect(theme).not.toBeNull();
    expect(theme?.variants.dark).toBeDefined();
    expect(theme?.variants.light).toBeUndefined();
  });

  it("returns null for missing required colors", () => {
    const missing = renderedVariant();
    delete (missing as Record<string, unknown>).primary;
    expect(mapNoctaliaPalette({ dark: missing })).toBeNull();
    expect(mapNoctaliaPalette({})).toBeNull();
    expect(mapNoctaliaPalette(null)).toBeNull();
  });

  it("returns null for a wrong-length ansi array", () => {
    const bad = renderedVariant({ ansi: ["#000000", "#ffffff"] });
    expect(mapNoctaliaPalette({ dark: bad })).toBeNull();
  });

  it("falls back to theme colors for absent terminal keys", () => {
    const sparse = renderedVariant();
    delete (sparse as Record<string, unknown>).terminalBackground;
    delete (sparse as Record<string, unknown>).cursor;
    const theme = mapNoctaliaPalette({ dark: sparse });
    expect(theme?.variants.dark?.terminal?.background).toBe("#1c1822");
    expect(theme?.variants.dark?.terminal?.cursor).toBe("#c7a1d8");
  });

  it("renders opaque selection colors as translucent tints", () => {
    expect(selectionAsTint("#c7a1d8")).toBe("rgba(199, 161, 216, 0.30)");
    expect(selectionAsTint("#c7a1d8ff")).toBe("rgba(199, 161, 216, 0.30)");
    expect(selectionAsTint("#c7a1d880")).toBe("rgba(199, 161, 216, 0.15)");
    expect(selectionAsTint("rgba(199, 161, 216, 0.5)")).toBe(
      "rgba(199, 161, 216, 0.15)",
    );
    // Non-color strings pass through untouched.
    expect(selectionAsTint("not-a-color")).toBe("not-a-color");
  });

  it("builds the palette path under the user's home", () => {
    expect(noctaliaPalettePath("/home/nirmit")).toBe(
      "/home/nirmit/.config/bubble/noctalia.json",
    );
    expect(noctaliaPalettePath("C:\\Users\\Nirmit\\")).toBe(
      "C:\\Users\\Nirmit/.config/bubble/noctalia.json",
    );
  });
});
