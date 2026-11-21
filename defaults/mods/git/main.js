// Bubble feature pack: a source-control panel with staging, commits, branches,
// history, diffs, push/pull/fetch and inline discard confirmation.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import {
  spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings,
  shared, run, window, nextCommand,
} from "bubble";

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const rowHeight = (size) => Math.ceil(size * 1.8);
const charWidth = (size) => size * 0.64;
const displayColumns = (text) => text.length;

function loc() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on: on ?? null };
}
const key = () => JSON.stringify(loc());
const join = (root, path) => `${(root ?? "").replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`;

function cfg() {
  const all = shared("bubble.settings");
  return { confirmDiscard: true, historyLimit: 80, autoRefresh: true, ...(all && typeof all === "object" ? all.git ?? {} : {}) };
}

export default class BubbleGit extends View {
  init(props, cx) {
    this.view = ["changes", "history", "branches"].includes(props?.view) ? props.view : "changes";
    this.files = [];
    this.selected = null;
    this.log = [];
    this.commit = null;
    this.diff = [];
    this.longest = 0;
    this.branches = [];
    this.note = "";
    this.error = "";
    this.confirm = null;
    this.pickingBranch = false;
    this.creatingBranch = false;
    this.amend = false;
    this.text = "";
    this.loading = false;
    this.busy = false;
    this.handle = cx.focus_handle();
    this.message = InputState.new({ placeholder: "Commit message" });
    this.message.on("change", (_e, cx) => { this.text = this.message.value(); cx.notify(); });
    this.message.on("submit", (_e, cx) => this.doCommit(cx));
    this.message.on("focus", (_e, cx) => { this.typing = "message"; cx.notify(); });
    this.message.on("blur", (_e, cx) => { this.typing = null; cx.notify(); });
    this.branchInput = InputState.new({ placeholder: "new-branch-name" });
    this.branchInput.on("submit", (_e, cx) => this.createBranch(cx));
    this.branchInput.on("focus", (_e, cx) => { this.typing = "branch"; cx.notify(); });
    this.branchInput.on("blur", (_e, cx) => { this.typing = null; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => { if (cfg().autoRefresh) this.refresh(cx); });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "refresh") this.refresh(cx);
        else if (command === "commit") this.doCommit(cx);
        else if (command === "stageAll") this.stageAll(cx);
        else if (command === "unstageAll") this.unstageAll(cx);
        else if (command === "discardAll") this.discardAll(cx);
        else if (command === "changes") { this.view = "changes"; this.refresh(cx); }
        else if (command === "history") { this.view = "history"; this.refresh(cx); }
        else if (command === "branches") { this.view = "branches"; this.refresh(cx); }
        else if (command === "newBranch") { this.view = "branches"; this.creatingBranch = true; this.branchInput.focus(); }
        else if (command === "fetch") this.run(["fetch", "--all", "--prune"], cx, { note: "Fetched" });
        else if (command === "pull") this.run(["pull", "--ff-only"], cx, { note: "Pulled" });
        else if (command === "push") this.run(["push"], cx, { note: "Pushed" });
        else if (command === "focus") this.handle.focus();
        cx.notify();
      }
    });
  }

  current(context) { return this.context === context && key() === context.key; }

  async git(args, options) { return exec("git", [...READ, ...args], options); }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) { await watchFolder(root); if (this.watched === root) this.refresh(cx); }
      } catch { if (this.watched === root) this.watched = null; }
    });
  }

  refresh(cx) {
    const { cwd, on } = loc(), next = key();
    if (next !== this.context?.key) {
      this.context = { key: next, cwd, on };
      this.root = null; this.on = on; this.files = []; this.log = []; this.selected = null;
      this.commit = null; this.diff = []; this.watched = null; this.note = ""; this.error = "";
      this.confirm = null; this.branches = []; this.loading = false;
    }
    if (!cwd || this.loading || this.busy) return;
    const context = this.context;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (!this.current(context)) return;
        if (top.code !== 0) {
          this.root = null; this.files = []; this.log = []; this.branches = []; this.error = "Not a git repository";
          this.diff = []; this.commit = null; return;
        }
        const root = top.stdout.trim();
        const git = (args) => exec("git", [...READ, ...args], { cwd: root, on });

        const [branch, status, head, branchList] = await Promise.all([
          git(["rev-parse", "--abbrev-ref", "HEAD"]),
          git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]),
          git(["rev-parse", "--verify", "HEAD"]),
          git(["for-each-ref", "refs/heads", "--format=%(refname:short)", "--sort=-committerdate"]),
        ]);
        if (!this.current(context)) return;
        if (status.code !== 0) throw new Error(status.stderr);
        this.root = root;
        this.branch = branch.code === 0 ? branch.stdout.trim() : "";
        this.branches = branchList.code === 0 ? branchList.stdout.split("\n").filter(Boolean) : [];
        this.hasHead = head.code === 0;

        const stats = {};
        if (this.hasHead) {
          const numstat = await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"]);
          if (numstat.code === 0) for (const entry of numstat.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t");
            const old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0) };
          }
        }

        const entries = status.stdout.split("\0").filter(Boolean);
        const files = [];
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3);
          const fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const letter = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const staged = !fresh && xy[0] !== " " && xy[0] !== "?";
          const unstaged = fresh || xy[1] !== " ";
          files.push({ path, xy, letter, fresh, staged, unstaged, conflict, ...(stats[path] ?? { add: 0, del: 0 }) });
        }
        this.files = files;
        this.limited = entries.length > 1000;

        const limit = Math.max(10, Number(cfg().historyLimit) || 80);
        const log = await git(["log", `-n${limit}`, "--date=short", "--pretty=format:%h%x1f%an%x1f%ad%x1f%s%x1e"]);
        this.log = log.code === 0 ? log.stdout.split("\x1e").map((s) => s.trim()).filter(Boolean).map((line) => {
          const [hash, author, date, subject] = line.split("\x1f");
          return { hash, author, date, subject };
        }) : [];

        this.error = "";
        this.watch(root, cx);
        if (this.selected && !files.some((f) => f.path === this.selected)) { this.selected = null; this.diff = []; }
        if (!this.selected && files.length && this.view === "changes") this.selected = files[0].path;
        if (this.view === "changes" && this.selected) await this.loadDiff(this.selected, context);
        if (this.view === "history" && !this.commit && this.log.length) await this.loadCommit(this.log[0].hash, context);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) { this.loading = false; cx.notify(); } }
    });
  }

  async loadDiff(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) { this.diff = []; return; }
    let lines = [];
    if (file.fresh) {
      const text = await readTextFile(join(root, path), { on }).catch(() => null);
      lines = text === null || text.includes("\0") ? ["Binary or unreadable file"] : text.replace(/\n$/, "").split("\n").slice(0, 2000).map((line) => `+${line}`);
    } else {
      const args = ["diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path];
      const r = await exec("git", [...READ, ...args], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n");
      const first = all.findIndex((line) => line.startsWith("@@"));
      lines = first < 0 ? ["No text diff available"] : all.slice(first);
      if (!this.hasHead) {
        const cached = await exec("git", [...READ, "diff", "--cached", "--no-color", "--", path], { cwd: root, on });
        if (cached.code === 0 && cached.stdout.trim()) lines = cached.stdout.replace(/\n$/, "").split("\n");
      }
    }
    if (this.current(context) && this.selected === path && this.view === "changes") this.setDiff(lines);
  }

  async loadCommit(hash, context) {
    if (!this.root) return;
    const r = await exec("git", [...READ, "show", "--stat", "--patch", "--no-color", "--format=medium", hash], { cwd: this.root, on: this.on });
    if (!this.current(context)) return;
    if (r.code !== 0) { this.commit = { hash, error: r.stderr }; this.diff = []; return; }
    this.commit = this.log.find((c) => c.hash === hash) ?? { hash };
    this.setDiff(r.stdout.replace(/\n$/, "").split("\n").slice(0, 4000));
  }

  setDiff(lines) {
    this.diff = lines.slice(0, 3000).map((line) => line.length > 3000 ? line.slice(0, 3000) + "…" : line);
    this.longest = Math.max(0, ...this.diff.map(displayColumns));
  }

  pick(path, cx) {
    this.selected = path;
    this.confirm = null;
    const context = this.context;
    cx.spawn(async (cx) => {
      try { await this.loadDiff(path, context); }
      catch (e) { if (this.current(context)) this.note = String(e); }
      cx.notify();
    });
    cx.notify();
  }

  run(args, cx, after) {
    if (this.busy || !this.root) return;
    const root = this.root, on = this.on, context = this.context;
    this.busy = true; this.note = ""; this.error = "";
    cx.spawn(async (cx) => {
      try {
        const r = await exec("git", args, { cwd: root, on });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        if (this.current(context)) {
          this.note = after?.note ?? "";
          this.confirm = null;
          if (after?.clearMessage) { this.text = ""; this.message.set_value(""); }
        }
      } catch (e) { if (this.current(context)) this.note = String(e); }
      finally { if (this.current(context)) { this.busy = false; this.refresh(cx); } cx.notify(); }
    });
    cx.notify();
  }

  stage(file, cx) { this.run(["add", "--", file.path], cx, { note: `Staged ${file.path}` }); }
  unstage(file, cx) { this.run(["restore", "--staged", "--", file.path], cx, { note: `Unstaged ${file.path}` }); }
  stageAll(cx) { this.run(["add", "-A"], cx, { note: "Staged every change" }); }
  unstageAll(cx) { this.run(["reset"], cx, { note: "Unstaged every change" }); }

  discard(file, cx) {
    if (cfg().confirmDiscard) {
      this.confirm = { kind: "discard", path: file.path, fresh: file.fresh };
      cx.notify();
      return;
    }
    this.discardNow(file, cx);
  }

  discardNow(file, cx) {
    if (!this.root || !file) { this.confirm = null; cx.notify(); return; }
    if (file.fresh) {
      const root = this.root, on = this.on;
      this.busy = true;
      cx.spawn(async (cx) => {
        try {
          const p = join(root, file.path);
          const r = window()?.platform === "windows"
            ? await exec("powershell", ["-NoProfile", "-Command", `Remove-Item -LiteralPath '${p.replace(/'/g, "''")}' -Force`], { on })
            : await exec("rm", ["-f", "--", p], { on });
          if (r.code !== 0) throw new Error(r.stderr);
          this.note = `Deleted ${file.path}`;
        } catch (e) { this.note = String(e); }
        finally { this.busy = false; this.confirm = null; this.refresh(cx); cx.notify(); }
      });
    } else {
      this.run(["restore", "--source=HEAD", "--staged", "--worktree", "--", file.path], cx, { note: `Discarded ${file.path}` });
    }
    cx.notify();
  }

  discardAll(cx) {
    this.confirm = { kind: "discardAll" };
    cx.notify();
  }

  discardAllNow(cx) {
    if (!this.root) { this.confirm = null; cx.notify(); return; }
    if (this.hasHead) this.run(["restore", "--source=HEAD", "--staged", "--worktree", "--", "."], cx, { note: "Discarded tracked changes" });
    else { this.note = "Nothing to restore: the repository has no commits yet"; this.confirm = null; cx.notify(); }
  }

  doCommit(cx) {
    if (this.busy || !this.root) return;
    const message = this.text?.trim();
    if (!message) { this.note = "Write a commit message first"; cx.notify(); return; }
    const staged = this.files.some((f) => f.staged);
    if (!staged) { this.note = "Stage files before committing"; cx.notify(); return; }
    const args = ["commit", "-m", message];
    if (this.amend) args.push("--amend");
    this.run(args, cx, { note: "Committed", clearMessage: true });
  }

  switchBranch(name, cx) {
    this.run(["switch", name], cx, { note: `Switched to ${name}` });
    this.pickingBranch = false;
  }

  createBranch(cx) {
    const name = this.branchInput.value().trim();
    if (!name) return;
    this.run(["switch", "-c", name], cx, { note: `Created ${name}` });
    this.pickingBranch = false;
    this.creatingBranch = false;
    this.branchInput.set_value("");
  }

  gitButton(id, label, action, tone = "muted", enabled = true) {
    const t = theme();
    return h_flex().id(id).h(24).px(8).flex_none().items_center().rounded(6).text_size(11.5)
      .text_color(enabled ? (t[tone] ?? t.muted) : t.dim).when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => { if (enabled) action(); }).child(label);
  }

  diffLine(line, t, size) {
    const kind = line[0];
    return h_flex().w_full().h(rowHeight(size)).flex_none().px(10).gap(8).items_center()
      .when(kind === "+" && !line.startsWith("+++"), (el) => el.bg(t.ansi2 + "16"))
      .when(kind === "-" && !line.startsWith("---"), (el) => el.bg(t.ansi1 + "16"))
      .when(kind === "@", (el) => el.bg(t.raised))
      .child(div().w(4).flex_none().text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : kind === "@" ? t.accent : t.dim).child(kind === "+" || kind === "-" ? kind : ""))
      .child(div().flex_1().min_w(0).truncate().text_color(kind === "@" ? t.dim : t.foreground).child(line));
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme(), size = settings().font_size, style = cfg();
    const staged = this.files.filter((f) => f.staged && !f.conflict);
    const changed = this.files.filter((f) => f.unstaged || f.conflict);
    const selected = this.files.find((f) => f.path === this.selected);
    const tab = (id, label, count) => h_flex().id(`git-tab-${id}`).h(26).px(9).gap(6).items_center().rounded(6).text_size(12).cursor_pointer()
      .bg(this.view === id ? t.selected : t.chrome).text_color(this.view === id ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .on_click(() => {
        this.view = id; this.confirm = null;
        if (id === "history" && this.log.length && !this.commit) {
          const context = this.context;
          cx.spawn(async (cx) => { try { await this.loadCommit(this.log[0].hash, context); } catch (e) { this.note = String(e); } cx.notify(); });
        }
        cx.notify();
      }).child(label).when(count > 0, (el) => el.child(div().text_size(10).text_color(t.dim).child(String(count))));

    const fileRow = (f) => h_flex().id(`git-file-${f.path}`).h(27).flex_none().px(8).gap(7).items_center().rounded(6).cursor_pointer()
      .when(this.selected === f.path, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click(() => this.pick(f.path, cx))
      .child(div().w(12).text_size(11).text_color(f.conflict ? t.ansi1 : f.letter === "A" ? t.ansi2 : f.letter === "D" ? t.ansi1 : t.blocked).child(f.letter))
      .child(div().flex_1().min_w(0).truncate().child(f.path))
      .when(f.staged, (el) => el.child(div().text_size(9).px(4).py(1).rounded(3).bg(t.ansi2 + "22").text_color(t.ansi2).child("staged")))
      .when(f.add > 0, (el) => el.child(div().text_size(10).text_color(t.ansi2).child(`+${f.add}`)))
      .when(f.del > 0, (el) => el.child(div().text_size(10).text_color(t.ansi1).child(`−${f.del}`)));

    const notice = this.confirm ? h_flex().flex_none().px(10).py(6).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(11).text_color(t.blocked).child(this.confirm.kind === "discardAll" ? "Discard every tracked change? This cannot be undone." : `Discard changes in ${this.confirm.path}?`))
      .child(this.gitButton("git-confirm", "Discard", () => this.confirm.kind === "discardAll" ? this.discardAllNow(cx) : this.discardNow(this.files.find((f) => f.path === this.confirm.path), cx), "blocked"))
      .child(this.gitButton("git-cancel", "Cancel", () => { this.confirm = null; cx.notify(); })) : null;

    let content;
    if (this.view === "changes") {
      content = v_flex().flex_1().min_h(0)
        .child(h_flex().flex_none().px(10).py(5).gap(8).items_center().border_b(1).border_color(t.border)
          .child(div().text_size(11).text_color(t.dim).child(`${staged.length} staged · ${changed.length} changed`))
          .child(div().flex_1())
          .child(this.gitButton("git-stage-all", "Stage all", () => this.stageAll(cx), "accent", this.files.length > 0))
          .child(this.gitButton("git-unstage-all", "Unstage all", () => this.unstageAll(cx), "muted", staged.length > 0))
          .child(this.gitButton("git-discard-all", "Discard all", () => this.discardAll(cx), "muted", this.files.length > 0)))
        .child(div().flex_1().min_h(0).max_h(220).relative()
          .child(v_flex().id("git-files").absolute().inset_0().overflow_y_scroll().p(5).gap(1)
            .when(this.files.length === 0, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Reading the repository…" : this.root ? "No uncommitted changes" : "No folder"))))
            .when(staged.length > 0, (el) => el.child(div().px(6).pt(4).pb(2).text_size(10).text_color(t.dim).child("STAGED")))
            .children(staged.map(fileRow))
            .when(changed.length > 0, (el) => el.child(div().px(6).pt(6).pb(2).text_size(10).text_color(t.dim).child("CHANGES")))
            .children(changed.map(fileRow)))
          .child(Scrollbar.vertical("git-files").absolute().inset_0()))
        .when(Boolean(selected), (el) => el.child(h_flex().flex_none().px(10).py(4).gap(6).items_center().border_t(1).border_b(1).border_color(t.border)
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(selected.path))
          .child(this.gitButton("git-stage", "Stage", () => this.stage(selected, cx), "muted", selected.unstaged))
          .child(this.gitButton("git-unstage", "Unstage", () => this.unstage(selected, cx), "muted", selected.staged))
          .child(this.gitButton("git-open", "Open", () => run("tab.new", { name: selected.path.split("/").pop(), mod: "editor", props: { path: join(this.root, selected.path), cwd: this.root, on: this.on } }), "muted"))
          .child(this.gitButton("git-discard", "Discard", () => this.discard(selected, cx), "blocked"))))
        .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(size)
          .child(div().id("git-diff-x").size_full().overflow_x_scrollbar()
            .child(div().w_full().min_w(Math.max(300, this.longest * charWidth(size) + 40)).h_full().child(v_virtual_list("git-diff", this.diff.length, rowHeight(size), (i) => String(i),
              (range) => this.diff.slice(range.start, range.end).map((line) => this.diffLine(line, t, size))).size_full())))
          .child(Scrollbar.vertical("git-diff").viewport_from_layout().absolute().inset_0()))
        .child(h_flex().flex_none().p(8).gap(7).items_center().border_t(1).border_color(t.border)
          .child(div().text_size(10.5).text_color(this.amend ? t.accent : t.dim).cursor_pointer().px(5).py(3).rounded(5).hover((s) => s.bg(t.hover)).on_click(() => { this.amend = !this.amend; cx.notify(); }).child("Amend"))
          .child(div().id("git-message").flex_1().min_w(0).h(30).px(9).flex().items_center().rounded(7).border_1().border_color(this.typing === "message" ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.message).h_full().text_size(12).text_color(t.foreground)))
          .child(this.gitButton("git-commit", this.busy ? "Working…" : "Commit", () => this.doCommit(cx), "accent", Boolean(this.text?.trim()) && staged.length > 0 && !this.busy)));
    } else if (this.view === "history") {
      content = v_flex().flex_1().min_h(0)
        .child(h_flex().flex_none().px(10).py(5).gap(8).items_center().border_b(1).border_color(t.border)
          .child(div().text_size(11).text_color(t.dim).child(`${this.log.length} commits`)).child(div().flex_1())
          .child(this.gitButton("git-refresh", "Refresh", () => this.refresh(cx))))
        .child(div().flex_none().max_h(190).min_h(0).relative()
          .child(v_flex().id("git-log").absolute().inset_0().overflow_y_scroll().p(5).gap(1)
            .when(this.log.length === 0, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Reading history…" : "No commits"))))
            .children(this.log.map((c) => h_flex().id(`git-log-${c.hash}`).h(27).flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer()
              .when(this.commit?.hash === c.hash, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
              .on_click(() => { this.commit = c; const context = this.context; cx.spawn(async (cx) => { try { await this.loadCommit(c.hash, context); } catch (e) { this.note = String(e); } cx.notify(); }); cx.notify(); })
              .child(div().w(58).flex_none().text_size(10.5).text_color(t.accent).child(c.hash))
              .child(div().flex_1().min_w(0).truncate().child(c.subject))
              .child(div().max_w(110).flex_none().truncate().text_size(10).text_color(t.dim).child(c.author))
              .child(div().w(72).flex_none().text_right().text_size(10).text_color(t.dim).child(c.date)))))
          .child(Scrollbar.vertical("git-log").absolute().inset_0()))
        .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(size)
          .child(div().id("git-show-x").size_full().overflow_x_scrollbar()
            .child(div().w_full().min_w(Math.max(300, this.longest * charWidth(size) + 40)).h_full().child(v_virtual_list("git-show", this.diff.length, rowHeight(size), (i) => String(i),
              (range) => this.diff.slice(range.start, range.end).map((line) => this.diffLine(line, t, size))).size_full())))
          .child(Scrollbar.vertical("git-show").viewport_from_layout().absolute().inset_0()));
    } else {
      content = v_flex().flex_1().min_h(0)
        .child(h_flex().flex_none().px(10).py(6).gap(8).items_center().border_b(1).border_color(t.border)
          .child(div().flex_1().text_size(11).text_color(t.dim).child(`${this.branches.length} local branches`))
          .child(this.gitButton("git-new-branch", "New branch", () => { this.creatingBranch = true; this.branchInput.focus(); cx.notify(); }, "accent")))
        .when(this.creatingBranch, (el) => el.child(h_flex().flex_none().px(10).py(7).gap(7).items_center().border_b(1).border_color(t.border)
          .child(h_flex().flex_1().h(30).px(9).rounded(7).border_1().border_color(t.accent).bg(t.background).child(Input.new(this.branchInput).flex_1().h_full().text_size(12).text_color(t.foreground)))
          .child(this.gitButton("git-create-branch", "Create", () => this.createBranch(cx), "accent"))
          .child(this.gitButton("git-cancel-branch", "Cancel", () => { this.creatingBranch = false; cx.notify(); }))))
        .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(5).gap(1)
          .children(this.branches.map((name) => h_flex().h(29).px(9).gap(8).items_center().rounded(6).cursor_pointer()
            .when(name === this.branch, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
            .on_click(() => this.switchBranch(name, cx))
            .child(svg("mods/workspace-chrome/git-branch.svg").size(13).text_color(name === this.branch ? t.accent : t.muted))
            .child(div().flex_1().truncate().child(name))
            .when(name === this.branch, (el) => el.child(div().text_size(10).text_color(t.accent).child("current"))))));
    }

    return v_flex().id("bubble-git").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && (this.confirm || this.creatingBranch)) {
          this.confirm = null; this.creatingBranch = false; cx.stop_propagation(); cx.notify();
        }
      })
      .child(h_flex().h(40).flex_none().px(11).gap(7).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/workspace-chrome/git-branch.svg").size(14).text_color(t.accent))
        .child(div().font_semibold().child("Git"))
        .child(div().id("git-branch").px(6).py(2).rounded(5).bg(t.raised).text_size(11).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => { this.view = "branches"; this.pickingBranch = true; cx.notify(); }).child(this.branch || "no branch"))
        .child(div().flex_1())
        .child(this.gitButton("git-fetch", "Fetch", () => this.run(["fetch", "--all", "--prune"], cx, { note: "Fetched" }), "muted", Boolean(this.root)))
        .child(this.gitButton("git-pull", "Pull", () => this.run(["pull", "--ff-only"], cx, { note: "Pulled" }), "muted", Boolean(this.root)))
        .child(this.gitButton("git-push", "Push", () => this.run(["push"], cx, { note: "Pushed" }), "accent", Boolean(this.root)))
        .child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(t.dim).when(this.busy, (el) => el.spin(900))))
      .child(h_flex().h(32).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border)
        .child(tab("changes", "Changes", this.files.length))
        .child(tab("history", "History", 0))
        .child(tab("branches", "Branches", 0))
        .child(div().flex_1())
        .when(this.limited, (el) => el.child(div().text_size(10).text_color(t.dim).child("first 1,000 files"))))
      .when(Boolean(notice), (el) => el.child(notice))
      .child(content)
      .when(Boolean(this.note), (el) => el.child(h_flex().flex_none().px(10).py(5).gap(6).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(11).text_color(t.muted).child(this.note))
        .child(this.gitButton("git-note-close", "Dismiss", () => { this.note = ""; cx.notify(); }))));
  }
}
