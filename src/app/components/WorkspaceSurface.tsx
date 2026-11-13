import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { AiDiffStack, EditorStack, GitDiffStack } from "@/modules/editor";
import { GitHistoryStack } from "@/modules/git-history";
import { MarkdownStack } from "@/modules/markdown";
import { PreviewStack } from "@/modules/preview";
import { labelFor, TabIcon, type Tab } from "@/modules/tabs";
import { TerminalStack } from "@/modules/terminal";

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

type SurfaceProps = Omit<Props, "onActivateTab"> & {
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
 * equal-width niri-style columns instead; all other tabs stay mounted in a
 * hidden surface so terminal sessions and editor state survive the switch.
 */
export function WorkspaceSurface({
  tabs,
  activeId,
  activeTab,
  onActivateTab,
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
    <div className="relative h-full min-h-0">
      <div className="flex h-full min-h-0 gap-1.5 overflow-x-auto">
        {tiled.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tiled-tab={tab.id}
              data-active={isActive}
              onPointerDown={() => {
                if (!isActive) onActivateTab(tab.id);
              }}
              className={cn(
                "relative h-full min-w-[280px] flex-1 basis-0 overflow-hidden rounded-lg border bg-background/40 transition-colors",
                isActive ? "border-primary/50" : "border-border/40",
              )}
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
            </div>
          );
        })}
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
