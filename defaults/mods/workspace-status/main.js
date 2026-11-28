import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, layout } from "bubble";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class WorkspaceStatus extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  // The window's buttons live where a title bar's do: the end of the sidebar's
  // top row, or the top bar when it is on. A rail has no title row, and a
  // hidden sidebar has none either, so the status bar keeps them reachable
  // then. macOS keeps its traffic lights.
  controls(t) {
    const w = window();
    if (!w?.buttons || w.platform === "macos") return null;
    const root = layout();
    const bar = find(root, "top-bar");
    if (bar && !bar.hidden) return null;
    const side = find(root, "sidebar");
    if (side && !side.hidden && (side.size?.px ?? Infinity) >= 160) return null;
    const button = (id, icon, action) => div().id(id).size(24).rounded(5).flex().items_center().justify_center().text_color(t.dim)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(svg(`mods/tabs/${icon}.svg`).size(14));
    return h_flex().gap(2).items_center()
      .child(button("minimize", "win-min", () => run("window.minimize")))
      .child(button("maximize", w.maximized ? "win-restore" : "win-max", () => run("window.maximize")))
      .child(button("close-window", "win-close", () => run("window.close")));
  }

  render() {
    const t = theme();
    const controls = this.controls(t);
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} ${list.length === 1 ? "agent" : "agents"}`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} ${needs === 1 ? "needs" : "need"} you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)))
      .when(Boolean(controls), el => el.child(controls));
  }
}
