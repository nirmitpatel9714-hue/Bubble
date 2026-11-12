import type { AgentsTab, Tab } from "@/modules/tabs";
import { AgentDashboard } from "./AgentDashboard";

type Props = {
  tabs: Tab[];
  activeId: number;
  onActivate: (tabId: number, leafId: number) => void;
  onActivateLocal: () => void;
};

/**
 * Mounts the dashboard while an agents tab exists in this window and keeps it
 * alive across tab switches, so the selection and preview survive a peek at
 * the terminal — the same pattern the other tab-kind stacks use.
 */
export function AgentDashboardStack({
  tabs,
  activeId,
  onActivate,
  onActivateLocal,
}: Props) {
  const exists = tabs.some((t) => t.kind === "agents");
  const active = tabs.find(
    (t): t is AgentsTab => t.kind === "agents" && t.id === activeId,
  );
  if (!exists) return null;
  return (
    <div
      className={active ? "h-full min-h-0" : "h-full min-h-0 invisible"}
      aria-hidden={!active}
    >
      <AgentDashboard
        onActivate={onActivate}
        onActivateLocal={onActivateLocal}
      />
    </div>
  );
}
