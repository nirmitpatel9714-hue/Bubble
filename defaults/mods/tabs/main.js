// The window's tab bar: tabs as pills with a + menu, and the panel menu.
// In a layout that puts tabs in a sidebar instead, the same mod is given
// `props().list`: the shown space's tabs as a list, still with the + menu.
// `props().tabs === false` leaves the pills out of the bar (they are drawn
// elsewhere), keeping the panel menu and window buttons there.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, props } from "bubble";

// The panels the layout's "panel-body" stack offers, for the menu button's label.
const PANELS = [
  { id: "files", title: "Files", icon: "mods/files/file.svg" },
  { id: "changes", title: "Changes", icon: "mods/changes/changes.svg" },
  { id: "agents", title: "Agents", icon: "mods/workspace-chrome/agents.svg" },
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

// Same as the agents mod: drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A tab Bubble named (unnamed, or after its program) follows its agent's live
// title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.listScroll = ScrollHandle.new();
    this.listAt = -1;
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
  }

  // One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
  // small events per gesture: a short swipe or one smoothed notch (about
  // 25 px) switches one tab, a longer swipe keeps going a tab per 60 px, at
  // most one every 100 ms so each shows.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    // Phases often arrive only as moves (a macOS touchpad included): a pause
    // or a turn starts a new gesture.
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // The open panel is remembered per space, and it covers the whole sidebar:
  // the spaces and tab list step aside while one is open, and come back when
  // it closes.
  syncPanelState(space, panel, body, enabled) {
    this.syncPanel(space, panel, body, enabled);
    const lists = find(layout(), "sidebar-lists");
    if (panel && lists && Boolean(lists.hidden) !== !panel.hidden) {
      run(panel.hidden ? "layout.show" : "layout.hide", { id: "sidebar-lists" });
    }
  }

  render() {
    return props()?.list ? this.sidebarTabs() : this.bar();
  }

  // The space's tabs as a list in a sidebar block, with the + menu above them.
  sidebarTabs() {
    const t = theme();
    const collapsed = narrow();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const root = layout();
    this.syncPanelState(space, find(root, "panel"), find(root, "panel-body"), shared("workspace.panels") ?? ["files", "changes"]);
    const active = shown.findIndex(tab => tab.active);
    if (active !== this.listAt) {
      this.listAt = active;
      if (active >= 0) this.listScroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stopPropagation();
    const menu = (c) => openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } });
    const pick = (i, c) => {
      const from = this.pressed;
      this.pressed = null;
      if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
      else run("tab.select", { id: c.id });
    };
    const row = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      const glyph = Boolean(program?.icon)
        ? (program.tint ? svg(program.icon).size(14).flex_none().text_color(t.muted) : image(program.icon).size(14))
        : null;
      if (collapsed) {
        return h_flex().id(`tab-${c.id}`).h(30).w(32).flex_none().rounded(6).justify_center().items_center()
          .bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted).tooltip(name)
          .hover(s => s.bg(t.hover))
          .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
          .on_mouse_up("left", () => pick(i, c))
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(c); })
          .child(glyph ?? div().text_size(12).child(name.slice(0, 1).toUpperCase()));
      }
      return h_flex().id(`tab-${c.id}`).h(30).flex_none().px(8).gap(7).items_center().rounded(7).text_size(12.5)
        .bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => pick(i, c))
        .on_mouse_down("right", (_e, cx) => { cx.stopPropagation(); menu(c); })
        .when(Boolean(glyph), el => el.child(glyph))
        .child(div().flex_1().min_w(0).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).flex_none().rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).flex_none().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
          .child(svg("mods/pane/close.svg").size(12))));
    };
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).flex_none().items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Tabs"))
        .child(div().id("tab-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
          .child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).gap(1).overflow_y_scrollbar().mode("always").track_scroll(this.listScroll)
        .when(collapsed, el => el.items_center())
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        // A block above growing, or the window resizing, can push the shown tab out.
        .on_size_change((_size, cx) => { if (this.listAt >= 0) { this.listScroll.scroll_to_item(this.listAt); cx.notify(); } })
        .when(!shown.length, el => el.child(div().px(8).py(6).text_size(12).text_color(t.dim).child("No tabs yet.")))
        .children(shown.map(row)));
  }

  bar() {
    const t = theme();
    const strip = props()?.tabs !== false;
    const space = spaces().find(p => p.active);
    const shown = strip ? space?.tabs ?? [] : [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stopPropagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const program = lead?.program;
      const name = label(c, lead);
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stopPropagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stopPropagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanelState(space, panel, body, enabled);
    // One menu for Home and the panels, so the bar stays short: it shows the
    // open panel's icon and name, or "Panels" when none is open.
    const panelMenu = () => {
      const open = panel && !panel.hidden ? body?.active ?? null : null;
      const current = PANELS.find(p => p.id === open);
      return h_flex().id("panel-menu").h(26).pl(8).pr(6).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(open ? t.selected : t.chrome).text_color(open ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).tooltip("Home, Files, Git, Agents and the other panels")
        .on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "panel-menu", kind: "popup", width: 236 }))
        .child(svg(current?.icon ?? "mods/workspace-chrome/panel-right.svg").size(14))
        .child(current?.title ?? "Panels")
        .child(svg("mods/workspace-chrome/chevron-down.svg").size(11).text_color(t.dim));
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .when(strip, el => el.child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item))))
      .when(!strip, el => el.child(div().flex_1().min_w(0).h_full()))
      .when(strip, el => el.child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))))
      .when(Boolean(panel), el => el.child(panelMenu()))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize"))))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close")));
  }
}
