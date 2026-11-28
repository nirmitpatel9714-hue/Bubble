// The panel menu: Home, then one row for each panel the layout offers. Opened
// as a popup by the sidebar footer (and by the tabs bar in bar layouts); the
// panels themselves live in the sidebar's "panel-body" stack ("panel" holds it).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, shared, layout } from "bubble";

// The panels of the layout's "panel-body" stack, in menu order.
const PANELS = [
  { id: "files", title: "Files", icon: "mods/files/file.svg" },
  { id: "changes", title: "Changes", icon: "mods/changes/changes.svg" },
  // Agents is always listed: it may predate a saved "workspace.panels".
  { id: "agents", title: "Agents", icon: "mods/workspace-chrome/agents.svg", always: true },
  { id: "git", title: "Git", icon: "mods/workspace-chrome/git-branch.svg" },
  { id: "diagnostics", title: "Problems", icon: "mods/workspace-chrome/circle-check.svg" },
  { id: "preview", title: "Preview", icon: "mods/workspace-chrome/monitor.svg" },
  { id: "ai", title: "AI", icon: "mods/workspace-chrome/layers.svg" },
];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class PanelMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  // Home first, then the panels: the open one is marked, the rest open it.
  items() {
    const root = layout();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    const open = panel && !panel.hidden ? body?.active ?? null : null;
    return [
      { id: "home", title: "Home", icon: "mods/workspace-chrome/home.svg", on: !panel || panel.hidden },
      ...PANELS.filter((p) => p.always || enabled.includes(p.id)).map((p) => ({ ...p, on: open === p.id })),
    ];
  }

  choose(it) {
    closeOverlay(props()?.overlay);
    if (!it) return;
    // Home, or the panel already open: the sidebar goes back to the tabs.
    if (it.id === "home" || it.on) run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: it.id });
      run("layout.show", { id: "panel" });
    }
    run("layout.show", { id: "sidebar" });
  }

  render(cx) {
    const t = theme();
    const list = this.items();
    return v_flex()
      .id("panel-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(list[this.at]);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(
        list.map((it, i) =>
          v_flex()
            .when(i === 1, (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(
              h_flex()
                .id(`pm-${it.id}`)
                .h(31)
                .px(8)
                .gap(9)
                .rounded(7)
                .items_center()
                .text_color(t.foreground)
                .when(i === this.at, (el) => el.bg(t.selected))
                .hover((s) => s.bg(t.hover))
                .on_click(() => this.choose(it))
                .child(svg(it.icon).size(14).flex_none().text_color(it.on ? t.accent : t.muted))
                .child(div().flex_1().child(it.title))
                .when(it.on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(13).flex_none().text_color(t.accent))),
            ),
        ),
      );
  }
}
