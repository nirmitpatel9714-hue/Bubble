import type { SettingsTab } from "@/modules/settings/openSettingsWindow";

export type SettingsSearchEntry = {
  tab: SettingsTab;
  title: string;
  /** Extra words that should find this setting (synonyms, aliases). */
  keywords?: string;
};

/**
 * Cross-tab catalogue for the settings search box. The active tab also
 * filters its own rows live; this list makes settings in other tabs
 * discoverable without mounting every section.
 *
 * Keep it in sync when adding or renaming a setting.
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // General
  {
    tab: "general",
    title: "Appearance",
    keywords: "theme mode system light dark",
  },
  { tab: "general", title: "Zoom", keywords: "ui scale zoom level" },
  {
    tab: "general",
    title: "Show hidden files",
    keywords: "dotfiles dotfiles explorer",
  },
  {
    tab: "general",
    title: "Git decorations",
    keywords: "explorer status modified ignored",
  },
  {
    tab: "general",
    title: "Directory follows active tab",
    keywords: "explorer root cwd folder follow",
  },
  {
    tab: "general",
    title: "Use system title bar",
    keywords: "window decorations native titlebar controls",
  },
  {
    tab: "general",
    title: "Terminal renderer",
    keywords: "webgpu webgl gpu renderer",
  },
  {
    tab: "general",
    title: "Screen reader support",
    keywords: "accessibility a11y terminal",
  },
  {
    tab: "general",
    title: "Cursor blinking",
    keywords: "terminal cursor blink",
  },
  {
    tab: "general",
    title: "Cursor style",
    keywords: "terminal cursor bar block underline",
  },
  {
    tab: "general",
    title: "Font family",
    keywords: "terminal font typeface nerd font",
  },
  { tab: "general", title: "Font weight", keywords: "terminal font bold" },
  {
    tab: "general",
    title: "Integrated terminal shell",
    keywords: "shell bash zsh powershell pwsh cmd",
  },
  {
    tab: "general",
    title: "Workspace environment",
    keywords: "wsl distro linux workspace",
  },
  {
    tab: "general",
    title: "Letter spacing",
    keywords: "terminal font spacing",
  },
  { tab: "general", title: "Font size", keywords: "terminal text size" },
  {
    tab: "general",
    title: "Scrollback",
    keywords: "terminal history scrollback lines",
  },
  { tab: "general", title: "Option as Alt", keywords: "macos option alt meta" },
  {
    tab: "general",
    title: "Scroll speed",
    keywords: "terminal mouse wheel trackpad",
  },
  {
    tab: "general",
    title: "Confirm before killing a running process",
    keywords: "close terminal confirmation quit",
  },
  {
    tab: "general",
    title: "Coding agent notifications",
    keywords: "notifications alerts agent",
  },
  {
    tab: "general",
    title: "Notification sound",
    keywords: "sound alert agent",
  },
  {
    tab: "general",
    title: "Launch at login",
    keywords: "autostart startup boot",
  },
  {
    tab: "general",
    title: "Restore window position & size",
    keywords: "window state restore launch",
  },

  // Editor
  { tab: "editor", title: "Font size", keywords: "editor code text size" },
  {
    tab: "editor",
    title: "Editing mode",
    keywords: "vim helix modal keybindings keymap",
  },
  { tab: "editor", title: "Word wrap", keywords: "editor wrap lines" },
  { tab: "editor", title: "Wrap column", keywords: "editor wrap width column" },
  { tab: "editor", title: "Auto save", keywords: "editor autosave save" },
  {
    tab: "editor",
    title: "Auto save delay",
    keywords: "editor autosave delay",
  },
  {
    tab: "editor",
    title: "Format on save",
    keywords: "editor formatter format save",
  },
  {
    tab: "editor",
    title: "Formatter",
    keywords: "editor formatter prettier ruff",
  },
  {
    tab: "editor",
    title: "Custom command",
    keywords: "editor formatter custom command",
  },
  {
    tab: "editor",
    title: "Language overrides",
    keywords: "editor formatter language per-language",
  },
  {
    tab: "editor",
    title: "Language servers",
    keywords: "lsp language server intellisense nix nil",
  },

  // Themes
  {
    tab: "themes",
    title: "Theme",
    keywords: "color scheme palette appearance",
  },
  {
    tab: "themes",
    title: "Editor theme",
    keywords: "syntax colors code editor theme",
  },
  {
    tab: "themes",
    title: "Background",
    keywords: "background image wallpaper",
  },
  {
    tab: "themes",
    title: "Background opacity",
    keywords: "background transparency opacity",
  },
  { tab: "themes", title: "Background blur", keywords: "background blur" },
  {
    tab: "themes",
    title: "Window vibrancy",
    keywords: "vibrancy acrylic transparency",
  },

  // CSS
  {
    tab: "css",
    title: "Terminal CSS",
    keywords: "css corners square terminal",
  },
  {
    tab: "css",
    title: "Custom CSS",
    keywords: "css custom stylesheet user styles",
  },

  // Shortcuts
  {
    tab: "shortcuts",
    title: "Keyboard shortcuts",
    keywords: "keybindings keys hotkeys",
  },
  {
    tab: "shortcuts",
    title: "Leader key",
    keywords: "leader chord keybinding",
  },

  // Models
  { tab: "models", title: "Default model", keywords: "ai model default" },
  {
    tab: "models",
    title: "Providers",
    keywords: "api key provider openai anthropic",
  },
  {
    tab: "models",
    title: "Custom endpoints",
    keywords: "openai compatible endpoint local",
  },
  {
    tab: "models",
    title: "Speech to text",
    keywords: "stt voice dictation whisper",
  },

  // Agents
  {
    tab: "agents",
    title: "Coding agents",
    keywords: "agents claude codex launcher",
  },
  { tab: "agents", title: "Custom agents", keywords: "agents custom command" },

  // About
  { tab: "about", title: "About", keywords: "version update build" },
];
