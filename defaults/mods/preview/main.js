// Bubble feature pack: Markdown, image, code and media previews, with source
// toggles and an external-browser fallback for URLs Bubble cannot embed.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input, TextView } from "gpui-base";
import {
  spaces, panes, focused, readTextFile, watchFolder, exec, theme, settings,
  shared, setShared, run, appHome, window, nextCommand,
} from "bubble";

const LANG = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", rs: "rust", py: "python", rb: "ruby", go: "go",
  c: "c", h: "c", cpp: "cpp", cs: "csharp", java: "java", kt: "kotlin", php: "php",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell", html: "html", htm: "html",
  css: "css", scss: "scss", json: "json", jsonc: "json", toml: "toml", yaml: "yaml",
  yml: "yaml", md: "markdown", mdx: "markdown", xml: "xml", svg: "xml", sql: "sql",
  lua: "lua", zig: "zig", txt: "text",
};
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MEDIA = /\.(mp4|webm|mov|mkv|avi|mp3|wav|ogg|flac|m4a|pdf)$/i;
const HTML = /\.(html?|xhtml)$/i;

const DEFAULTS = { renderMarkdown: true, followRecentFile: true, maxPreviewBytes: 2000000 };

function cfg() {
  const all = shared("bubble.settings");
  return { ...DEFAULTS, ...(all && typeof all === "object" ? all.preview ?? {} : {}) };
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
const ext = (p) => { const name = base(p); const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1).toLowerCase() : ""; };
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };
const quote = (s, p) => p === "windows" ? `'${String(s).replace(/'/g, "''")}'` : `'${String(s).replace(/'/g, "'\\''")}'`;

function syntax(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6, variable: t.foreground, operator: t.ansi6, punctuation: t.muted, boolean: t.ansi3, "string.escape": t.ansi3 };
}

async function openExternal(target) {
  const platform = window()?.platform;
  try {
    if (platform === "macos") await exec("open", [target]);
    else if (platform === "windows") await exec("powershell", ["-NoProfile", "-Command", `Start-Process ${quote(target, "windows")}`]);
    else await exec("xdg-open", [target]);
  } catch {}
}

export default class Preview extends View {
  init(props, cx) {
    this.mode = cfg().renderMarkdown ? "rendered" : "source";
    this.note = "";
    this.error = "";
    this.text = null;
    this.code = null;
    this.imagePath = null;
    this.urlText = null;
    this.fetching = false;
    this.loading = false;
    this.url = props?.url ?? "";
    this.cwd = props?.cwd ?? loc().cwd;
    this.on = props?.on ?? loc().on;
    this.path = props?.path ?? "";
    if (!this.path && !this.url && cfg().followRecentFile) {
      const recent = shared("bubble.recentFile");
      if (recent && typeof recent === "object") { this.path = recent.path ?? ""; this.cwd = recent.cwd ?? this.cwd; this.on = recent.on ?? this.on; }
    }
    this.handle = cx.focus_handle();
    this.urlInput = InputState.new({ placeholder: "http://localhost:5173", value: this.url });
    this.urlInput.on("submit", (_e, cx) => this.loadUrl(cx));
    this.urlInput.on("change", (_e) => { this.url = this.urlInput.value(); });
    if (this.path) this.load(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "refresh") {
          if (!this.path && this.url) this.loadUrl(cx);
          else await this.load(cx);
        } else if (command === "source") this.mode = "source";
        else if (command === "rendered") this.mode = "rendered";
        else if (command === "external") {
          const target = this.path ? this.full() : this.url ? (/^https?:\/\//i.test(this.url) ? this.url : `http://${this.url}`) : "";
          if (target) openExternal(target);
        } else if (command === "editor") {
          const full = this.full();
          if (full) run("tab.new", { name: base(full), mod: "editor", props: { path: full, cwd: dir(full), on: this.on } });
        } else if (command === "url") this.urlInput.focus();
        else if (command === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  full() {
    if (!this.path) return "";
    return isAbs(this.path) ? this.path : join(this.cwd, this.path);
  }

  current(path) { return this.path === path; }

  async load(cx) {
    const path = this.path;
    if (!path) return;
    this.loading = true;
    this.error = "";
    this.code?.release();
    this.code = null;
    this.text = null;
    this.imagePath = null;
    this.binary = false;
    cx.notify();
    const full = this.full();
    try {
      if (IMAGE.test(full)) {
        if (this.on) throw new Error("Images on another machine cannot be copied into this window");
        const target = await this.cacheImage(full);
        if (!this.current(path)) return;
        this.imagePath = target;
        sharedSetRecent(full, this.cwd, this.on);
      } else {
        const text = await readTextFile(full, { on: this.on });
        if (!this.current(path)) return;
        if (text === null) throw new Error("File not found");
        const limit = Math.max(100000, Number(cfg().maxPreviewBytes) || 2000000);
        this.text = text.length > limit ? text.slice(0, limit) + "\n… (truncated)" : text;
        this.binary = text.includes("\0");
        if (!this.binary && !MEDIA.test(full)) {
          const t = theme();
          this.code = EditorState.new({
            language: LANG[ext(full)] ?? ext(full) ?? "text", value: this.text, readonly: true,
            font_family: settings().font_family, font_size: settings().font_size, syntax: syntax(t),
          });
        }
        sharedSetRecent(full, this.cwd, this.on);
      }
      this.watch(full, cx);
    } catch (e) { if (this.current(path)) this.error = String(e); }
    finally { if (this.current(path)) { this.loading = false; cx.notify(); } }
  }

  async cacheImage(full) {
    const platform = window()?.platform;
    const cacheDir = `${appHome().replace(/[\\/]+$/, "")}/cache/preview`;
    const name = `${hash(full)}-${base(full).replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const dest = `${cacheDir}/${name}`;
    if (platform === "windows") {
      await exec("powershell", ["-NoProfile", "-Command", `New-Item -ItemType Directory -Force -Path ${quote(cacheDir, "windows")} | Out-Null; Copy-Item -LiteralPath ${quote(full, "windows")} -Destination ${quote(dest, "windows")} -Force`]);
    } else {
      await exec("sh", ["-c", `mkdir -p ${quote(cacheDir, "unix")} && cp ${quote(full, "unix")} ${quote(dest, "unix")}`]);
    }
    return `cache/preview/${name}`;
  }

  watch(full, cx) {
    const dirname = dir(full);
    if (this.on || this.watched === dirname) return;
    this.watched = dirname;
    const path = this.path;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === dirname && this.path === path) {
          await watchFolder(dirname);
          if (this.path === path) this.load(cx);
        }
      } catch { if (this.watched === dirname) this.watched = null; }
    });
  }

  loadUrl(cx) {
    this.url = this.urlInput.value().trim();
    if (!this.url) return;
    this.fetching = true;
    this.urlText = null;
    cx.spawn(async (cx) => {
      try {
        const r = await fetch(/^https?:\/\//i.test(this.url) ? this.url : `http://${this.url}`);
        this.urlText = clip(await r.text(), 500000);
        this.urlStatus = `${r.status} ${r.url}`;
      } catch (e) { this.note = `Fetch failed: ${e}`; }
      finally { this.fetching = false; cx.notify(); }
    });
    cx.notify();
  }

  openLink(url, cx) {
    if (/^https?:\/\//i.test(url)) { openExternal(url); return; }
    if (url.startsWith("#")) return;
    const clean = decodeURIComponent(url.split("#")[0].split("?")[0]);
    const full = join(dir(this.full()), clean);
    run("tab.new", { name: base(full), mod: "preview", props: { path: full, cwd: dir(full), on: this.on } });
  }

  headerButton(id, label, action, tone = "muted") {
    const t = theme();
    return div().id(id).h(24).px(8).flex().items_center().rounded(6).text_size(11).text_color(t[tone] ?? t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(label);
  }

  render(cx) {
    const t = theme(), full = this.full(), e = ext(full);
    const markdown = MARKDOWN.test(full), media = MEDIA.test(full), html = HTML.test(full), imageFile = IMAGE.test(full);
    const rendered = this.mode !== "source";

    const empty = !this.path && !this.url;
    return v_flex().id("bubble-preview").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.urlText) { this.urlText = null; cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(40).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/monitor.svg").size(14).text_color(t.accent))
        .child(div().font_semibold().child("Preview"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(this.path || this.url || "no file"))
        .when(Boolean(this.path) && e, (el) => el.child(div().px(5).py(1).rounded(4).bg(t.raised).text_size(9.5).text_color(t.muted).child(e)))
        .when(markdown, (el) => el.child(this.headerButton("pv-mode", rendered ? "Source" : "Rendered", () => { this.mode = rendered ? "source" : "rendered"; cx.notify(); }, rendered ? "muted" : "accent")))
        .when(Boolean(this.path), (el) => el.child(this.headerButton("pv-refresh", "Refresh", (e, cx) => { cx.spawn(async (cx) => { await this.load(cx); }); })))
        .when(Boolean(this.path), (el) => el.child(this.headerButton("pv-editor", "Open in editor", () => run("tab.new", { name: base(full), mod: "editor", props: { path: full, cwd: dir(full), on: this.on } }))))
        .when(Boolean(full), (el) => el.child(this.headerButton("pv-external", "Open externally", () => openExternal(full), "accent"))))
      .when(this.url || !this.path, (el) => el.child(h_flex().flex_none().px(10).py(7).gap(7).items_center().border_b(1).border_color(t.border)
        .child(h_flex().flex_1().h(30).px(9).rounded(7).border_1().border_color(t.border).bg(t.input).child(Input.new(this.urlInput).flex_1().h_full().text_size(12).text_color(t.foreground)))
        .child(this.headerButton("pv-go", this.fetching ? "Fetching…" : "Open URL", () => this.loadUrl(cx), "accent"))
        .child(this.headerButton("pv-browser", "Browser", () => openExternal(/^https?:\/\//i.test(this.url) ? this.url : `http://${this.url}`)))))
      .when(Boolean(this.error), (el) => el.child(div().p(12).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(div().flex_1().min_h(0).relative()
        .when(empty, (area) => area.child(v_flex().size_full().items_center().justify_center().gap(9)
          .child(svg("mods/workspace-chrome/monitor.svg").size(34).text_color(t.dim))
          .child(div().text_size(15).font_semibold().child("Bubble Preview"))
          .child(div().text_size(11.5).text_color(t.muted).max_w(430).text_center().child("Open a file from Files or the editor, or paste a local dev-server URL above. Markdown, images and source are rendered here; media and web pages open externally."))
          .child(this.headerButton("pv-palette", "Open the command palette", () => run("mod.open", { name: "command-palette" }), "accent"))))
        .when(!empty && this.loading, (area) => area.child(div().p(16).text_color(t.dim).child("Loading…")))
        .when(!empty && !this.loading && imageFile && this.imagePath, (area) => area.child(v_flex().size_full().p(14).gap(8).items_center().justify_center()
          .child(image(this.imagePath).max_w_full().max_h_full())
          .child(div().text_size(10).text_color(t.dim).child("Image copied into the app-home preview cache."))))
        .when(!empty && !imageFile && this.urlText !== null, (area) => area.child(v_flex().size_full().min_h(0)
          .child(h_flex().flex_none().px(10).py(4).gap(8).items_center().border_b(1).border_color(t.border)
            .child(div().text_size(10.5).text_color(t.dim).child(this.urlStatus ?? "Fetched source"))
            .child(div().flex_1()).child(this.headerButton("pv-url-close", "Close source", () => { this.urlText = null; cx.notify(); })))
          .child(div().flex_1().min_h(0).overflow_y_scrollbar().p(10).font_family(settings().font_family ?? "monospace").text_size(11)
            .child(div().text_color(t.muted).child(this.urlText)))))
        .when(!empty && !imageFile && this.urlText === null && media, (area) => area.child(v_flex().size_full().items_center().justify_center().gap(9)
          .child(svg("mods/workspace-chrome/monitor.svg").size(32).text_color(t.dim))
          .child(div().text_size(14).font_semibold().child(base(full)))
          .child(div().text_size(11.5).text_color(t.muted).max_w(400).text_center().child("Audio, video and PDF need a native media surface, which Bubble mods do not expose. Open it in the system app instead."))
          .child(this.headerButton("pv-media-open", "Open externally", () => openExternal(full), "accent"))))
        .when(!empty && !imageFile && this.urlText === null && !media && html, (area) => area.child(v_flex().size_full().min_h(0)
          .child(h_flex().flex_none().px(10).py(4).gap(8).items_center().border_b(1).border_color(t.border)
            .child(div().text_size(10.5).text_color(t.dim).child("HTML source · Bubble has no embedded browser"))
            .child(div().flex_1()).child(this.headerButton("pv-html-open", "Open in browser", () => openExternal(full), "accent")))
          .when(this.code, (el) => el.child(Editor.new(this.code).flex_1().min_h(0)))))
        .when(!empty && !imageFile && this.urlText === null && !media && !html && markdown && rendered, (area) => area.child(
          TextView.markdown(`pv-md-${hash(full)}`, this.text ?? "").selectable(true)
            .on_link_click((url, cx) => this.openLink(url, cx)).size_full().p(18).overflow_y_scrollbar().text_size(13.5)))
        .when(!empty && !imageFile && this.urlText === null && !media && !html && !markdown && this.code, (area) => area.child(Editor.new(this.code).size_full()))
        .when(!empty && !imageFile && this.urlText === null && !media && !html && markdown && !rendered && this.code, (area) => area.child(Editor.new(this.code).size_full()))
        .when(!empty && this.binary, (area) => area.child(div().p(16).text_color(t.dim).child("Binary file · no text preview")))
        .when(Boolean(this.note), (area) => area.child(div().absolute().left(0).right(0).bottom(0).px(10).py(5).bg(t.raised).text_size(10.5).text_color(t.muted).child(this.note))))
      .child(h_flex().h(23).flex_none().px(10).items_center().text_size(10).text_color(t.dim)
        .child(div().flex_1().truncate().child(full ? dir(full) : "Bubble feature pack · preview")));
  }
}

function clip(text, n) { return text.length > n ? text.slice(0, n) + "\n… (truncated)" : text; }

function sharedSetRecent(path, cwd, on) {
  try { setShared("bubble.recentFile", { path, cwd, on }); } catch {}
}
