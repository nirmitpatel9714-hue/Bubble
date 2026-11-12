import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { displayAgent } from "@/modules/agents/lib/format";
import {
  normalizeCustomCodingAgents,
  type CustomCodingAgent,
} from "@/modules/agents/lib/launcher";
import type {
  AgentNotification,
  AgentStatus,
} from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  DashboardSquare01Icon,
  Loading03Icon,
  Notification03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useReducer, useState } from "react";

type Props = {
  onActivate: (tabId: number, leafId: number) => void;
  onActivateLocal: () => void;
  /** False while the sidebar is collapsed; suppresses read-marking. */
  visible: boolean;
  onOpenDashboard: () => void;
};

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function waitingFor(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function StatusRow({
  agent,
  name,
  status,
  attentionSince,
  onClick,
}: {
  agent: string;
  name: string;
  status: AgentStatus;
  attentionSince: number | null;
  onClick: () => void;
}) {
  const waiting = status === "waiting";
  const elapsed = waitingFor(attentionSince);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <AgentIcon
        agent={agent}
        size={16}
        className="shrink-0 text-muted-foreground"
      />
      <span className="flex-1 truncate text-sm text-foreground">{name}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs",
          waiting ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        {waiting ? <span className="size-1.5 rounded-full bg-primary" /> : null}
        {waiting ? `waiting${elapsed ? ` · ${elapsed}` : ""}` : "working"}
      </span>
    </button>
  );
}

const NOTIF_LABEL: Record<AgentNotification["kind"], string> = {
  attention: "needs input",
  finished: "finished",
  error: "failed",
};

const HOOK_AGENTS = ["claude", "codex", "gemini", "pi"] as const;
/** Built-ins without notification hooks; the process scanner finds these. */
const SCANNED_AGENTS = ["opencode", "grok"] as const;

function HookAgentRow({
  id,
  label,
  ready,
  installing,
  onEnable,
}: {
  id: string;
  label: string;
  ready: boolean;
  installing: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <AgentIcon
        agent={id}
        size={14}
        className="shrink-0 text-muted-foreground"
      />
      <span className="flex-1 truncate text-[12px] text-muted-foreground">
        {label}
      </span>
      {ready ? (
        <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={13}
            strokeWidth={1.75}
          />
          enabled
        </span>
      ) : (
        <button
          type="button"
          onClick={onEnable}
          disabled={installing}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {installing ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={12}
              strokeWidth={1.75}
              className="animate-spin"
            />
          ) : null}
          {installing ? "Enabling" : "Enable"}
        </button>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onClick,
}: {
  n: AgentNotification;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {n.kind === "finished" ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={15}
            strokeWidth={1.75}
            className="text-muted-foreground"
          />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full",
              n.kind === "error" ? "bg-destructive" : "bg-primary",
            )}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {displayAgent(n.agent)}{" "}
        <span className="text-muted-foreground">{NOTIF_LABEL[n.kind]}</span>
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {relativeTime(n.at)}
      </span>
    </button>
  );
}

export function HerdrPanel({
  onActivate,
  onActivateLocal,
  visible,
  onOpenDashboard,
}: Props) {
  const [hooks, setHooks] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const sessions = useAgentStore((s) => s.sessions);
  const detected = useAgentStore((s) => s.detected);
  const localAgent = useAgentStore((s) => s.localAgent);
  const notifications = useAgentStore((s) => s.notifications);
  const markAllRead = useAgentStore((s) => s.markAllRead);
  const clearNotifications = useAgentStore((s) => s.clearNotifications);
  const customAgents = usePreferencesStore((s) => s.customCodingAgents);

  const customs: CustomCodingAgent[] = useMemo(
    () => normalizeCustomCodingAgents(customAgents),
    [customAgents],
  );
  const agentName = (agent: string): string =>
    customs.find((c) => c.id === agent)?.name ?? displayAgent(agent);

  const active = useMemo(() => Object.values(sessions), [sessions]);
  const detectedList = useMemo(
    () => Object.values(detected).sort((a, b) => a.since - b.since),
    [detected],
  );
  const activeCount = active.length + (localAgent ? 1 : 0);
  const waitingCount =
    active.filter((s) => s.status === "waiting").length +
    (localAgent?.status === "waiting" ? 1 : 0);
  const enabledCount = HOOK_AGENTS.filter((id) => hooks[id] === true).length;

  // Re-render every second while someone waits, so the elapsed timer moves.
  const [, tick] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (!visible || waitingCount === 0) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [visible, waitingCount, tick]);

  useEffect(() => {
    if (!visible) return;
    // Viewing the herder counts as reading the alerts.
    markAllRead();
    let cancelled = false;
    for (const id of HOOK_AGENTS) {
      invoke<boolean>("agent_hooks_status", { agent: id })
        .then((ok) => {
          if (!cancelled) setHooks((h) => ({ ...h, [id]: ok }));
        })
        .catch(() => {
          if (!cancelled) setHooks((h) => ({ ...h, [id]: false }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [visible, markAllRead]);

  const enableHooks = async (id: string) => {
    setInstalling(id);
    try {
      await invoke("agent_enable_hooks", { agent: id });
      setHooks((h) => ({ ...h, [id]: true }));
    } catch {
      setHooks((h) => ({ ...h, [id]: false }));
    } finally {
      setInstalling(null);
    }
  };

  const activateNotification = (n: AgentNotification) => {
    if (n.source === "local") onActivateLocal();
    else onActivate(n.tabId, n.leafId);
  };

  const empty =
    activeCount === 0 &&
    detectedList.length === 0 &&
    notifications.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] text-foreground">Herdr</span>
        <div className="ml-auto flex items-center gap-1">
          {activeCount > 0 ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {activeCount} active
            </span>
          ) : null}
          <button
            type="button"
            onClick={onOpenDashboard}
            title="Open agent dashboard"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon
              icon={DashboardSquare01Icon}
              size={14}
              strokeWidth={1.75}
            />
          </button>
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={clearNotifications}
              className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {empty ? (
        <div className="mx-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          No agent activity yet.
          <br />
          Launch a coding agent or chat with LosOS to track it here.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {localAgent ? (
            <StatusRow
              agent={localAgent.agent}
              name={agentName(localAgent.agent)}
              status={localAgent.status}
              attentionSince={null}
              onClick={onActivateLocal}
            />
          ) : null}
          {active.map((s) => (
            <StatusRow
              key={s.leafId}
              agent={s.agent}
              name={agentName(s.agent)}
              status={s.status}
              attentionSince={s.attentionSince}
              onClick={() => onActivate(s.tabId, s.leafId)}
            />
          ))}
          {detectedList.map((d) => (
            <StatusRow
              key={d.leafId}
              agent={d.agent}
              name={agentName(d.agent)}
              status="working"
              attentionSince={null}
              onClick={() => onActivate(d.tabId, d.leafId)}
            />
          ))}
          {activeCount > 0 && notifications.length > 0 ? (
            <div className="mx-2 my-1 h-px bg-border/50" />
          ) : null}
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onClick={() => activateNotification(n)}
            />
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-border/60 p-1">
        <button
          type="button"
          onClick={() => setAlertsOpen((v) => !v)}
          aria-expanded={alertsOpen}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={Notification03Icon} size={11} strokeWidth={2} />
          Agent alerts
          <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">
            {enabledCount > 0 ? (
              <span className="text-[10px] text-muted-foreground/60">
                {enabledCount} on
              </span>
            ) : null}
            <HugeiconsIcon
              icon={alertsOpen ? ArrowUp01Icon : ArrowDown01Icon}
              size={13}
              strokeWidth={2}
            />
          </span>
        </button>
        {alertsOpen
          ? HOOK_AGENTS.map((id) => (
              <HookAgentRow
                key={id}
                id={id}
                label={displayAgent(id)}
                ready={hooks[id] === true}
                installing={installing === id}
                onEnable={() => enableHooks(id)}
              />
            ))
          : null}
        {alertsOpen ? (
          <>
            <div className="mx-2 my-1 h-px bg-border/50" />
            {SCANNED_AGENTS.map((id) => (
              <div key={id} className="flex items-center gap-2 px-2 py-1">
                <AgentIcon
                  agent={id}
                  size={14}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="flex-1 truncate text-[12px] text-muted-foreground">
                  {displayAgent(id)}
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  auto-detected
                </span>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
