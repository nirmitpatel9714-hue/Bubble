// Bubble feature pack: a searchable command palette for every app command, plus
// Bubble actions and theme choices. Commands that need arguments ask for them inline.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import {
  commands, themes, keys, props, closeOverlay, run, theme, window, nextCommand,
} from "bubble";

function shortcut(binding, mac) {
  if (!binding?.trim()) return "";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return binding.trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

function score(needle, text) {
  const q = needle.trim().toLowerCase();
  if (!q) return 1;
  if (typeof text !== "string" || !text) return 0;
  const lower = text.toLowerCase();
  if (lower === q) return 120;
  if (lower.startsWith(q)) return 90;
  if (lower.includes(q)) return 60;
  let at = 0, total = 0;
  for (const ch of q) {
    const found = lower.indexOf(ch, at);
    if (found < 0) return 0;
    total += found === at ? 4 : 1;
    at = found + 1;
  }
  return total + 10;
}

function friendly(name) {
  return name.replace(/[._:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default class CommandPalette extends View {
  init(_props, cx) {
    this.query = "";
    this.index = 0;
    this.argsOpen = false;
    this.selected = null;
    this.note = "";
    this.argInputs = {};
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Type a command, file action, or theme…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.index = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.choose(this.results()[this.index], cx));
    this.input.on("focus", (_e, cx) => { this.focused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.focused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(160, () => this.input.focus());

    this.app = commands().map((c) => ({
      id: `app:${c.name}`,
      group: "App",
      name: c.name,
      title: friendly(c.name),
      about: c.about,
      args: c.args ?? [],
      perform: (values) => run(c.name, values),
    }));
    const themeActions = themes().map((t) => ({
      id: `theme:${t.name}`,
      group: "Theme",
      name: t.name,
      title: `Use theme: ${t.name}`,
      about: `${t.light ? "Light" : "Dark"} theme`,
      args: [],
      perform: () => run("app.theme", { name: t.name }),
    }));
    const open = (mod, name) => () => run("tab.new", { name, mod });
    const panel = (id, name) => () => {
      run("layout.select", { stack: "panel-body", child: id });
      run("layout.show", { id: "panel" });
    };
    this.bubble = [
      { id: "bubble:editor", group: "Bubble", title: "Bubble: New editor", about: "Open the multi-file editor", keys: "", args: [], perform: open("editor", "Editor") },
      { id: "bubble:ai", group: "Bubble", title: "Bubble: New AI chat", about: "BYOK assistant with approval-gated actions", keys: "", args: [], perform: open("ai", "Bubble AI") },
      { id: "bubble:git", group: "Bubble", title: "Bubble: New Git panel", about: "Stage, commit, branch and inspect history", keys: "", args: [], perform: open("git", "Git") },
      { id: "bubble:git-history", group: "Bubble", title: "Bubble: Git history", about: "Open the commit list and selected commit diff", keys: "", args: [], perform: () => run("tab.new", { name: "Git History", mod: "git", props: { view: "history" } }) },
      { id: "bubble:preview", group: "Bubble", title: "Bubble: New preview", about: "Markdown, source, images and local URLs", keys: "", args: [], perform: open("preview", "Preview") },
      { id: "bubble:diagnostics", group: "Bubble", title: "Bubble: New Problems panel", about: "Run the project checker and list errors", keys: "", args: [], perform: open("diagnostics", "Problems") },
      { id: "bubble:settings", group: "Bubble", title: "Bubble: Settings", about: "Editor, AI, Git, preview, diagnostics and themes", keys: "", args: [], perform: open("bubble-settings", "Bubble Settings") },
      { id: "bubble:files-panel", group: "Bubble", title: "Bubble: Show Files panel", about: "Reveal the explorer in the side panel", keys: "", args: [], perform: panel("files", "Files") },
      { id: "bubble:git-panel", group: "Bubble", title: "Bubble: Show Git panel", about: "Reveal source control in the side panel", keys: "", args: [], perform: panel("git", "Git") },
      { id: "bubble:diagnostics-panel", group: "Bubble", title: "Bubble: Show Problems panel", about: "Reveal diagnostics in the side panel", keys: "", args: [], perform: panel("diagnostics", "Problems") },
      { id: "bubble:preview-panel", group: "Bubble", title: "Bubble: Show Preview panel", about: "Reveal previews in the side panel", keys: "", args: [], perform: panel("preview", "Preview") },
      { id: "bubble:ai-panel", group: "Bubble", title: "Bubble: Show AI panel", about: "Reveal Bubble AI in the side panel", keys: "", args: [], perform: panel("ai", "Bubble AI") },
    ];
    this.all = [...this.bubble, ...themeActions, ...this.app];
    this.themeCount = themeActions.length;
    for (const item of this.all) item.requires = item.args.some((a) => a.required);

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") this.input.focus();
        else if (command === "settings") run("tab.new", { name: "Bubble Settings", mod: "bubble-settings" });
        cx.notify();
      }
    });
  }

  results() {
    const q = this.query.trim();
    if (!q) return [];
    const nameOf = (a) => a.name ?? a.title ?? a.id ?? "";
    return this.all
      .map((a) => ({ a, score: Math.max(score(q, nameOf(a)), score(q, a.title ?? "") * 0.95, score(q, a.about ?? "") * 0.55) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || (x.a.group ?? "").localeCompare(y.a.group ?? "") || nameOf(x.a).localeCompare(nameOf(y.a)))
      .slice(0, 60)
      .map((x) => x.a);
  }

  choose(item, cx) {
    if (!item) return;
    if (!item.requires) { this.perform(item, {}, cx); return; }
    this.selected = item;
    this.argsOpen = true;
    this.argInputs = {};
    for (const arg of item.args) {
      if (!arg.required) continue;
      const input = InputState.new({ placeholder: arg.name });
      input.on("submit", (_e, cx) => this.runArgs(cx));
      this.argInputs[arg.name] = input;
    }
    cx.timer.after(80, () => Object.values(this.argInputs)[0]?.focus());
    cx.notify();
  }

  runArgs(cx) {
    if (!this.selected) return;
    const values = {};
    for (const [name, input] of Object.entries(this.argInputs)) {
      const value = input.value().trim();
      if (!value) { this.note = `${name} is required`; cx.notify(); return; }
      values[name] = value;
    }
    this.perform(this.selected, values, cx);
  }

  perform(item, values, cx) {
    const p = props();
    if (p?.overlay) closeOverlay(p.overlay);
    try { item.perform(values); } catch (e) { this.note = String(e); cx.notify(); }
  }

  close() {
    const p = props();
    if (p?.overlay) closeOverlay(p.overlay);
  }

  render(cx) {
    const t = theme();
    const results = this.results();
    if (this.index >= results.length) this.index = Math.max(0, results.length - 1);
    const groupColor = (group) => group === "Bubble" ? t.accent : group === "Theme" ? t.ansi4 : t.muted;
    // One bridge call for every row's shortcut, not one per row.
    const mac = window()?.platform === "macos";
    const bindings = new Map();
    for (const binding of keys()) {
      if (binding.section === "global" && binding.action && !bindings.has(binding.action)) bindings.set(binding.action, binding.keys);
    }
    const keyLabel = (name) => shortcut(bindings.get(name), mac);

    const row = (item, i) => h_flex().id(`palette-${item.id}`).h(38).flex_none().px(10).gap(9).items_center().rounded(7).cursor_pointer()
      .when(i === this.index, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.index = i; cx.notify(); })
      .on_click((_e, cx) => this.choose(item, cx))
      .child(div().w(6).h(6).flex_none().rounded(3).bg(groupColor(item.group)))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(7).items_center()
          .child(div().text_size(12.5).text_color(t.foreground).child(item.title ?? item.name))
          .child(div().px(4).py(0.5).rounded(3).bg(t.raised).text_size(9).text_color(t.dim).child(item.group)))
        .child(div().text_size(10.5).text_color(t.dim).truncate().child(item.about ?? item.name)))
      .when(item.requires, (el) => el.child(div().text_size(9.5).text_color(t.dim).child("args…")))
      .child(div().max_w(150).flex_none().truncate().text_size(10.5).text_color(t.muted).child(item.keys || keyLabel(item.name)));

    return v_flex().id("bubble-command-palette").track_focus(this.handle).w_full().min_h(0).max_h_full().rounded(10)
      .bg(t.popover).border_1().border_color(t.border).text_color(t.foreground).text_size(13).overflow_hidden()
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          if (this.argsOpen) { this.argsOpen = false; this.selected = null; this.input.focus(); cx.stop_propagation(); cx.notify(); return; }
          cx.stop_propagation();
          this.close();
          return;
        }
        if (this.argsOpen) return;
        if (results.length === 0) return;
        if (e.key === "down" || (e.modifiers.control && e.key === "n")) { this.index = Math.min(results.length - 1, this.index + 1); cx.stop_propagation(); cx.notify(); }
        else if (e.key === "up" || (e.modifiers.control && e.key === "p")) { this.index = Math.max(0, this.index - 1); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.accent))
        .child(h_flex().flex_1().min_w(0).h(32).px(9).rounded(7).border_1().border_color(this.focused ? t.accent : t.border).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_size(12.5).text_color(t.foreground)))
        .child(div().text_size(10.5).text_color(t.dim).child("Esc")))
      .when(this.argsOpen && this.selected, (el) => el.child(v_flex().flex_none().px(10).py(8).gap(6).border_b(1).border_color(t.border).bg(t.surface)
        .child(h_flex().gap(7).items_center()
          .child(div().flex_1().text_size(12).font_semibold().child(this.selected.title ?? this.selected.name))
          .child(div().text_size(10.5).text_color(t.dim).child("required arguments")))
        .children(this.selected.args.filter((a) => a.required).map((arg) => h_flex().h(30).gap(7).items_center()
          .child(div().w(90).flex_none().truncate().text_size(11).text_color(t.muted).child(arg.name))
          .child(h_flex().flex_1().h_full().px(8).rounded(6).border_1().border_color(t.border).bg(t.background)
            .child(Input.new(this.argInputs[arg.name]).flex_1().h_full().text_size(11.5).text_color(t.foreground)))))
        .child(h_flex().gap(6).justify_end().pt(2)
          .child(this.button("palette-cancel-args", "Cancel", false, (_e, cx) => { this.argsOpen = false; this.selected = null; this.input.focus(); cx.notify(); }))
          .child(this.button("palette-run-args", "Run", true, (_e, cx) => this.runArgs(cx))))))
      .when(Boolean(this.note), (el) => el.child(div().flex_none().px(10).py(5).text_size(11).text_color(t.blocked).child(this.note)))
      .child(div().h(results.length === 0 ? 90 : Math.min(420, results.length * 39 + 10)).min_h(0).relative()
        .child(div().id("palette-list").absolute().inset_0().overflow_y_scroll().p(5).gap(1)
          .when(results.length === 0, (el) => el.child(div().p(14).text_size(12).text_color(t.dim).child(this.query.trim() ? "No matching commands" : "Type to search commands and themes")))
          .children(results.map(row)))
        .child(Scrollbar.vertical("palette-list").absolute().inset_0()))
      .child(h_flex().h(25).flex_none().px(10).gap(8).items_center().border_t(1).border_color(t.border).text_size(10).text_color(t.dim)
        .child(div().flex_1().truncate().child(`${this.all.length} commands · ${this.themeCount} themes`))
        .child(div().child("↑↓ move · Enter run")))
  }

  button(id, label, primary, action) {
    const t = theme();
    return h_flex().id(id).h(27).px(11).items_center().rounded(6).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(11.5).cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
}
