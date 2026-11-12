import type { Tab } from "@/modules/tabs";
import { hasLeaf, leafIdForPty } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { allAgentCommandSpecs, matchAgentProcess } from "../lib/detectAgents";
import { normalizeCustomCodingAgents } from "../lib/launcher";
import { useAgentStore } from "../store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

type ScanProcess = { pid: number; name: string };
type ScanSession = {
  id: number;
  pane: number | null;
  processes: ScanProcess[];
};

/** How often the pane process trees are sampled. */
const SCAN_INTERVAL_MS = 2_000;
/** The dashboard's refresh button asks for an immediate scan through this. */
const SCAN_REQUEST_EVENT = "losos:agent-scan";

/**
 * Runs one detection pass over every open terminal's process tree: matches
 * descendant process names against the known agent commands and reconciles
 * the hookless `detected` entries. Signal-managed panes (hooks or the OSC
 * detector) always win: their session keeps the richer waiting/working state.
 */
export async function runAgentScan(tabs: Tab[]): Promise<void> {
  const sessions = await invoke<ScanSession[]>("pty_foreground_processes");
  const prefs = usePreferencesStore.getState();
  const specs = allAgentCommandSpecs(
    prefs.agentLaunchCommands,
    normalizeCustomCodingAgents(prefs.customCodingAgents),
  );
  const store = useAgentStore.getState();
  const wanted = new Map<number, { tabId: number; agent: string }>();

  for (const session of sessions) {
    const leafId = session.pane ?? leafIdForPty(session.id);
    if (leafId === null || store.sessions[leafId]) continue;
    const agent = matchAgentProcess(
      session.processes.map((p) => p.name),
      specs,
    );
    if (!agent) continue;
    const tab = tabs.find(
      (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
    );
    if (!tab || tab.kind !== "terminal") continue;
    wanted.set(leafId, { tabId: tab.id, agent });
  }

  for (const [leafId, entry] of wanted) {
    store.upsertDetected({
      leafId,
      tabId: entry.tabId,
      agent: entry.agent,
      since: Date.now(),
    });
  }
  for (const leafId of Object.keys(store.detected).map(Number)) {
    if (!wanted.has(leafId)) store.removeDetected(leafId);
  }
}

/** Asks the scan bridge for an immediate detection pass. */
export function requestAgentScan(): void {
  window.dispatchEvent(new Event(SCAN_REQUEST_EVENT));
}

/**
 * Detects coding agents that no signal path reports — user-defined agents and
 * hookless launches — by polling the backend's per-pane process trees.
 */
export function AgentScanBridge({ tabs }: { tabs: Tab[] }) {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let running = false;

    const runOnce = async () => {
      if (running) return;
      running = true;
      try {
        await runAgentScan(tabsRef.current);
      } catch {
        // Backend gone (window closing, dev reload): keep last known state.
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        void runOnce().finally(schedule);
      }, SCAN_INTERVAL_MS);
    };

    window.addEventListener(SCAN_REQUEST_EVENT, runOnce);
    schedule();
    return () => {
      disposed = true;
      window.removeEventListener(SCAN_REQUEST_EVENT, runOnce);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
