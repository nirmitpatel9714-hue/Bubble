import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

/** Parent folder of a file path, tolerating Windows and POSIX separators. */
function parentDirectory(path: string): string | null {
  if (!path) return null;
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return null;
  // Keep the separator for roots: "C:\file" -> "C:\".
  if (cut === 2 && /^[A-Za-z]:/.test(trimmed)) return trimmed.slice(0, 3);
  if (cut === 0) return trimmed.slice(0, 1);
  return trimmed.slice(0, cut);
}

/** The folder a file-backed tab points at, if it has one. */
export function tabDirectory(tab: Tab | undefined): string | null {
  if (!tab) return null;
  switch (tab.kind) {
    case "editor":
    case "markdown":
    case "ai-diff":
    case "git-diff":
    case "git-commit-file":
      return parentDirectory(tab.path);
    case "git-history":
      return tab.repoRoot;
    default:
      return null;
  }
}

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
  followActiveTab = false,
): Result {
  const lastTerminalCwd = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) {
      lastTerminalCwd.current = activeTab.cwd;
    }
  }, [activeTab]);

  const explorerRoot = useMemo<string | null>(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    if (followActiveTab) {
      const directory = tabDirectory(activeTab);
      if (directory) return directory;
    }
    if (lastTerminalCwd.current) return lastTerminalCwd.current;
    const anyTerm = tabs.find((t) => t.kind === "terminal" && t.cwd);
    if (anyTerm?.kind === "terminal" && anyTerm.cwd) return anyTerm.cwd;
    return home;
  }, [activeTab, tabs, home, followActiveTab]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    // Editor tabs inherit the last terminal's cwd (or workspace home), not
    // the file's folder — opening a new terminal from a file shouldn't
    // hijack the user's working directory context.
    return lastTerminalCwd.current ?? home ?? undefined;
  }, [activeTab, home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
