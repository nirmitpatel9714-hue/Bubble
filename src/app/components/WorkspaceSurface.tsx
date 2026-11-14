import { cn } from "@/lib/utils";
import { AiDiffStack, EditorStack, GitDiffStack } from "@/modules/editor";
import { GitHistoryStack } from "@/modules/git-history";
import { MarkdownStack } from "@/modules/markdown";
import { PreviewStack } from "@/modules/preview";
import { labelFor, type Tab, TabIcon } from "@/modules/tabs";
import { TerminalStack } from "@/modules/terminal";
import type { ComponentProps, CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type TerminalStackProps = ComponentProps<typeof TerminalStack>;
type EditorStackProps = ComponentProps<typeof EditorStack>;
type PreviewStackProps = ComponentProps<typeof PreviewStack>;
type AiDiffStackProps = ComponentProps<typeof AiDiffStack>;
type GitHistoryStackProps = ComponentProps<typeof GitHistoryStack>;

type Props = {
  tabs: Tab[];
  activeId: number;
  activeTab: Tab | undefined;
  /** Activate a tiled column that the pointer lands on. */
  onActivateTab: (id: number) => void;
  /** Resize a tiled column's pixel width (undefined resets to default). */
  onResizeTab?: (id: number, width: number | undefined) => void;
  registerTerminalHandle: TerminalStackProps["registerHandle"];
  onSearchReady: TerminalStackProps["onSearchReady"];
  onCwd: TerminalStackProps["onCwd"];
  onExit: TerminalStackProps["onExit"];
  onFocusLeaf: TerminalStackProps["onFocusLeaf"];
  registerEditorHandle: EditorStackProps["registerHandle"];
  onEditorDirtyChange: EditorStackProps["onDirtyChange"];
  onEditorCloseTab: EditorStackProps["onCloseTab"];
  registerPreviewHandle: PreviewStackProps["registerHandle"];
  onPreviewUrlChange: PreviewStackProps["onUrlChange"];
  onAiDiffAccept: AiDiffStackProps["onAccept"];
  onAiDiffReject: AiDiffStackProps["onReject"];
  onOpenCommitFile: GitHistoryStackProps["onOpenCommitFile"];
  onGitHistorySearchHandle: GitHistoryStackProps["onSearchHandle"];
  onSetMarkdownView: EditorStackProps["onSetMarkdownView"];
};

const LAYER = "absolute inset-0";

type SurfaceProps = Omit<Props, "onActivateTab" | "onResizeTab"> & {
  /** This surface is the app-active window (tiled columns can be inactive). */
  active?: boolean;
};

/**
 * Stacks every tab-kind surface absolutely on top of each other and toggles
 * visibility off the active tab, so panes keep their mounted state (terminal
 * buffers, editor scroll, ...) when switching tabs.
 *
 * Layers sit flush inside the workspace pane; only the terminal layer is inset,
 * because the terminal draws glyphs right up to its container edge.
 */
function TabSurface({
  tabs,
  activeId,
  activeTab,
  active = true,
  registerTerminalHandle,
  onSearchReady,
  onCwd,
  onExit,
  onFocusLeaf,
  registerEditorHandle,
  onEditorDirtyChange,
  onEditorCloseTab,
  registerPreviewHandle,
  onPreviewUrlChange,
  onAiDiffAccept,
  onAiDiffReject,
  onOpenCommitFile,
  onGitHistorySearchHandle,
  onSetMarkdownView,
}: SurfaceProps) {
  const kind = activeTab?.kind;
  const isTerminalTab = kind === "terminal";
  const isEditorTab = kind === "editor";
  const isPreviewTab = kind === "preview";
  const isMarkdownTab = kind === "markdown";
  const isAiDiffTab = kind === "ai-diff";
  const isGitDiffTab = kind === "git-diff" || kind === "git-commit-file";
  const isGitHistoryTab = kind === "git-history";

  return (
    <div className="relative h-full min-h-0">
      <div
        className={cn(
          LAYER,
          "px-3 pt-2 pb-2",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={tabs}
          activeId={activeId}
          active={active}
          registerHandle={registerTerminalHandle}
          onSearchReady={onSearchReady}
          onCwd={onCwd}
          onExit={onExit}
          onFocusLeaf={onFocusLeaf}
        />
      </div>
      <div
        className={cn(LAYER, !isEditorTab && "invisible pointer-events-none")}
        aria-hidden={!isEditorTab}
      >
        <EditorStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerEditorHandle}
          onDirtyChange={onEditorDirtyChange}
          onCloseTab={onEditorCloseTab}
          onSetMarkdownView={onSetMarkdownView}
        />
      </div>
      <div
        className={cn(LAYER, !isPreviewTab && "invisible pointer-events-none")}
        aria-hidden={!isPreviewTab}
      >
        <PreviewStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerPreviewHandle}
          onUrlChange={onPreviewUrlChange}
        />
      </div>
      <div
        className={cn(LAYER, !isMarkdownTab && "invisible pointer-events-none")}
        aria-hidden={!isMarkdownTab}
      >
        <MarkdownStack
          tabs={tabs}
          activeId={activeId}
          onSetMarkdownView={onSetMarkdownView}
        />
      </div>
      <div
        className={cn(LAYER, !isAiDiffTab && "invisible pointer-events-none")}
        aria-hidden={!isAiDiffTab}
      >
        <AiDiffStack
          tabs={tabs}
          activeId={activeId}
          onAccept={onAiDiffAccept}
          onReject={onAiDiffReject}
        />
      </div>
      <div
        className={cn(LAYER, !isGitDiffTab && "invisible pointer-events-none")}
        aria-hidden={!isGitDiffTab}
      >
        <GitDiffStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          LAYER,
          !isGitHistoryTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitHistoryTab}
      >
        <GitHistoryStack
          tabs={tabs}
          activeId={activeId}
          onOpenCommitFile={onOpenCommitFile}
          onSearchHandle={onGitHistorySearchHandle}
        />
      </div>
    </div>
  );
}

/**
 * The workspace surface. Normally every tab is stacked and the active one is
 * visible. When the active tab is tiled, its workspace's tiled tabs render as
 * niri-style scrolling columns: the active column is always smoothly scrolled
 * into the center of the viewport, matching niri's focused-window behavior.
 * All other tabs stay mounted in a hidden surface so terminal sessions and
 * editor state survive the switch.
 */
export function WorkspaceSurface({
  tabs,
  activeId,
  activeTab,
  onActivateTab,
  onResizeTab,
  ...surface
}: Props) {
  const tiled =
    activeTab?.tiled === true
      ? tabs.filter((t) => t.tiled && t.spaceId === activeTab.spaceId)
      : [];

  if (tiled.length === 0) {
    return (
      <TabSurface
        tabs={tabs}
        activeId={activeId}
        activeTab={activeTab}
        {...surface}
      />
    );
  }

  const tiledIds = new Set(tiled.map((t) => t.id));
  const parked = tabs.filter((t) => !tiledIds.has(t.id));

  return (
    <NiriTiledLayout
      tiled={tiled}
      parked={parked}
      activeId={activeId}
      onActivateTab={onActivateTab}
      onResizeTab={onResizeTab}
      surface={surface}
    />
  );
}

type NiriTiledLayoutProps = {
  tiled: Tab[];
  parked: Tab[];
  activeId: number;
  onActivateTab: (id: number) => void;
  onResizeTab?: (id: number, width: number | undefined) => void;
  surface: Omit<Props, "tabs" | "activeId" | "activeTab" | "onActivateTab" | "onResizeTab">;
};

/**
 * Niri-style tiling: a horizontally scrollable row of equal-width columns.
 * Whenever the active column changes it is smoothly scrolled to the center of
 * the viewport, so there's always context visible on both sides — exactly how
 * niri (the Wayland compositor) handles its scrollable tiling layout.
 */
function NiriTiledLayout({
  tiled,
  parked,
  activeId,
  onActivateTab,
  onResizeTab,
  surface,
}: NiriTiledLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{
    tabId: number;
    startWidth: number;
    startX: number;
    edge: "left" | "right";
    currentWidth: number;
  } | null>(null);
  const resizingRef = useRef(resizing);
  resizingRef.current = resizing;

  // When only one tiled tab exists without a custom width, render it full-width
  const single = tiled.length === 1;
  const isSingleUncustomized = single && tiled[0]?.tiledWidth === undefined;

  const startResize = useCallback(
    (tabId: number, e: React.PointerEvent, edge: "left" | "right") => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const el = scrollRef.current?.querySelector<HTMLElement>(
        `[data-tiled-tab="${tabId}"]`,
      );
      if (!el) return;
      const startWidth = el.getBoundingClientRect().width;
      const startX = e.clientX;

      setResizing({
        tabId,
        startWidth,
        startX,
        edge,
        currentWidth: startWidth,
      });
    },
    [],
  );

  useEffect(() => {
    if (!resizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const cur = resizingRef.current;
      if (!cur) return;
      const delta =
        cur.edge === "right"
          ? e.clientX - cur.startX
          : cur.startX - e.clientX;
      const minWidth = 280;
      const containerW =
        scrollRef.current?.clientWidth ?? window.innerWidth;
      const maxWidth = Math.max(minWidth, containerW - 40);
      const nextWidth = Math.round(
        Math.max(minWidth, Math.min(maxWidth, cur.startWidth + delta)),
      );
      setResizing((prev) =>
        prev ? { ...prev, currentWidth: nextWidth } : null,
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      const cur = resizingRef.current;
      if (!cur) return;
      const delta =
        cur.edge === "right"
          ? e.clientX - cur.startX
          : cur.startX - e.clientX;
      const minWidth = 280;
      const containerW =
        scrollRef.current?.clientWidth ?? window.innerWidth;
      const maxWidth = Math.max(minWidth, containerW - 40);
      const finalWidth = Math.round(
        Math.max(minWidth, Math.min(maxWidth, cur.startWidth + delta)),
      );
      onResizeTab?.(cur.tabId, finalWidth);
      setResizing(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [resizing !== null, onResizeTab]);

  // Scroll the active column to the center of the viewport whenever activeId
  // changes — this is the core niri-style behavior.
  useEffect(() => {
    if (resizing) return;
    if (isSingleUncustomized) return;
    const container = scrollRef.current;
    if (!container) return;

    const activeEl = container.querySelector<HTMLElement>(
      `[data-tiled-tab="${activeId}"]`,
    );
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();

    // Target scroll position that centers the active column.
    const elCenter = activeEl.offsetLeft + elRect.width / 2;
    const containerCenter = containerRect.width / 2;
    const targetScroll = elCenter - containerCenter;

    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [activeId, isSingleUncustomized, resizing]);

  const firstColWidth =
    resizing?.tabId === tiled[0]?.id
      ? `${resizing.currentWidth}px`
      : tiled[0]?.tiledWidth !== undefined
        ? `${tiled[0].tiledWidth}px`
        : "var(--tiled-column-width)";

  const lastColWidth =
    resizing?.tabId === tiled[tiled.length - 1]?.id
      ? `${resizing.currentWidth}px`
      : tiled[tiled.length - 1]?.tiledWidth !== undefined
        ? `${tiled[tiled.length - 1].tiledWidth}px`
        : "var(--tiled-column-width)";

  return (
    <div className="relative h-full min-h-0">
      {resizing && (
        <div
          className="fixed inset-0 z-50 cursor-col-resize select-none"
          style={{ userSelect: "none" }}
        />
      )}
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center min-h-0 gap-1.5 scroll-smooth",
          isSingleUncustomized ? "overflow-hidden" : "overflow-x-auto",
        )}
        style={
          {
            scrollbarWidth: "none",
            height: "100%",
            "--tiled-column-width": "clamp(320px, 60vw, 720px)",
          } as CSSProperties
        }
      >
        {!isSingleUncustomized && <NiriEdgeSpacer width={firstColWidth} />}
        {tiled.map((tab) => {
          const isActive = tab.id === activeId;
          const isBeingResized = resizing?.tabId === tab.id;
          const widthStyle = isBeingResized
            ? `${resizing.currentWidth}px`
            : tab.tiledWidth !== undefined
              ? `${tab.tiledWidth}px`
              : single
                ? "100%"
                : "var(--tiled-column-width)";

          return (
            <div
              key={tab.id}
              data-tiled-tab={tab.id}
              data-active={isActive}
              onPointerDown={() => {
                if (!isActive) onActivateTab(tab.id);
              }}
              className={cn(
                "group/column relative shrink-0 overflow-hidden rounded-lg border bg-background/40",
                isBeingResized ? "transition-none select-none" : "transition-colors",
                isActive ? "border-primary/50" : "border-border/40",
              )}
              style={{
                width: widthStyle,
                height: isSingleUncustomized ? "100%" : "calc(100% - 40px)",
              }}
            >
              {tab.cold ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                  <TabIcon tab={tab} />
                  <span className="max-w-full truncate text-xs text-muted-foreground">
                    {labelFor(tab)}
                  </span>
                  <span className="text-[10px] tracking-wide text-muted-foreground/60 uppercase">
                    Click to load
                  </span>
                </div>
              ) : (
                <TabSurface
                  tabs={[tab]}
                  activeId={tab.id}
                  activeTab={tab}
                  active={isActive}
                  {...surface}
                />
              )}

              {/* Left resize handle */}
              <div
                role="separator"
                aria-orientation="vertical"
                title="Drag to resize column (double-click to reset)"
                onPointerDown={(e) => startResize(tab.id, e, "left")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onResizeTab?.(tab.id, undefined);
                }}
                className="group/handle absolute inset-y-0 left-0 z-30 flex w-2.5 -translate-x-1 cursor-col-resize items-center justify-center select-none"
              >
                <div className="h-8 w-1 rounded-full bg-border/40 opacity-0 transition-all group-hover/column:opacity-70 group-hover/handle:opacity-100 group-hover/handle:bg-primary group-active/handle:bg-primary" />
              </div>

              {/* Right resize handle */}
              <div
                role="separator"
                aria-orientation="vertical"
                title="Drag to resize column (double-click to reset)"
                onPointerDown={(e) => startResize(tab.id, e, "right")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onResizeTab?.(tab.id, undefined);
                }}
                className="group/handle absolute inset-y-0 right-0 z-30 flex w-2.5 translate-x-1 cursor-col-resize items-center justify-center select-none"
              >
                <div className="h-8 w-1 rounded-full bg-border/40 opacity-0 transition-all group-hover/column:opacity-70 group-hover/handle:opacity-100 group-hover/handle:bg-primary group-active/handle:bg-primary" />
              </div>
            </div>
          );
        })}
        {!isSingleUncustomized && <NiriEdgeSpacer width={lastColWidth} />}
      </div>
      {parked.length > 0 && (
        <div
          className="pointer-events-none invisible absolute inset-0"
          aria-hidden
        >
          <TabSurface
            tabs={parked}
            activeId={activeId}
            activeTab={undefined}
            active={false}
            {...surface}
          />
        </div>
      )}
    </div>
  );
}

function NiriEdgeSpacer({ width }: { width?: string }) {
  return (
    <div
      className="shrink-0"
      style={{ width: `calc(50% - (${width ?? "var(--tiled-column-width)"}) / 2)` }}
      aria-hidden
    />
  );
}
