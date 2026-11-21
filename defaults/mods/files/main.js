// A lazy file browser for the focused pane's folder, with bounded read-only
// previews, project search, hidden-file filtering and inline create/rename/delete.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, run, nextCommand } from "bubble";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const isAbs = (p) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(p ?? "");
const base = (p) => (p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const dir = (p) => { const s = (p ?? "").replace(/[\\/]+$/, ""), i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")); return i > 0 ? s.slice(0, i) : ""; };
const join = (root, path) => isAbs(path) ? path : `${(root ?? "").replace(/[\\/]+$/, "")}/${String(path).replace(/^[\\/]+/, "")}`;
const rel = (root, full) => {
  const r = (root ?? "").replace(/[\\/]+$/, "");
  if (full === r) return "";
  if (full.startsWith(`${r}/`) || full.startsWith(`${r}\\`)) return full.slice(r.length + 1).replace(/\\/g, "/");
  return full;
};
const quote = (text, platform) => platform === "windows"
  ? `'${String(text).replace(/'/g, "''")}'`
  : `'${String(text).replace(/'/g, "'\\''")}'`;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

async function fsOperation(action, target, on) {
  const platform = window()?.platform;
  const remote = Boolean(on);
  if (remote || platform !== "windows") {
    let script;
    if (action === "mkdir") script = `mkdir -p ${quote(target, "unix")}`;
    else if (action === "touch") script = `if [ -e ${quote(target, "unix")} ]; then echo "Already exists" >&2; exit 1; fi; : > ${quote(target, "unix")}`;
    else if (action === "rename") script = `if [ -e ${quote(target.to, "unix")} ]; then echo "Target exists" >&2; exit 1; fi; mv -- ${quote(target.from, "unix")} ${quote(target.to, "unix")}`;
    else if (action === "delete") script = `rm -rf -- ${quote(target, "unix")}`;
    else return null;
    return exec("sh", ["-c", script], { on });
  }
  let line;
  if (action === "mkdir") line = `New-Item -ItemType Directory -Path ${quote(target, "windows")} -ErrorAction Stop | Out-Null`;
  else if (action === "touch") line = `if (Test-Path -LiteralPath ${quote(target, "windows")}) { throw 'Already exists' }; New-Item -ItemType File -Path ${quote(target, "windows")} | Out-Null`;
  else if (action === "rename") line = `if (Test-Path -LiteralPath ${quote(target.to, "windows")}) { throw 'Target exists' }; Rename-Item -LiteralPath ${quote(target.from, "windows")} -NewName ${quote(base(target.to), "windows")} -ErrorAction Stop`;
  else if (action === "delete") line = `Remove-Item -LiteralPath ${quote(target, "windows")} -Recurse -Force -ErrorAction Stop`;
  else return null;
  return exec("powershell", ["-NoProfile", "-Command", line]);
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.showHidden = false;
    this.searchOpen = false;
    this.search = "";
    this.results = null;
    this.searching = false;
    this.searchGeneration = 0;
    this.prompt = null;
    this.note = "";
    this.handle = cx.focus_handle();
    this.searchInput = InputState.new({ placeholder: "Search project files…" });
    this.searchInput.on("change", (_e, cx) => {
      this.search = this.searchInput.value();
      this.searchGeneration++;
      const generation = this.searchGeneration;
      if (!this.search.trim()) { this.results = null; this.searching = false; cx.notify(); return; }
      this.searching = true;
      cx.notify();
      cx.timer.after(180, (cx) => {
        if (generation === this.searchGeneration) this.runSearch(cx);
      });
    });
    this.searchInput.on("submit", (_e, cx) => { this.searchGeneration++; this.runSearch(cx); });
    this.nameInput = InputState.new({ placeholder: "Name" });
    this.nameInput.on("submit", (_e, cx) => this.submitPrompt(cx));
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "newFile") this.openPrompt("newFile", null, "", cx);
        else if (command === "newFolder") this.openPrompt("newFolder", null, "", cx);
        else if (command === "rename" && this.file) this.openPrompt("rename", this.file, dir(this.file), cx);
        else if (command === "delete" && this.file) this.openPrompt("delete", this.file, null, cx);
        else if (command === "search") { this.searchOpen = true; this.searchInput.focus(); }
        else if (command === "refresh") this.refresh(cx);
        else if (command === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  fullOf(path) {
    if (!path) return "";
    if (isAbs(path)) return path;
    return join(this.root, path);
  }

  visible(entry) {
    return this.showHidden || !entry.name.startsWith(".");
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null; this.note = "";
    if (!path || !cx) return;
    const context = this.context, full = this.fullOf(path), on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(full, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: settings().font_size,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  async projectFiles() {
    const cwd = this.root, on = this.on;
    if (!cwd) return [];
    const git = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "ls-files", "--cached", "--others", "--exclude-standard"], { cwd, on }).catch(() => null);
    if (git?.code === 0) return git.stdout.split("\n").filter(Boolean).slice(0, 20000);
    const platform = window()?.platform;
    const r = platform === "windows"
      ? await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-ChildItem -LiteralPath '" + cwd.replace(/'/g, "''") + "' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 5000 -ExpandProperty FullName"], { on })
      : await exec("sh", ["-c", 'find "$1" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -5000', "files", cwd], { on });
    if (r.code !== 0) return [];
    return r.stdout.split("\n").filter(Boolean).map((p) => rel(cwd, p));
  }

  async runSearch(cx) {
    const query = this.search.trim();
    if (!query) { this.results = null; this.searching = false; cx.notify(); return; }
    this.searching = true;
    cx.notify();
    try {
      const files = await this.projectFiles();
      const q = query.toLowerCase();
      const scored = [];
      for (const path of files) {
        const lower = path.toLowerCase(), name = lower.split("/").pop();
        let score = 0, at = 0, ok = true;
        for (const ch of q) {
          const found = lower.indexOf(ch, at);
          if (found < 0) { ok = false; break; }
          score += found === 0 ? 5 : 1;
          at = found + 1;
        }
        if (!ok) continue;
        if (name === q) score += 100;
        else if (name.startsWith(q)) score += 50;
        else if (lower.includes(q)) score += 20;
        scored.push({ path, score });
      }
      scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
      this.results = scored.slice(0, 200).map((s) => s.path);
    } catch (e) { this.note = String(e); this.results = []; }
    finally { this.searching = false; cx.notify(); }
  }

  openPrompt(kind, path, folder, cx) {
    this.prompt = { kind, path, folder: folder ?? "" };
    this.nameInput.set_value(kind === "rename" && path ? base(path) : "");
    this.nameInput.focus();
    this.note = "";
    cx.notify();
  }

  cancelPrompt(cx) {
    this.prompt = null;
    this.note = "";
    this.handle.focus();
    cx.notify();
  }

  submitPrompt(cx) {
    if (!this.prompt) return;
    if (this.prompt.kind === "delete") { this.performDelete(cx); return; }
    const name = this.nameInput.value().trim();
    if (!name) { this.note = "Type a name"; cx.notify(); return; }
    if (name === "." || name === ".." || /[\\/]/.test(name)) { this.note = "Use a plain name without slashes"; cx.notify(); return; }
    const prompt = this.prompt;
    const folder = prompt.folder ?? "";
    const target = join(this.root, folder ? `${folder}/${name}` : name);
    if (prompt.kind === "rename") {
      const from = this.fullOf(prompt.path);
      if (from === target) { this.cancelPrompt(cx); return; }
      this.mutate("rename", { from, to: target }, cx, (cx) => {
        const oldPath = prompt.path;
        const newPath = rel(this.root, target);
        if (this.file === oldPath) this.file = newPath;
        this.cancelPrompt(cx);
        this.refresh(cx);
      });
    } else {
      const isFile = prompt.kind === "newFile";
      this.mutate(isFile ? "touch" : "mkdir", target, cx, (cx) => {
        this.cancelPrompt(cx);
        this.refresh(cx);
        if (isFile) this.show(rel(this.root, target), cx);
        this.searchGeneration++;
      });
    }
  }

  performDelete(cx) {
    const path = this.prompt?.path;
    if (!path) return;
    const full = this.fullOf(path);
    this.mutate("delete", full, cx, (cx) => {
      if (this.file === path) this.show(null);
      this.cancelPrompt(cx);
      this.refresh(cx);
    });
  }

  mutate(action, target, cx, done) {
    const on = this.on;
    this.note = "";
    cx.spawn(async (cx) => {
      try {
        const r = await fsOperation(action, target, on);
        if (r && r.code !== 0) throw new Error((r.stderr || r.stdout || "Operation failed").trim());
        this.note = action === "touch" ? "Created the file" : action === "mkdir" ? "Created the folder" : action === "rename" ? "Renamed" : "Deleted";
        await done(cx);
      } catch (e) {
        this.note = String(e);
        if (this.prompt) this.nameInput.focus();
      }
      cx.notify();
    });
  }

  openInEditor(path) {
    if (!path) return;
    const full = this.fullOf(path);
    run("tab.new", { name: base(path), mod: "editor", props: { path: full, cwd: this.root, on: this.on } });
  }

  rows(prefix, depth, out, t, query) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      if (!query && !this.visible(entry)) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      if (query && !entry.dir && !path.toLowerCase().includes(query)) continue;
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .child(entry.dir ? svg(`mods/files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark)))
        .child(div().id(`file-open-${path}`).text_size(9.5).text_color(t.dim).cursor_pointer().px(3)
          .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); if (entry.dir) this.openPrompt("newFile", null, path, cx); else this.openInEditor(path); })
          .child(entry.dir ? "+" : "edit")));
      if (entry.dir && open) this.rows(path, depth + 1, out, t, query);
    }
    return out;
  }

  headerButton(id, label, action, tone = "muted") {
    const t = theme();
    return h_flex().id(id).h(24).px(8).gap(4).flex_none().items_center().rounded(6).text_size(11).text_color(t[tone] ?? t.muted).cursor_pointer()
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).child(label);
  }

  tool(id, icon, title, action, tone = "muted") {
    const t = theme();
    return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().tooltip(title)
      .text_color(t[tone] ?? t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/files/${icon}.svg`).size(13));
  }

  promptBar(t, cx) {
    if (!this.prompt) return null;
    const kind = this.prompt.kind;
    const label = kind === "newFile" ? "New file" : kind === "newFolder" ? "New folder" : kind === "rename" ? "Rename" : "Delete";
    return h_flex().flex_none().px(9).py(7).gap(7).items_center().border_b(1).border_color(t.border).bg(t.surface)
      .child(div().text_size(10.5).text_color(t.dim).child(label))
      .when(kind === "delete", (row) => row
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.foreground).child(this.prompt.path ?? ""))
        .child(this.headerButton("files-delete-confirm", "Delete", () => this.performDelete(cx), "blocked"))
        .child(this.headerButton("files-delete-cancel", "Cancel", () => this.cancelPrompt(cx))))
      .when(kind !== "delete", (row) => row
        .child(h_flex().flex_1().min_w(0).h(28).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.nameInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
        .child(this.headerButton("files-prompt-save", "Save", () => this.submitPrompt(cx), "accent"))
        .child(this.headerButton("files-prompt-cancel", "Cancel", () => this.cancelPrompt(cx))));
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    const query = this.search.trim().toLowerCase();
    const preview = Boolean(this.file);
    const canRename = Boolean(this.file);
    return v_flex().id("files").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && (this.prompt || this.searchOpen)) {
          if (this.prompt) this.cancelPrompt(cx); else { this.searchOpen = false; this.search = ""; this.results = null; cx.notify(); }
          cx.stop_propagation();
        }
        if (e.key === "enter" && (e.modifiers.control || e.modifiers.platform) && preview) { this.openInEditor(this.file); cx.stop_propagation(); }
      })
      .child(h_flex().h(42).flex_none().px(10).gap(5).items_center().border_b(1).border_color(t.border)
        .when(preview, el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(preview ? this.file : this.root?.split(/[\\/]/).pop() ?? ""))
        .when(!preview, el => el
          .child(this.tool("files-new-file", "file", "New file", () => this.openPrompt("newFile", null, "", cx)))
          .child(this.tool("files-new-folder", "folder", "New folder", () => this.openPrompt("newFolder", null, "", cx)))
          .child(this.tool("files-search", "search", "Search project files", () => { this.searchOpen = !this.searchOpen; if (this.searchOpen) this.searchInput.focus(); cx.notify(); }, this.searchOpen ? "accent" : "muted"))
          .child(this.headerButton("files-hidden", this.showHidden ? "Hidden on" : "Hidden off", () => { this.showHidden = !this.showHidden; cx.notify(); }, this.showHidden ? "accent" : "muted"))
          .child(this.tool("files-refresh", "chevron-right", "Refresh", () => this.refresh(cx))))
        .when(preview, el => el
          .child(this.headerButton("files-edit", "Open in editor", () => this.openInEditor(this.file), "accent"))
          .child(this.headerButton("files-rename", "Rename", () => this.openPrompt("rename", this.file, dir(this.file), cx)))
          .child(this.headerButton("files-delete", "Delete", () => this.openPrompt("delete", this.file, null, cx), "blocked"))))
      .when(Boolean(this.prompt), el => el.child(this.promptBar(t, cx)))
      .when(this.searchOpen && !preview, el => el.child(h_flex().flex_none().px(9).py(6).gap(7).items_center().border_b(1).border_color(t.border).bg(t.surface)
        .child(h_flex().flex_1().h(28).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.searchInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
        .when(this.searching, (row) => row.child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(t.accent).spin(900)))
        .child(this.headerButton("files-search-close", "Close", () => { this.searchOpen = false; this.search = ""; this.results = null; cx.notify(); }))))
      .when(!preview, el => el.child(query && this.results !== null
        ? v_flex().id("files-results").flex_1().min_h(0).overflow_y_scrollbar().p(6).gap(1)
          .when(this.results.length === 0, (list) => list.child(div().p(8).text_size(12).text_color(t.dim).child(this.searching ? "Searching…" : "No matching files")))
          .children(this.results.map((path) => h_flex().id(`file-result-${path}`).h(27).flex_none().px(7).gap(7).items_center().rounded(6).cursor_pointer()
            .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.searchOpen = false; this.show(path, cx); cx.notify(); })
            .child(svg("mods/files/file.svg").size(13).text_color(t.muted))
            .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(path))
            .child(div().text_size(9.5).text_color(t.dim).child("open"))))
        : v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t, query))
          .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
          .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(preview, el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")))
      .when(Boolean(this.note), el => el.child(h_flex().flex_none().px(9).py(5).gap(6).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(10.5).text_color(t.muted).child(this.note))
        .child(div().text_size(10).text_color(t.dim).cursor_pointer().on_click(() => { this.note = ""; cx.notify(); }).child("Dismiss"))));
  }
}
