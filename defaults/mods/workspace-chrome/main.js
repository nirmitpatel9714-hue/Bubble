import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, openOverlay } from "bubble";

// The panels of the sidebar's "panel-body" stack, as names for the footer row.
const PANELS = { files: "Files", changes: "Changes", agents: "Agents", git: "Git", diagnostics: "Problems", preview: "Preview", ai: "AI" };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 300) : window()?.platform === "macos" ? 76 : 44 });
}

// The top bar is optional (Settings → Tabs): on, the shown space's tabs sit in
// a bar over the work area, with the window buttons in it; off, the sidebar's
// tab list holds the tabs and this row holds the buttons. The two are layout
// nodes, so hide the one that isn't showing and show the other.
function syncTopBar() {
  const root = layout();
  const bar = find(root, "top-bar");
  if (!bar) return false;
  const want = shared("workspace.top_bar") === true;
  // The layout leaves `hidden: false` out, so a shown node has no key at all.
  if (Boolean(bar.hidden) === want) run(want ? "layout.show" : "layout.hide", { id: "top-bar" });
  const list = find(root, "tab-list");
  if (list && Boolean(list.hidden) !== want) run(want ? "layout.hide" : "layout.show", { id: "tab-list" });
  // A bar that is up right now holds the window buttons, as the status bar says.
  return want || !bar.hidden;
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  // The window's buttons, where a title bar's sit: the end of this row. A rail
  // (under 160 px) has no room for them, and the top bar draws them when it is
  // on: the status bar keeps them reachable then. A press is the button's, not
  // the window's (this row drags it). macOS keeps its traffic lights.
  windowButtons(width, topBar) {
    const w = window();
    if (!w?.buttons || w.platform === "macos" || topBar || width < 160) return null;
    return h_flex().gap(2).items_center()
      .child(this.button("title-min", svg("mods/tabs/win-min.svg").size(15), () => run("window.minimize")))
      .child(this.button("title-max", svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(15), () => run("window.maximize")))
      .child(this.button("title-close", svg("mods/tabs/win-close.svg").size(15), () => run("window.close")));
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
      const open = panel && !panel.hidden ? body?.active ?? null : null;
      // The panels' menu: it sits above Settings, where the top bar used to be.
      const panelRow = () => h_flex().id("panel-picker").h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip("Panels"))
        .text_color(open ? t.foreground : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(() => openOverlay({ mod: "panel-menu", kind: "popup", width: 236 }))
        .child(svg("mods/workspace-chrome/panel-right.svg").size(14).text_color(open ? t.accent : t.muted))
        .when(!collapsed, el => el.child(div().flex_1().child(PANELS[open] ?? "Panels")))
        .when(!collapsed, el => el.child(svg("mods/workspace-chrome/chevron-down.svg").size(11).text_color(t.dim)));
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      const ready = div().size(6).rounded_full().bg(t.accent);
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0).items_center())
        .child(panelRow())
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    const topBar = syncTopBar();
    // Room for the name and the search button next to the window's buttons.
    const width = find(layout(), "sidebar")?.size?.px ?? Infinity;
    const buttons = this.windowButtons(width, topBar);
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      // The name steps aside before the buttons do when the sidebar is narrow.
      .when(!collapsed, el => el.child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .when(width >= 240, g => g.child(image("frame/welcome/bubble.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Bubble")))))
      .when(!collapsed && width >= 220, el => el.child(this.button("search", svg("mods/workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/workspace-chrome/sidebar.svg").size(15), toggleSidebar)))
      .when(Boolean(buttons), el => el.child(buttons));
  }
}
