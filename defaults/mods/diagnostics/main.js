// Bubble feature pack: a Problems panel that runs the project's type checker or
// linter, parses common diagnostic formats, and opens each result in the editor.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import {
  spaces, panes, focused, exec, readTextFile, theme, settings, shared, setShared,
  run, nextCommand, window,
} from "bubble";

const DEFAULTS = {
  command: "",
  autoRun: false,
  timeout: 120000,
  maxProblems: 800,
  root: "",
};

const ROW = (size) => Math.ceil(size * 1.8);
const isAbs = (p) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(p ?? "");
const join = (root, path) => isAbs(path) ? path : `${(root ?? "").replace(/[\\/]+$/, "")}/${String(path).replace(/^[\\/]+/, "")}`;
const base = (p) => (p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

function cfg() {
  const all = shared("bubble.settings");
  return { ...DEFAULTS, ...(all && typeof all === "object" ? all.diagnostics ?? {} : {}) };
}

function setDiag(patch) {
  const all = shared("bubble.settings");
  setShared("bubble.settings", {
    ...(all && typeof all === "object" ? all : {}),
    diagnostics: { ...cfg(), ...patch },
  });
}

function loc() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on: on ?? null };
}

const key = () => JSON.stringify(loc());

// A single parser for the common `path:line:col: severity: message` family,
// including tsc, gcc/clang, ruff, eslint (unix), cargo --message-format=short,
// go vet and Pyright. `path(line,col): error ...` covers MSVC and Roslyn.
function parseLine(line) {
  let m = /^(.+?):(\d+)(?::(\d+))?:\s*(?:(error|warning|info|note|hint)\b\s*:?)?\s*(.*)$/i.exec(line);
  if (!m) m = /^(.+?)\((\d+),(\d+)\):\s*(?:(error|warning|info|note|hint)\b\s*:?)?\s*(.*)$/i.exec(line);
  if (!m) {
    const arrow = /^\s*-->\s+(.+?):(\d+):(\d+)\s*$/.exec(line);
    return arrow ? { path: arrow[1], line: Number(arrow[2]), column: Number(arrow[3]), severity: "error", message: "" } : null;
  }
  const message = (m[5] ?? "").trim();
  let severity = (m[4] ?? "").toLowerCase();
  if (!severity) {
    if (/\berror\b/i.test(message)) severity = "error";
    else if (/\bwarning\b/i.test(message)) severity = "warning";
    else severity = "info";
  }
  if (!message && severity !== "error") return null;
  return { path: m[1].trim().replace(/^\.\//, ""), line: Number(m[2]), column: Number(m[3] ?? 0), severity, message };
}

function severityRank(s) {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}

export default class Diagnostics extends View {
  init(_props, cx) {
    this.problems = [];
    this.filter = "all";
    this.query = "";
    this.busy = false;
    this.queued = false;
    this.ranAt = null;
    this.status = "";
    this.command = "";
    this.error = "";
    this.focusHandle = cx.focus_handle();
    this.search = InputState.new({ placeholder: "Filter by file or message" });
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); cx.notify(); });
    this.commandInput = InputState.new({ placeholder: "e.g. npx tsc --noEmit --pretty false" });
    this.commandInput.on("submit", (_e, cx) => { this.setCommand(cx); });
    this.commandOpen = false;
    this.refresh(cx);
    cx.timer.every(30000, (cx) => { if (cfg().autoRun) this.refresh(cx); });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "run") this.refresh(cx);
        else if (command === "clear") this.clear(cx);
        else if (command === "focus") this.focusHandle.focus();
        else if (command === "filter") this.search.focus();
        cx.notify();
      }
    });
    this.focusHandle.focus();
  }

  current() {
    return { cwd: this.root ?? loc().cwd, on: this.on ?? loc().on };
  }

  setCommand(cx) {
    const command = this.commandInput.value().trim();
    setDiag({ command });
    this.commandOpen = false;
    this.refresh(cx);
  }

  async detect(cwd, on) {
    if (!cwd) return "";
    const read = (name) => readTextFile(join(cwd, name), { on }).catch(() => null);
    const pkg = await read("package.json");
    if (pkg) {
      try {
        const data = JSON.parse(pkg);
        const scripts = data?.scripts ?? {};
        if (scripts.typecheck) return "npm run typecheck --silent";
        if (scripts.lint) return "npm run lint --silent";
      } catch {}
    }
    if (await read("tsconfig.json")) return "npx --no-install tsc --noEmit --pretty false";
    if (await read("Cargo.toml")) return "cargo check --message-format=short";
    if (await read("go.mod")) return "go vet ./...";
    if (await read("pyproject.toml") || await read("setup.py") || await read("requirements.txt")) return "ruff check . --output-format concise";
    if (pkg) return "npx --no-install eslint . -f unix";
    return "";
  }

  refresh(cx) {
    const { cwd, on } = loc();
    if (!cwd) return;
    if (this.busy) { this.queued = true; return; }
    const next = key();
    if (this.context !== next) {
      this.context = next;
      this.root = cfg().root || cwd;
      this.on = on;
      this.problems = [];
      this.ranAt = null;
      this.status = "";
      this.error = "";
    }
    const config = cfg();
    const root = config.root ? (isAbs(config.root) ? config.root : join(cwd, config.root)) : cwd;
    this.root = root;
    this.on = on;
    this.busy = true;
    this.error = "";
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const command = (config.command || "").trim() || await this.detect(root, on);
        this.command = command;
        if (!command) {
          this.status = "No check command detected. Set one in Bubble Settings.";
          this.problems = [];
          return;
        }
        const platform = window()?.platform;
        const r = platform === "windows"
          ? await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd: root, on, timeout: Math.max(5000, Number(config.timeout) || 120000) })
          : await exec("sh", ["-c", command], { cwd: root, on, timeout: Math.max(5000, Number(config.timeout) || 120000) });
        const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
        const problems = [];
        const seen = new Set();
        for (const line of text.split(/\r?\n/)) {
          if (problems.length >= (Number(config.maxProblems) || 800)) break;
          const item = parseLine(line);
          if (!item) continue;
          if (!item.message && item.severity !== "error") continue;
          const full = isAbs(item.path) ? item.path : join(root, item.path);
          const id = `${full}:${item.line}:${item.column}:${item.message}`;
          if (seen.has(id)) continue;
          seen.add(id);
          problems.push({ ...item, full, name: base(item.path) });
        }
        problems.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.path.localeCompare(b.path) || a.line - b.line);
        this.problems = problems;
        this.ranAt = Date.now();
        const errorCount = problems.filter((p) => p.severity === "error").length;
        const warningCount = problems.filter((p) => p.severity === "warning").length;
        this.status = r.code === 0
          ? `Clean · ${errorCount} errors · ${warningCount} warnings`
          : `Exit ${r.code} · ${errorCount} errors · ${warningCount} warnings`;
        if (!problems.length && r.code !== 0) {
          this.error = (r.stderr || r.stdout || "").trim().slice(0, 1200) || `The check exited with code ${r.code} but matched no diagnostics.`;
        }
      } catch (e) {
        this.error = String(e);
        this.status = "Check failed to run";
      } finally {
        this.busy = false;
        if (this.queued) { this.queued = false; this.refresh(cx); }
        cx.notify();
      }
    });
  }

  clear(cx) {
    this.problems = [];
    this.status = "";
    this.error = "";
    this.ranAt = null;
    cx.notify();
  }

  counts() {
    const errors = this.problems.filter((p) => p.severity === "error").length;
    const warnings = this.problems.filter((p) => p.severity === "warning").length;
    return { errors, warnings, info: this.problems.length - errors - warnings };
  }

  visible() {
    const q = this.query.trim().toLowerCase();
    return this.problems.filter((p) => {
      if (this.filter === "errors" && p.severity !== "error") return false;
      if (this.filter === "warnings" && p.severity !== "warning") return false;
      if (!q) return true;
      return p.path.toLowerCase().includes(q) || p.message.toLowerCase().includes(q) || p.severity.includes(q);
    });
  }

  open(problem) {
    const cwd = this.root ?? loc().cwd;
    run("tab.new", { name: problem.name, mod: "editor", props: { path: problem.full, cwd, on: this.on } });
  }

  chip(id, label, active, action) {
    const t = theme();
    return h_flex().id(id).h(24).px(8).gap(5).flex_none().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(active ? t.selected : t.chrome).text_color(active ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(label);
  }

  tool(id, icon, title, action, tone = "muted") {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().tooltip(title)
      .text_color(t[tone] ?? t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(13));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), size = Number(settings().font_size) || 13, counts = this.counts(), shown = this.visible();
    const severityColor = (s) => s === "error" ? t.ansi1 : s === "warning" ? t.ansi3 : t.muted;
    const row = (p) => h_flex().id(`diag-${p.full}-${p.line}-${p.column}`).h(ROW(size)).flex_none().px(9).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click(() => this.open(p))
      .child(div().w(7).h(7).flex_none().rounded(4).bg(severityColor(p.severity)))
      .child(div().w(46).flex_none().text_size(10.5).text_color(t.dim).child(String(p.line)))
      .child(div().w(34).flex_none().text_size(10.5).text_color(t.dim).child(p.column ? String(p.column) : ""))
      .child(div().max_w(190).flex_none().truncate().text_size(11.5).text_color(t.muted).child(p.path))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(p.severity === "error" ? t.foreground : t.muted).child(p.message || p.severity))
      .child(div().id(`diag-copy-${p.full}-${p.line}`).flex_none().text_size(10).text_color(t.dim).cursor_pointer()
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(`${p.path}:${p.line}:${p.column}`); })
        .child("copy"));

    const commandLine = this.command || (cfg().command || "auto-detect");

    return v_flex().id("bubble-diagnostics").track_focus(this.focusHandle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.commandOpen) { this.commandOpen = false; cx.stop_propagation(); cx.notify(); }
        if (e.key === "enter" && (e.modifiers.control || e.modifiers.platform) && !this.busy) { this.refresh(cx); cx.stop_propagation(); }
      })
      .child(h_flex().h(40).flex_none().px(11).gap(7).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/circle-check.svg").size(14).text_color(counts.errors ? t.ansi1 : counts.warnings ? t.ansi3 : t.ansi2))
        .child(div().font_semibold().child("Problems"))
        .when(counts.errors > 0, (el) => el.child(div().px(5).py(1).rounded(4).bg(t.ansi1 + "22").text_size(10).text_color(t.ansi1).child(`${counts.errors} errors`)))
        .when(counts.warnings > 0, (el) => el.child(div().px(5).py(1).rounded(4).bg(t.ansi3 + "22").text_size(10).text_color(t.ansi3).child(`${counts.warnings} warnings`)))
        .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(commandLine))
        .child(this.tool("diag-command", "settings", "Set the check command", () => { this.commandOpen = !this.commandOpen; this.commandInput.set_value(cfg().command); if (this.commandOpen) this.commandInput.focus(); cx.notify(); }, this.commandOpen ? "accent" : "muted"))
        .child(this.tool("diag-run", "search", "Run the check (Ctrl+Enter)", () => this.refresh(cx), this.busy ? "working" : "accent"))
        .child(this.tool("diag-clear", "x", "Clear results", () => this.clear(cx))))
      .when(this.commandOpen, (el) => el.child(h_flex().flex_none().px(10).py(7).gap(7).items_center().border_b(1).border_color(t.border).bg(t.surface)
        .child(h_flex().flex_1().h(30).px(9).rounded(7).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.commandInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
        .child(this.chip("diag-save-command", "Use command", true, () => this.setCommand(cx)))
        .child(this.chip("diag-auto", cfg().autoRun ? "Auto-run on" : "Auto-run off", cfg().autoRun, () => { setDiag({ autoRun: !cfg().autoRun }); cx.notify(); }))
        .child(this.chip("diag-cancel-command", "Cancel", false, () => { this.commandOpen = false; cx.notify(); }))))
      .child(h_flex().flex_none().px(8).py(5).gap(4).items_center().border_b(1).border_color(t.border).flex_wrap()
        .child(this.chip("diag-all", `All ${this.problems.length}`, this.filter === "all", () => { this.filter = "all"; cx.notify(); }))
        .child(this.chip("diag-errors", `Errors ${counts.errors}`, this.filter === "errors", () => { this.filter = "errors"; cx.notify(); }))
        .child(this.chip("diag-warnings", `Warnings ${counts.warnings}`, this.filter === "warnings", () => { this.filter = "warnings"; cx.notify(); }))
        .child(h_flex().flex_1().min_w(80).h(26).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.input)
          .child(Input.new(this.search).flex_1().h_full().text_size(11).text_color(t.foreground)))
        .when(this.busy, (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(t.accent).spin(900))))
      .when(Boolean(this.error), (el) => el.child(div().flex_none().px(10).py(7).text_size(11).text_color(t.blocked).child(this.error)))
      .child(div().flex_1().min_h(0).relative()
        .child(div().id("diag-list").absolute().inset_0().overflow_y_scroll().p(5).gap(1)
          .when(shown.length === 0 && !this.busy, (el) => el.child(v_flex().items_center().justify_center().py(26).gap(8)
            .child(svg("mods/workspace-chrome/circle-check.svg").size(30).text_color(counts.errors ? t.dim : t.ansi2))
            .child(div().text_size(13).text_color(t.muted).child(this.problems.length ? "No problems match the filter" : "No problems reported"))
            .child(div().text_size(11).text_color(t.dim).max_w(360).text_center().child(this.status || "Run the check to look for errors and warnings. Results open in the editor."))
            .child(this.chip("diag-run-empty", "Run the check", true, () => this.refresh(cx)))))
          .children(shown.map(row)))
        .child(Scrollbar.vertical("diag-list").absolute().inset_0()))
      .child(h_flex().h(24).flex_none().px(10).gap(8).items_center().border_t(1).border_color(t.border).text_size(10.5).text_color(t.dim)
        .child(div().flex_1().truncate().child(this.status || "Bubble feature pack · diagnostics"))
        .when(Boolean(this.ranAt), (el) => el.child(div().child(new Date(this.ranAt).toLocaleTimeString()))));
  }
}
