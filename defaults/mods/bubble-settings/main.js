// Bubble feature pack: one settings surface for the editor, AI, Git, preview,
// diagnostics, themes and keybindings. Values live in shared("bubble.settings").
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, Scrollbar } from "gpui-base";
import {
  shared, setShared, theme, themes, keys, settings, run, notify, window, exec,
  appHome, nextCommand,
} from "bubble";

const DEFAULTS = {
  editor: {
    autosave: false, autosaveDelay: 1200, formatOnSave: false, formatter: "auto",
    customFormatter: "", wordWrap: false, quickOpenLimit: 5000,
  },
  ai: {
    provider: "openai", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1",
    temperature: 0.2, envKey: "", maxMessages: 30, snippets: [],
    systemPrompt: "You are Bubble, a concise coding assistant inside Bubble. Answer with short explanations and complete code blocks. To change a file, emit a fenced block tagged bubble-write with the path on the same line, followed by the full new content. To run a command, use a bubble-shell block. To read a file, use a bubble-read block with the path.",
  },
  git: { confirmDiscard: true, historyLimit: 80, autoRefresh: true },
  preview: { renderMarkdown: true, followRecentFile: true, maxPreviewBytes: 2000000 },
  diagnostics: { command: "", autoRun: false, timeout: 120000, maxProblems: 800, root: "" },
};

const SECTIONS = [
  { id: "editor", label: "Editor", icon: "square-pen", about: "Editing, autosave, formatting and quick open.", fields: [
    { key: "autosave", type: "bool", label: "Autosave", hint: "Save dirty files after a pause." },
    { key: "autosaveDelay", type: "number", label: "Autosave delay (ms)", min: 300, max: 60000 },
    { key: "formatOnSave", type: "bool", label: "Format on save", hint: "Run the matching formatter after each save." },
    { key: "formatter", type: "select", label: "Formatter", options: ["auto", "prettier", "biome", "ruff", "rustfmt", "gofmt", "clang-format", "shfmt", "zigfmt", "custom"] },
    { key: "customFormatter", type: "text", label: "Custom formatter command", hint: "Use {file}; runs only when Formatter is custom." },
    { key: "wordWrap", type: "bool", label: "Word wrap", hint: "Wrap long lines in the editor." },
    { key: "quickOpenLimit", type: "number", label: "Quick-open file limit", min: 100, max: 50000 },
  ] },
  { id: "ai", label: "AI", icon: "layers", about: "Bring your own key. The key is never saved here.", fields: [
    { key: "provider", type: "select", label: "Provider", options: ["openai", "anthropic", "google", "openrouter", "groq", "deepseek", "mistral", "xai", "cerebras", "ollama", "lmstudio", "mlx", "custom"] },
    { key: "model", type: "text", label: "Model", hint: "Any model id the provider accepts." },
    { key: "baseUrl", type: "text", label: "Base URL", hint: "Use an OpenAI-compatible endpoint for local models." },
    { key: "temperature", type: "number", label: "Temperature", min: 0, max: 2, step: 0.1 },
    { key: "envKey", type: "text", label: "Environment variable for the key", hint: "Checked after BUBBLE_AI_API_KEY and the provider's usual variable." },
    { key: "maxMessages", type: "number", label: "History messages", min: 4, max: 100 },
    { key: "systemPrompt", type: "textarea", label: "System prompt", rows: 5 },
    { key: "snippets", type: "json", label: "Prompt snippets", hint: "JSON array of {handle, text}; type #handle in the composer." },
  ] },
  { id: "git", label: "Git", icon: "git-branch", about: "Changes, commits, history and branches.", fields: [
    { key: "confirmDiscard", type: "bool", label: "Confirm discards", hint: "Ask once before throwing away changes." },
    { key: "historyLimit", type: "number", label: "History commits", min: 10, max: 1000 },
    { key: "autoRefresh", type: "bool", label: "Auto-refresh", hint: "Poll the repository while the panel is open." },
  ] },
  { id: "preview", label: "Preview", icon: "monitor", about: "Markdown, source, images and local URLs.", fields: [
    { key: "renderMarkdown", type: "bool", label: "Render Markdown", hint: "Off shows Markdown as source first." },
    { key: "followRecentFile", type: "bool", label: "Open the most recent file", hint: "An empty preview picks the last file opened from Files or the editor." },
    { key: "maxPreviewBytes", type: "number", label: "Maximum preview bytes", min: 100000, max: 12000000 },
  ] },
  { id: "diagnostics", label: "Problems", icon: "circle-check", about: "The checker behind the Problems panel.", fields: [
    { key: "command", type: "text", label: "Check command", hint: "Empty auto-detects tsc, Cargo, go vet, ruff, eslint or npm scripts." },
    { key: "autoRun", type: "bool", label: "Auto-run every 30 seconds", hint: "Only while a Problems copy is open." },
    { key: "timeout", type: "number", label: "Timeout (ms)", min: 5000, max: 600000 },
    { key: "maxProblems", type: "number", label: "Maximum problems", min: 50, max: 5000 },
    { key: "root", type: "text", label: "Project folder override", hint: "Empty follows the focused terminal." },
  ] },
  { id: "appearance", label: "Appearance", icon: "monitor", about: "Themes and how this pack looks.", fields: [] },
  { id: "keys", label: "Keys", icon: "settings", about: "Bubble shortcuts and mod commands.", fields: [] },
  { id: "about", label: "About", icon: "file-text", about: "What this feature pack ports, and what it cannot.", fields: [] },
];

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

function allSettings() {
  const live = shared("bubble.settings");
  const stored = live && typeof live === "object" && !Array.isArray(live) ? live : {};
  const out = {};
  for (const [id, defaults] of Object.entries(DEFAULTS)) out[id] = { ...clone(defaults), ...(stored[id] ?? {}) };
  for (const [id, value] of Object.entries(stored)) if (!(id in out)) out[id] = value;
  return out;
}

function quote(text, platform) {
  return platform === "windows" ? `'${String(text).replace(/'/g, "''")}'` : `'${String(text).replace(/'/g, "'\\''")}'`;
}

async function openPath(path) {
  const platform = window()?.platform;
  try {
    if (platform === "macos") await exec("open", [path]);
    else if (platform === "windows") await exec("powershell", ["-NoProfile", "-Command", `Start-Process ${quote(path, "windows")}`]);
    else await exec("xdg-open", [path]);
  } catch {}
}

export default class BubbleSettings extends View {
  init(_props, cx) {
    this.section = "editor";
    this.draft = allSettings();
    this.note = "";
    this.handle = cx.focus_handle();
    this.states = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        if (field.type === "bool" || field.type === "select" || field.type === "json") continue;
        const value = this.draft[section.id]?.[field.key];
        const state = field.type === "textarea"
          ? TextareaState.new({ value: value === undefined ? "" : String(value), rows: field.rows ?? 4 })
          : InputState.new({ value: value === undefined ? "" : String(value), placeholder: field.hint ?? "" });
        state.on("change", (_e, cx) => {
          const text = typeof state.value === "function" ? state.value() : "";
          if (text !== undefined) this.draft[section.id][field.key] = text;
          cx.notify();
        });
        this.states[`${section.id}.${field.key}`] = state;
      }
    }
    this.snippets = TextareaState.new({ value: JSON.stringify(this.draft.ai.snippets ?? [], null, 2), rows: 5 });
    this.snippets.on("change", (_e, cx) => { this.snippetText = this.snippets.value(); cx.notify(); });
    this.snippetText = JSON.stringify(this.draft.ai.snippets ?? [], null, 2);

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "save") this.save(cx);
        else if (command === "reset") this.reset(cx);
        else if (command === "focus") this.handle.focus();
        cx.notify();
      }
    });
    this.handle.focus();
  }

  save(cx) {
    let snippets = this.draft.ai.snippets;
    try {
      const parsed = JSON.parse(this.snippetText || "[]");
      if (!Array.isArray(parsed)) throw new Error("Snippets must be an array");
      snippets = parsed.filter((s) => s && typeof s.handle === "string" && typeof s.text === "string");
      this.draft.ai.snippets = snippets;
    } catch (e) {
      this.section = "ai";
      this.note = `Snippets: ${e}`;
      cx.notify();
      return;
    }
    const clean = {};
    for (const section of SECTIONS) {
      if (!DEFAULTS[section.id]) continue;
      const value = { ...DEFAULTS[section.id], ...(this.draft[section.id] ?? {}) };
      for (const field of section.fields) {
        const key = field.key;
        if (field.type === "bool") continue;
        if (field.type === "number") {
          const n = Number(value[key]);
          value[key] = Number.isFinite(n) ? Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n)) : DEFAULTS[section.id][key];
        }
        if (field.type === "text" || field.type === "textarea" || field.type === "json") value[key] = String(value[key] ?? "");
        if (field.type === "select" && !field.options.includes(value[key])) value[key] = DEFAULTS[section.id][key];
      }
      if (section.id === "ai") value.snippets = snippets;
      clean[section.id] = value;
    }
    for (const [id, value] of Object.entries(this.draft)) if (!(id in clean)) clean[id] = value;
    setShared("bubble.settings", clean);
    this.draft = clone(clean);
    this.note = "Saved. Open panels pick the changes up on their next refresh.";
    notify({ title: "Bubble settings saved", level: "success" });
    cx.notify();
  }

  reset(cx) {
    const draft = clone(this.draft);
    if (DEFAULTS[this.section]) draft[this.section] = clone(DEFAULTS[this.section]);
    this.draft = draft;
    this.syncStates();
    this.note = `Reset ${SECTIONS.find((s) => s.id === this.section)?.label ?? this.section}`;
    cx.notify();
  }

  syncStates() {
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const state = this.states[`${section.id}.${field.key}`];
        if (!state) continue;
        const value = this.draft[section.id]?.[field.key];
        state.set_value(value === undefined ? "" : String(value));
      }
    }
    this.snippetText = JSON.stringify(this.draft.ai.snippets ?? [], null, 2);
    this.snippets.set_value(this.snippetText);
  }

  toggle(section, field, cx) {
    this.draft[section][field] = !this.draft[section][field];
    this.note = "";
    cx.notify();
  }

  pick(section, field, value, cx) {
    this.draft[section][field] = value;
    if (section === "ai" && field === "provider") {
      this.note = "Set the new provider's model and base URL before sending.";
    }
    cx.notify();
  }

  row(t, field, section, cx) {
    const value = this.draft[section.id]?.[field.key];
    const label = v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_size(12.5).text_color(t.foreground).child(field.label))
      .when(Boolean(field.hint), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(field.hint)));
    let control;
    if (field.type === "bool") {
      control = div().id(`bs-${section.id}-${field.key}`).w(36).h(20).flex_none().rounded(10).p(2).cursor_pointer()
        .bg(value ? t.accent : t.input).when(value, (el) => el.justify_end())
        .on_click(() => this.toggle(section.id, field.key, cx))
        .child(div().w(16).h(16).rounded(8).bg(value ? t.accent_foreground : t.muted));
    } else if (field.type === "select") {
      control = h_flex().flex_wrap().gap(4).max_w(430)
        .children(field.options.map((option) => div().id(`bs-${section.id}-${field.key}-${option}`).h(24).px(7).flex().items_center().rounded(5).cursor_pointer()
          .text_size(10.5).bg(value === option ? t.selected : t.chrome).text_color(value === option ? t.foreground : t.muted)
          .hover((s) => s.bg(t.hover)).on_click(() => this.pick(section.id, field.key, option, cx)).child(option)));
    } else {
      const state = this.states[`${section.id}.${field.key}`];
      control = field.type === "textarea"
        ? div().w(430).max_w_full().rounded(6).border_1().border_color(t.input).bg(t.background).p(4)
          .child(Textarea.new(state).h(78).w_full().text_size(11.5).text_color(t.foreground))
        : h_flex().w(300).max_w_full().h(28).px(7).rounded(6).border_1().border_color(t.input).bg(t.background)
          .child(Input.new(state).flex_1().h_full().text_size(11.5).text_color(t.foreground));
    }
    return h_flex().w_full().gap(16).items_start().py(8).border_b(1).border_color(t.border)
      .child(label).child(div().flex_none().max_w("52%").child(control));
  }

  editorSection(t, cx) {
    const section = SECTIONS.find((s) => s.id === this.section);
    return v_flex().gap(0)
      .child(h_flex().pb(10).gap(8).items_center()
        .child(div().flex_1().text_size(16).font_semibold().child(section.label))
        .child(this.button("bs-save", "Save", true, () => this.save(cx)))
        .child(this.button("bs-reset", "Reset section", false, () => this.reset(cx))))
      .child(div().text_size(11.5).text_color(t.dim).pb(8).child(section.about))
      .children(section.fields.filter((field) => field.type !== "json").map((field) => this.row(t, field, section, cx)))
      .when(this.section === "ai", (el) => el
        .child(v_flex().py(10).gap(5).border_b(1).border_color(t.border)
          .child(div().text_size(12.5).text_color(t.foreground).child("API key"))
          .child(div().text_size(10.5).text_color(t.dim).child("Never stored. Bubble reads the session key or an environment variable; use the AI panel's key field for this session.")))
        .child(v_flex().py(10).gap(5)
          .child(div().text_size(12.5).text_color(t.foreground).child("Prompt snippets"))
          .child(div().text_size(10.5).text_color(t.dim).child("JSON array of {handle, text}."))
          .child(div().w(430).max_w_full().rounded(6).border_1().border_color(t.input).bg(t.background).p(4)
            .child(Textarea.new(this.snippets).h(96).w_full().font_family(settings().font_family ?? "monospace").text_size(11).text_color(t.foreground)))));
  }

  appearanceSection(t, cx) {
    const current = settings().theme;
    return v_flex().gap(10)
      .child(div().text_size(16).font_semibold().child("Appearance"))
      .child(div().text_size(11.5).text_color(t.dim).child("Themes style terminals and mods together. Bubble's palettes are Bubble themes, so they follow both light and dark appearance."))
      .child(v_flex().gap(4)
        .children(themes().map((item) => h_flex().id(`bs-theme-${item.name}`).h(36).px(10).gap(10).items_center().rounded(7).cursor_pointer()
          .bg(item.name === current ? t.selected : t.chrome).hover((s) => s.bg(t.hover))
          .on_click(() => { run("app.theme", { name: item.name }); cx.notify(); })
          .child(div().w(8).h(8).rounded(4).bg(item.colors.accent ?? t.accent))
          .child(div().flex_1().child(item.name))
          .child(div().text_size(10).text_color(t.dim).child(item.light ? "light" : "dark"))
          .when(item.name === current, (el) => el.child(div().text_size(10).text_color(t.accent).child("current"))))));
  }

  keysSection(t) {
    const rows = keys().filter((b) => b.section.startsWith("mod:") || (b.section === "global" && b.action.startsWith("mod.open:")));
    return v_flex().gap(8)
      .child(div().text_size(16).font_semibold().child("Keys"))
      .child(div().text_size(11.5).text_color(t.dim).child("Bubble commands live in keys.json under a mod:<name> section. Edit defaults/keys.json or your personal copy; Bubble reads both."))
      .child(v_flex().gap(1)
        .children(rows.map((b) => h_flex().h(27).px(8).gap(10).items_center().rounded(5).border_b(1).border_color(t.border)
          .child(div().w(120).flex_none().text_size(10.5).text_color(t.dim).child(b.section))
          .child(div().w(170).flex_none().text_size(11).text_color(t.accent).child(b.keys || "unbound"))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(b.action)))));
  }

  aboutSection(t, cx) {
    const gaps = [
      "LSP servers, inline squiggles and push diagnostics run through external commands, not a language-server client.",
      "The editor has no cursor or selection API, so go-to-line, multi-cursor and column selection cannot be ported.",
      "Streaming responses, native tool calls and microphone input are unavailable to mods.",
      "Built-in browser pages become preview fetches or the system browser; Bubble has no embedded browser.",
      "Remote file writes are rejected; remote reads, searches and Git commands work through exec.",
    ];
    return v_flex().gap(10)
      .child(div().text_size(16).font_semibold().child("Bubble feature pack"))
      .child(div().text_size(11.5).text_color(t.dim).child("Ported through Bubble mods, layouts, themes and keybindings. docs/bubble-features.md in the fork lists every Bubble feature with its port status."))
      .child(v_flex().gap(5).p(10).rounded(8).bg(t.raised)
        .child(div().text_size(12).font_semibold().child("There on purpose"))
        .children(gaps.map((gap) => h_flex().gap(7).items_start().child(div().text_size(10).text_color(t.dim).child("•")).child(div().flex_1().text_size(11).text_color(t.muted).child(gap)))))
      .child(h_flex().gap(7)
        .child(this.button("bs-app-home", "Open app home", false, () => openPath(appHome())))
        .child(this.button("bs-editor", "Open editor", false, () => run("tab.new", { name: "Editor", mod: "editor" })))
        .child(this.button("bs-palette", "Command palette", false, () => run("mod.open", { name: "command-palette" }))));
  }

  button(id, label, primary, action) {
    const t = theme();
    return h_flex().id(id).h(27).px(11).items_center().rounded(6).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(11.5).cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(label);
  }

  render(cx) {
    const t = theme();
    const nav = (section) => h_flex().id(`bs-nav-${section.id}`).h(32).px(10).gap(8).items_center().rounded(7).cursor_pointer()
      .bg(this.section === section.id ? t.selected : t.chrome).text_color(this.section === section.id ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(() => { this.section = section.id; this.note = ""; cx.notify(); })
      .child(svg(`mods/workspace-chrome/${section.icon}.svg`).size(13))
      .child(div().flex_1().truncate().child(section.label));

    let body;
    if (this.section === "appearance") body = this.appearanceSection(t, cx);
    else if (this.section === "keys") body = this.keysSection(t);
    else if (this.section === "about") body = this.aboutSection(t, cx);
    else body = this.editorSection(t, cx);

    return v_flex().id("bubble-settings").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { this.handle.focus(); cx.stop_propagation(); }
        if (e.key === "s" && (e.modifiers.control || e.modifiers.platform)) { this.save(cx); cx.stop_propagation(); }
      })
      .child(h_flex().h(40).flex_none().px(11).gap(7).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/settings.svg").size(14).text_color(t.accent))
        .child(div().font_semibold().child("Bubble Settings"))
        .child(div().flex_1())
        .child(div().text_size(10.5).text_color(t.dim).child("Ctrl+S saves · Esc leaves the field")))
      .child(h_flex().flex_1().min_h(0)
        .child(v_flex().w(168).flex_none().p(8).gap(3).border_r(1).border_color(t.border).bg(t.chrome)
          .children(SECTIONS.map(nav))
          .child(div().flex_1())
          .child(div().px(8).py(4).text_size(9.5).text_color(t.dim).child("Feature pack")))
        .child(div().flex_1().min_h(0).relative()
          .child(div().id("bs-body").absolute().inset_0().overflow_y_scroll().p(18).child(body))
          .child(Scrollbar.vertical("bs-body").absolute().inset_0())))
      .child(h_flex().h(26).flex_none().px(10).gap(8).items_center().border_t(1).border_color(t.border).text_size(10.5).text_color(t.dim)
        .child(div().flex_1().truncate().child(this.note || "Bubble feature pack · settings"))
        .when(Boolean(this.note), (el) => el.child(div().cursor_pointer().text_color(t.muted).on_click(() => { this.note = ""; cx.notify(); }).child("Dismiss"))));
  }
}
