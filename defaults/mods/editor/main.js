// Bubble feature pack: a multi-file code editor with syntax highlighting,
// autosave, format-on-save, find/replace-all, quick open and Markdown preview.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input, TextView } from "gpui-base";
import {
  spaces, panes, focused, readTextFile, writeTextFile, exec, theme, settings,
  shared, setShared, run, notify, nextCommand, window, props,
} from "bubble";

const DEFAULTS = {
  autosave: false,
  autosaveDelay: 1200,
  formatOnSave: false,
  formatter: "auto",
  customFormatter: "",
  wordWrap: false,
  quickOpenLimit: 5000,
};

const LANG = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js", mts: "ts", cts: "ts",
  rs: "rust", py: "python", rb: "ruby", go: "go", c: "c", h: "c", cpp: "cpp", cc: "cpp",
  cxx: "cpp", hpp: "cpp", cs: "csharp", java: "java", kt: "kotlin", kts: "kotlin",
  php: "php", swift: "swift", sh: "bash", bash: "bash", zsh: "bash", fish: "fish",
  ps1: "powershell", psm1: "powershell", html: "html", htm: "html", css: "css",
  scss: "scss", sass: "sass", less: "less", json: "json", jsonc: "json", toml: "toml",
  yaml: "yaml", yml: "yaml", md: "markdown", mdx: "markdown", xml: "xml", svg: "xml",
  sql: "sql", lua: "lua", zig: "zig", dart: "dart", vue: "html", svelte: "html",
  txt: "text", log: "text", ini: "ini", conf: "ini", env: "ini",
};

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;

function cfg() {
  const all = shared("bubble.settings");
  return { ...DEFAULTS, ...(all && typeof all === "object" ? all.editor ?? {} : {}) };
}

function loc() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on: on ?? null };
}

const isAbs = (p) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(p ?? "");
const base = (p) => (p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const dir = (p) => { const s = (p ?? "").replace(/[\\/]+$/, ""), i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")); return i > 0 ? s.slice(0, i) : s; };
const join = (root, path) => isAbs(path) ? path : `${(root ?? "").replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`;
const ext = (p) => { const name = base(p); const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1).toLowerCase() : "txt"; };

function syntax(t) {
  return {
    keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4,
    type: t.ansi3, number: t.ansi1, constant: t.ansi6, variable: t.foreground,
    operator: t.ansi6, punctuation: t.muted, boolean: t.ansi3,
    "string.escape": t.ansi3,
  };
}

function shellQuote(text, platform) {
  if (platform === "windows") return `'${String(text).replace(/'/g, "''")}'`;
  return `'${String(text).replace(/'/g, "'\\''")}'`;
}

async function openExternal(url) {
  const platform = window()?.platform;
  try {
    if (platform === "macos") await exec("open", [url]);
    else if (platform === "windows") await exec("powershell", ["-NoProfile", "-Command", `Start-Process ${shellQuote(url, "windows")}`]);
    else await exec("xdg-open", [url]);
  } catch {}
}

export default class BubbleEditor extends View {
  init(_props, cx) {
    // Top-level mod views get undefined for init props; props() holds the
    // layout's props for this copy.
    const opened = props() ?? {};
    this.entries = [];
    this.active = null;
    this.note = "";
    this.findOpen = false;
    this.replaceOpen = false;
    this.quickOpen = false;
    this.quickFiles = null;
    this.quickLoading = false;
    this.newOpen = false;
    this.savingAll = false;
    this.cwd = opened.cwd ?? loc().cwd;
    this.on = opened.on ?? loc().on;
    this.handle = cx.focus_handle();

    this.findInput = InputState.new({ placeholder: "Find in file" });
    this.findInput.on("change", (_e, cx) => { this.query = this.findInput.value(); cx.notify(); });
    this.findInput.on("submit", (_e, cx) => { this.nextMatch(cx); });
    this.replaceInput = InputState.new({ placeholder: "Replace with…" });
    this.newInput = InputState.new({ placeholder: "Path for the new file, e.g. src/new.ts" });
    this.newInput.on("submit", (_e, cx) => this.createFile(cx));
    this.quickInput = InputState.new({ placeholder: "Search files by name…" });
    this.quickInput.on("change", (_e, cx) => { this.quickQuery = this.quickInput.value(); cx.notify(); });
    this.quickInput.on("submit", (_e, cx) => this.pickQuick(cx));

    cx.timer.every(1500, (cx) => this.autosave(cx));

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        try {
          if (command === "save") await this.save(this.current(), cx);
          else if (command === "saveAll") await this.saveAll(cx);
          else if (command === "close") this.closeActive(cx);
          else if (command === "quickOpen") this.showQuick(cx);
          else if (command === "find") this.showFind(false, cx);
          else if (command === "replace") this.showFind(true, cx);
          else if (command === "wrap") this.toggleWrap(cx);
          else if (command === "preview") this.togglePreview(cx);
          else if (command === "refresh") this.reload(this.current(), cx);
          else if (command === "focus") this.handle.focus();
        } catch (e) { this.note = String(e); }
        cx.notify();
      }
    });

    const paths = opened.paths ?? (opened.path ? [opened.path] : []);
    if (paths.length) cx.spawn(async (cx) => {
      for (const path of paths) await this.open(path, { cwd: this.cwd, on: this.on }, cx);
      cx.notify();
    });
    else this.handle.focus();
  }

  current() {
    return this.entries.find((e) => e.id === this.active) ?? null;
  }

  // Event contexts are only valid for the call that produced them, so work
  // that awaits has to run inside cx.spawn and keep that AsyncContext.
  defer(cx, work) {
    cx.spawn(async (cx) => {
      try { await work(cx); }
      catch (e) { this.note = String(e); cx.notify(); }
    });
  }

  entry(path, on) {
    return this.entries.find((e) => e.path === path && (e.on ?? null) === (on ?? null)) ?? null;
  }

  async open(path, options, cx) {
    if (!path) return;
    const cwd = options?.cwd ?? this.cwd ?? loc().cwd;
    const on = options?.on ?? this.on ?? loc().on;
    if (!isAbs(path) && !cwd) { this.note = "No folder to open a relative path from"; return; }
    const full = isAbs(path) ? path : join(cwd, path);
    const existing = this.entry(full, on);
    if (existing) { this.activate(existing, cx); return; }
    if (IMAGE.test(full)) { run("tab.new", { name: base(full), mod: "preview", props: { path: full, cwd, on } }); this.note = "Images open in the preview"; return; }

    this.note = "";
    const entry = {
      id: `${on ?? "local"}:${full}`, path: full, cwd, on, name: base(full),
      value: "", saved: "", dirty: false, loading: true, note: "", conflict: false,
      state: null, closeArmed: false, lastEdit: 0, preview: false, saving: false,
    };
    this.entries.push(entry);
    this.active = entry.id;
    cx.notify();
    try {
      const text = await readTextFile(full, { on });
      if (text === null) { entry.loading = false; entry.note = "File not found"; cx.notify(); return; }
      if (text.includes("\0")) { entry.loading = false; entry.note = "Binary file: open it with its own program"; cx.notify(); return; }
      entry.value = text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
      entry.saved = entry.value;
      entry.truncated = text.length > 2_000_000;
      entry.state = this.makeState(entry, cx);
      entry.loading = false;
      this.handle.focus();
    } catch (e) {
      entry.loading = false;
      entry.note = `Cannot open: ${e}`;
    }
    cx.notify();
  }

  makeState(entry, cx) {
    const style = cfg();
    const state = EditorState.new({
      language: LANG[ext(entry.path)] ?? ext(entry.path),
      value: entry.value,
      font_family: settings().font_family,
      font_size: settings().font_size,
      soft_wrap: Boolean(style.wordWrap),
      syntax: syntax(theme()),
    });
    state.on("change", (_e, cx) => {
      entry.value = state.value();
      entry.dirty = entry.value !== entry.saved;
      entry.lastEdit = Date.now();
      entry.closeArmed = false;
      cx.notify();
    });
    return state;
  }

  activate(entry, cx) {
    this.active = entry.id;
    this.note = "";
    entry.closeArmed = false;
    this.handle.focus();
    cx.notify();
  }

  close(id) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    this.entries.splice(i, 1);
    if (this.active === id) this.active = this.entries[Math.max(0, i - 1)]?.id ?? null;
  }

  closeActive(cx) {
    const entry = this.current();
    if (!entry) return;
    if (entry.dirty && !entry.closeArmed) {
      entry.closeArmed = true;
      this.note = "Unsaved changes. Press close again to discard.";
    } else {
      entry.state?.release();
      this.close(entry.id);
      this.note = "";
    }
    cx.notify();
  }

  async save(entry, cx) {
    if (!entry || entry.saving || (!entry.dirty && !entry.conflict)) return;
    if (entry.on) { entry.note = "Saving on another machine is not supported by the mod API"; cx.notify(); return; }
    entry.saving = true;
    entry.note = "";
    try {
      const text = entry.state ? entry.state.value() : entry.value;
      await writeTextFile(entry.path, text, entry.saved);
      entry.value = text;
      entry.saved = text;
      entry.dirty = false;
      entry.conflict = false;
      entry.closeArmed = false;
      if (cfg().formatOnSave) await this.format(entry, cx);
    } catch (e) {
      entry.conflict = true;
      entry.note = `Not saved: the file changed on disk. Reload it or keep your version.`;
    } finally {
      entry.saving = false;
      cx.notify();
    }
  }

  async saveAll(cx) {
    if (this.savingAll) return;
    this.savingAll = true;
    try { for (const entry of this.entries) if (entry.dirty) await this.save(entry, cx); }
    finally { this.savingAll = false; cx.notify(); }
  }

  async reload(entry, cx) {
    if (!entry) return;
    try {
      const text = await readTextFile(entry.path, { on: entry.on });
      if (text === null) throw new Error("File not found");
      if (text.includes("\0")) throw new Error("Binary file");
      entry.value = text;
      entry.saved = text;
      entry.dirty = false;
      entry.conflict = false;
      entry.note = "";
      entry.state?.set_value(text);
    } catch (e) { entry.note = `Reload failed: ${e}`; }
    cx.notify();
  }

  async overwrite(entry, cx) {
    if (!entry || entry.on) return;
    try {
      const disk = await readTextFile(entry.path);
      if (disk === null) throw new Error("File not found");
      const text = entry.state ? entry.state.value() : entry.value;
      await writeTextFile(entry.path, text, disk);
      entry.value = text;
      entry.saved = text;
      entry.dirty = false;
      entry.conflict = false;
      entry.note = "";
    } catch (e) { entry.note = `Overwrite failed: ${e}`; }
    cx.notify();
  }

  formatterFor(path) {
    const style = cfg();
    if (style.formatter && style.formatter !== "auto") return style.formatter;
    const e = ext(path);
    if (["ts", "tsx", "js", "jsx", "json", "jsonc", "css", "scss", "less", "html", "md", "mdx", "yaml", "yml"].includes(e)) return "prettier";
    if (["rs"].includes(e)) return "rustfmt";
    if (["py"].includes(e)) return "ruff";
    if (["go"].includes(e)) return "gofmt";
    if (["c", "h", "cpp", "cc", "cxx", "hpp"].includes(e)) return "clang-format";
    if (["sh", "bash", "zsh"].includes(e)) return "shfmt";
    if (["zig"].includes(e)) return "zigfmt";
    return "";
  }

  async format(entry, cx) {
    if (entry.on) return;
    const style = cfg(), formatter = this.formatterFor(entry.path);
    if (!formatter) return;
    const cwd = dir(entry.path);
    let command = formatter, args = [];
    if (formatter === "prettier") args = ["--write", entry.path];
    else if (formatter === "biome") { command = "biome"; args = ["format", "--write", entry.path]; }
    else if (formatter === "ruff") { command = "ruff"; args = ["format", entry.path]; }
    else if (formatter === "rustfmt") { command = "rustfmt"; args = [entry.path]; }
    else if (formatter === "gofmt") { command = "gofmt"; args = ["-w", entry.path]; }
    else if (formatter === "clang-format") { command = "clang-format"; args = ["-i", entry.path]; }
    else if (formatter === "shfmt") { command = "shfmt"; args = ["-w", entry.path]; }
    else if (formatter === "zigfmt") { command = "zig"; args = ["fmt", entry.path]; }
    else if (formatter === "custom") {
      if (!style.customFormatter.trim()) return;
      const line = style.customFormatter.replaceAll("{file}", shellQuote(entry.path, window()?.platform));
      const r = window()?.platform === "windows"
        ? await exec("powershell", ["-NoProfile", "-Command", line], { cwd })
        : await exec("sh", ["-c", line], { cwd });
      if (r.code !== 0) entry.note = `Formatter: ${(r.stderr || r.stdout).trim()}`;
      else await this.afterFormat(entry, cx);
      return;
    } else return;
    try {
      const r = await exec(command, args, { cwd });
      if (r.code !== 0) entry.note = `${formatter}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`;
      else await this.afterFormat(entry, cx);
    } catch (e) { entry.note = `${formatter} is not installed or could not run`; }
  }

  async afterFormat(entry, cx) {
    try {
      const text = await readTextFile(entry.path);
      if (text === null || text.includes("\0")) return;
      entry.value = text;
      entry.saved = text;
      entry.dirty = false;
      entry.state?.set_value(text);
    } catch {}
    cx.notify();
  }

  autosave(cx) {
    const style = cfg();
    if (!style.autosave) return;
    const now = Date.now(), delay = Math.max(300, Number(style.autosaveDelay) || 1200);
    for (const entry of this.entries) {
      if (entry.dirty && !entry.saving && entry.state && now - entry.lastEdit >= delay) this.save(entry, cx);
    }
  }

  async createFile(cx) {
    const name = this.newInput.value().trim();
    if (!name) return;
    const cwd = this.cwd ?? loc().cwd;
    if (!cwd) { this.note = "No folder to create the file in"; cx.notify(); return; }
    const full = join(cwd, name);
    try {
      await writeTextFile(full, "", null);
      this.newOpen = false;
      this.newInput.set_value("");
      await this.open(full, { cwd, on: this.on }, cx);
    } catch (e) { this.note = `Could not create the file: ${e}`; }
    cx.notify();
  }

  showFind(replace, cx) {
    this.findOpen = true;
    this.replaceOpen = Boolean(replace);
    this.quickOpen = false;
    this.findInput.focus();
    if (replace) this.replaceInput.focus();
    cx.notify();
  }

  hideFind(cx) {
    this.findOpen = false;
    this.replaceOpen = false;
    this.handle.focus();
    cx.notify();
  }

  matches() {
    const entry = this.current(), q = (this.query ?? "").trim();
    if (!entry || !q) return [];
    const out = [], lines = (entry.state?.value() ?? entry.value).split("\n");
    for (let i = 0; i < lines.length && out.length < 300; i++) {
      let at = 0, line = lines[i];
      while (out.length < 300) {
        const found = line.toLowerCase().indexOf(q.toLowerCase(), at);
        if (found < 0) break;
        out.push({ line: i + 1, text: line, start: found });
        at = found + Math.max(1, q.length);
      }
    }
    return out;
  }

  nextMatch(cx) {
    const n = this.matches().length;
    this.matchNote = n ? `${n}${n === 300 ? "+" : ""} matches` : "No matches";
    cx.notify();
  }

  replaceAll(cx) {
    const entry = this.current(), q = this.query ?? "";
    if (!entry || !q) return;
    const before = entry.state?.value() ?? entry.value;
    const text = before.split(q).join(this.replaceInput.value());
    entry.state?.set_value(text);
    entry.value = text;
    entry.dirty = text !== entry.saved;
    entry.lastEdit = Date.now();
    this.matchNote = text === before ? "No matches" : "Replaced every match";
    cx.notify();
  }

  toggleWrap(cx) {
    const entry = this.current();
    const all = shared("bubble.settings");
    const style = cfg();
    const next = !style.wordWrap;
    setShared("bubble.settings", { ...(all && typeof all === "object" ? all : {}), editor: { ...((all?.editor) ?? {}), wordWrap: next } });
    if (entry) {
      entry.value = entry.state?.value() ?? entry.value;
      entry.state?.release();
      entry.state = this.makeState(entry, cx);
    }
    cx.notify();
  }

  togglePreview(cx) {
    const entry = this.current();
    if (!entry || !MARKDOWN.test(entry.path)) { this.note = "Preview is for Markdown files"; cx.notify(); return; }
    entry.preview = !entry.preview;
    cx.notify();
  }

  showQuick(cx) {
    this.quickOpen = true;
    this.findOpen = false;
    this.newOpen = false;
    this.quickInput.focus();
    if (this.quickFiles === null && !this.quickLoading) this.loadQuickFiles(cx);
    cx.notify();
  }

  loadQuickFiles(cx) {
    const cwd = this.cwd ?? loc().cwd, on = this.on ?? loc().on;
    if (!cwd) { this.quickFiles = []; return; }
    this.quickLoading = true;
    cx.spawn(async (cx) => {
      try {
        let files = [];
        const git = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "ls-files", "--cached", "--others", "--exclude-standard"], { cwd, on }).catch(() => null);
        if (git?.code === 0) files = git.stdout.split("\n").filter(Boolean);
        else {
          const platform = window()?.platform;
          const r = platform === "windows"
            ? await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-ChildItem -LiteralPath '" + cwd.replace(/'/g, "''") + "' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 5000 -ExpandProperty FullName"], { on })
            : await exec("sh", ["-c", 'find "$1" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -5000', "files", cwd], { on });
          if (r.code === 0) files = r.stdout.split("\n").filter(Boolean).map((p) => isAbs(p) ? p.slice(cwd.replace(/[\\/]+$/, "").length + 1) : p);
        }
        this.quickFiles = files.slice(0, Number(cfg().quickOpenLimit) || 5000).sort();
      } catch { this.quickFiles = []; }
      finally { this.quickLoading = false; cx.notify(); }
    });
  }

  quickResults() {
    const q = (this.quickQuery ?? "").toLowerCase().trim();
    const files = this.quickFiles ?? [];
    if (!q) return files.slice(0, 80);
    const scored = [];
    for (const path of files) {
      const lower = path.toLowerCase(), name = lower.split("/").pop();
      let score = 0, at = 0, ok = true;
      for (const ch of q) { const found = lower.indexOf(ch, at); if (found < 0) { ok = false; break; } score += found === 0 ? 6 : found - at > 2 ? 1 : 3; at = found + 1; }
      if (!ok) continue;
      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 50;
      else if (lower.includes(q)) score += 20;
      scored.push({ path, score });
    }
    scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    return scored.slice(0, 80).map((s) => s.path);
  }

  pickQuick(cx) {
    const path = this.quickResults()[0];
    if (!path) return;
    this.quickOpen = false;
    this.defer(cx, (cx) => this.open(path, { cwd: this.cwd ?? loc().cwd, on: this.on ?? loc().on }, cx));
  }

  openLink(url, cx) {
    if (/^https?:\/\//i.test(url)) { openExternal(url); return; }
    if (url.startsWith("#")) return;
    const entry = this.current();
    if (!entry) return;
    const clean = decodeURIComponent(url.split("#")[0].split("?")[0]);
    this.defer(cx, (cx) => this.open(clean, { cwd: dir(entry.path), on: entry.on }, cx));
  }

  pathOf(entry) {
    return entry.path;
  }

  render(cx) {
    const t = theme();
    const style = cfg();
    const entry = this.current();
    const entries = this.entries;
    const dirty = entries.filter((e) => e.dirty).length;

    const icon = (name) => svg(`mods/workspace-chrome/${name}.svg`).size(13).flex_none();
    const button = (id, label, action, tone = "muted") => h_flex().id(id).h(24).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(11.5).text_color(t[tone] ?? t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
    const tool = (id, iconName, title, action, tone = "muted") => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t[tone] ?? t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(title)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(icon(iconName));

    const tab = (e) => h_flex().id(`ed-tab-${e.id}`).h(28).max_w(190).flex_none().px(9).gap(6).items_center().rounded(7)
      .border_1().border_color(e.id === this.active ? t.border : t.chrome).bg(e.id === this.active ? t.raised : t.chrome)
      .text_color(e.id === this.active ? t.foreground : t.muted).text_size(12).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.activate(e, cx); })
      .child(div().max_w(150).truncate().child(e.name))
      .when(e.dirty, (el) => el.child(div().size(5).rounded(3).bg(t.accent)))
      .child(div().size(16).rounded(4).flex().items_center().justify_center().text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (e.dirty && !e.closeArmed) { e.closeArmed = true; this.note = `${e.name} has unsaved changes. Press its × again to discard.`; cx.notify(); } else { e.state?.release(); this.close(e.id); cx.notify(); } })
        .child("×"));

    let body;
    if (!entry) {
      const recent = this.quickFiles ?? [];
      body = v_flex().flex_1().min_h(0).items_center().justify_center().gap(10).p(24)
        .child(svg("mods/workspace-chrome/square-pen.svg").size(34).text_color(t.dim))
        .child(div().text_size(16).font_semibold().child("Bubble Editor"))
        .child(div().text_size(12).text_color(t.muted).max_w(360).text_center().child("Open a file, create one, or use the command palette. Ctrl+P searches the project; Ctrl+S saves."))
        .child(h_flex().gap(8).mt(6)
          .child(button("ed-quick", "Open file…", (_e, cx) => this.showQuick(cx), "accent"))
          .child(button("ed-new", "New file…", (_e, cx) => { this.newOpen = true; this.newInput.focus(); cx.notify(); })))
        .when(this.quickOpen, (el) => el.child(v_flex().w(520).max_w_full().max_h(280).min_h(0).rounded(9).border_1().border_color(t.border).bg(t.surface).p(7).gap(6)
          .child(h_flex().h(32).flex_none().px(9).gap(8).items_center().rounded(7).border_1().border_color(t.accent).bg(t.background)
            .child(icon("search")).child(Input.new(this.quickInput).flex_1().h_full().text_size(12.5).text_color(t.foreground)).child(div().text_size(11).text_color(t.dim).child("Esc")))
          .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(1)
            .when(this.quickLoading, (list) => list.child(div().p(8).text_color(t.dim).child("Indexing project files…")))
            .when(!this.quickLoading && (this.quickFiles?.length ?? 0) === 0, (list) => list.child(div().p(8).text_color(t.dim).child("No project files found")))
            .children(this.quickResults().map((path) => h_flex().h(26).px(8).gap(8).items_center().rounded(6).text_size(12).cursor_pointer().hover((s) => s.bg(t.selected))
              .on_click((_e, cx) => { this.quickOpen = false; this.defer(cx, (cx) => this.open(path, { cwd: this.cwd ?? loc().cwd, on: this.on ?? loc().on }, cx)); })
              .child(icon("file-text")).child(div().flex_1().min_w(0).truncate().child(path)))))))
        .when(!this.quickOpen && recent.length > 0, (el) => el.child(v_flex().mt(8).w(420).max_w_full().rounded(9).border_1().border_color(t.border).overflow_hidden()
          .children(recent.slice(0, 6).map((path) => h_flex().h(27).px(10).gap(8).items_center().text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => this.defer(cx, (cx) => this.open(path, { cwd: this.cwd ?? loc().cwd, on: this.on ?? loc().on }, cx))).child(icon("file-text")).child(div().flex_1().truncate().child(path))))));
    } else {
      const matches = this.findOpen ? this.matches() : [];
      const preview = entry.preview && MARKDOWN.test(entry.path);
      body = v_flex().flex_1().min_h(0)
        .child(h_flex().h(30).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
          .child(icon("file-text")).child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(entry.path))
          .when(entry.dirty, (el) => el.child(div().text_size(10).text_color(t.accent).child("modified")))
          .when(entry.conflict, (el) => el.child(button("ed-reload", "Reload", (e, cx) => this.defer(cx, (cx) => this.reload(entry, cx)), "blocked")).child(button("ed-overwrite", "Keep mine", (e, cx) => this.defer(cx, (cx) => this.overwrite(entry, cx)), "blocked")))
          .when(MARKDOWN.test(entry.path), (el) => el.child(tool("ed-preview", preview ? "file-text" : "monitor", preview ? "Show source" : "Preview Markdown", (_e, cx) => this.togglePreview(cx), preview ? "accent" : "muted")))
          .child(tool("ed-wrap", "panel-right", style.wordWrap ? "Word wrap on" : "Word wrap off", (_e, cx) => this.toggleWrap(cx), style.wordWrap ? "accent" : "muted"))
          .child(tool("ed-find", "search", "Find (Ctrl+F)", (_e, cx) => this.showFind(false, cx)))
          .child(tool("ed-save", "check", entry.saving ? "Saving…" : "Save (Ctrl+S)", (e, cx) => this.defer(cx, (cx) => this.save(entry, cx)), entry.dirty ? "accent" : "muted"))
          .child(tool("ed-quick", "search", "Quick open (Ctrl+P)", (_e, cx) => this.showQuick(cx))))

        .when(this.findOpen, (el) => el.child(v_flex().flex_none().px(10).py(8).gap(6).border_b(1).border_color(t.border).bg(t.surface)
          .child(h_flex().h(30).gap(8).items_center()
            .child(h_flex().flex_1().h_full().px(9).gap(6).items_center().rounded(7).border_1().border_color(t.accent).bg(t.background)
              .child(Input.new(this.findInput).flex_1().h_full().text_size(12).text_color(t.foreground))
              .when(this.replaceOpen, (row) => row.child(div().w(1).h(16).bg(t.border)).child(Input.new(this.replaceInput).flex_1().h_full().text_size(12).text_color(t.foreground))))
            .child(button("ed-find-next", "Find", (_e, cx) => this.nextMatch(cx)))
            .when(this.replaceOpen, (row) => row.child(button("ed-replace-all", "Replace all", (_e, cx) => this.replaceAll(cx), "accent")))
            .child(button("ed-find-close", "Esc", (_e, cx) => this.hideFind(cx))))
          .when(Boolean(this.matchNote), (row) => row.child(div().text_size(11).text_color(t.dim).child(this.matchNote)))
          .when(matches.length > 0, (row) => row.child(v_flex().max_h(120).min_h(0).overflow_y_scrollbar().gap(1)
            .children(matches.slice(0, 40).map((m) => h_flex().h(20).gap(8).items_center().text_size(11).text_color(t.muted)
              .child(div().w(44).flex_none().text_right().text_color(t.dim).child(String(m.line)))
              .child(div().flex_1().min_w(0).truncate().child(m.text.trim()))))))))

        .when(this.quickOpen, (el) => el.child(v_flex().flex_1().min_h(0).bg(t.surface).p(8).gap(6)
          .child(h_flex().h(34).flex_none().px(9).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
            .child(icon("search")).child(Input.new(this.quickInput).flex_1().h_full().text_size(12.5).text_color(t.foreground)).child(div().text_size(11).text_color(t.dim).child("Esc")))
          .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(1)
            .when(this.quickLoading, (list) => list.child(div().p(8).text_color(t.dim).child("Indexing project files…")))
            .when(!this.quickLoading && (this.quickFiles?.length ?? 0) === 0, (list) => list.child(div().p(8).text_color(t.dim).child("No project files found")))
            .children(this.quickResults().map((path) => h_flex().h(27).px(9).gap(8).items_center().rounded(6).text_size(12).cursor_pointer().hover((s) => s.bg(t.selected))
              .on_click((_e, cx) => { this.quickOpen = false; this.defer(cx, (cx) => this.open(path, { cwd: this.cwd ?? loc().cwd, on: this.on ?? loc().on }, cx)); })
              .child(icon("file-text")).child(div().flex_1().min_w(0).truncate().child(path)).child(div().text_size(10).text_color(t.dim).child(ext(path))))))))

        .when(this.newOpen, (el) => el.child(h_flex().flex_none().px(10).py(8).gap(8).items_center().border_b(1).border_color(t.border).bg(t.surface)
          .child(div().text_size(11).text_color(t.dim).child("New file"))
          .child(h_flex().flex_1().h(30).px(9).rounded(7).border_1().border_color(t.accent).bg(t.background).child(Input.new(this.newInput).flex_1().h_full().text_size(12).text_color(t.foreground)))
          .child(button("ed-create", "Create", (e, cx) => this.defer(cx, (cx) => this.createFile(cx)), "accent"))
          .child(button("ed-cancel", "Cancel", (_e, cx) => { this.newOpen = false; this.handle.focus(); cx.notify(); }))))

        .when(Boolean(entry.note), (el) => el.child(h_flex().flex_none().px(10).py(5).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border)
          .child(div().flex_1().text_size(11).text_color(t.blocked).child(entry.note))
          .when(entry.conflict, (row) => row.child(button("ed-note-reload", "Reload", (e, cx) => this.defer(cx, (cx) => this.reload(entry, cx)))).child(button("ed-note-overwrite", "Keep mine", (e, cx) => this.defer(cx, (cx) => this.overwrite(entry, cx)), "accent")))
          .child(button("ed-note-close", "Dismiss", (_e, cx) => { entry.note = ""; cx.notify(); }))))

        .child(div().flex_1().min_h(0).relative()
          .when(entry.loading, (area) => area.child(div().p(16).text_color(t.dim).child("Opening…")))
          .when(!entry.loading && entry.state && !preview && !this.quickOpen, (area) => area.child(Editor.new(entry.state).size_full()))
          .when(!entry.loading && preview, (area) => area.child(TextView.markdown(`ed-preview-${entry.id}`, entry.state?.value() ?? entry.value)
            .on_link_click((url, cx) => this.openLink(url, cx)).size_full().p(18).overflow_y_scrollbar().text_size(13.5))));
    }

    return v_flex().id("bubble-editor").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          if (this.quickOpen) { this.quickOpen = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
          if (this.findOpen) { this.hideFind(cx); cx.stop_propagation(); return; }
          if (this.newOpen) { this.newOpen = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
        }
        if (e.key === "enter" && e.modifiers.control && this.newOpen) { this.defer(cx, (cx) => this.createFile(cx)); cx.stop_propagation(); }
      })
      .child(h_flex().h(38).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/square-pen.svg").size(14).text_color(t.accent))
        .child(div().font_semibold().mr(4).child("Editor"))
        .when(dirty > 0, (el) => el.child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${dirty} unsaved`)))
        .child(div().flex_1())
        .when(this.entries.length > 0, (el) => el.child(button("ed-save-all", "Save all", (e, cx) => this.defer(cx, (cx) => this.saveAll(cx)), dirty ? "accent" : "muted")))
        .child(tool("ed-new-file", "plus", "New file", (_e, cx) => { this.newOpen = true; this.newInput.focus(); cx.notify(); }))
        .child(tool("ed-open", "folder", "Quick open", (_e, cx) => this.showQuick(cx))))
      .when(this.entries.length > 0, (el) => el.child(h_flex().h(34).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border).overflow_x_scrollbar().children(entries.map(tab))))
      .child(body)
      .when(!entry, (el) => el.child(h_flex().h(24).flex_none().px(10).items_center().text_size(10.5).text_color(t.dim).child("Bubble feature pack · editor")))
      .when(Boolean(this.note), (el) => el.child(div().px(10).py(5).flex_none().text_size(11).text_color(t.muted).child(this.note)));
  }
}
