import { cn } from "@/lib/utils";
import { resolveFontFamily } from "@/lib/fonts";
import { requestAgentScan } from "@/modules/agents";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { displayAgent } from "@/modules/agents/lib/format";
import { normalizeCustomCodingAgents } from "@/modules/agents/lib/launcher";
import type { AgentStatus, DetectedAgent } from "@/modules/agents/lib/types";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  ArrowRight01Icon,
  Refresh01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { leafBufferText, leafCwd, submitToLeaf } from "@/modules/terminal";
import { useTerminalFont } from "@/modules/terminal/lib/useTerminalFont";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

type Activate = (tabId: number, leafId: number) => void;

type Props = {
  onActivate: Activate;
  onActivateLocal: () => void;
};

/** One selectable row, whichever tracking path found the agent. */
type DashboardRow = {
  key: string;
  leafId: number;
  tabId: number;
  agent: string;
  name: string;
  status: AgentStatus;
  attentionSince: number | null;
  since: number;
  /** The LosOS chat agent has no terminal pane to preview. */
  local: boolean;
};

const PREVIEW_LINES = 400;
const PREVIEW_REFRESH_MS = 1_000;

function elapsedSince(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function cwdTail(cwd: string | null): string | null {
  if (!cwd) return null;
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || cwd;
}

/**
 * The agent dashboard: every running coding agent in one view, with a live
 * peek at the selected agent's terminal and a way to type into it — the
 * workmux dashboard pattern, built on LosOS panes.
 */
export function AgentDashboard({ onActivate, onActivateLocal }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const detected = useAgentStore((s) => s.detected);
  const localAgent = useAgentStore((s) => s.localAgent);
  const customAgents = usePreferencesStore((s) => s.customCodingAgents);
  const font = useTerminalFont();

  const [selectedLeaf, setSelectedLeaf] = useState<number | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [draft, setDraft] = useState("");
  const previewRef = useRef<HTMLPreElement>(null);
  // Re-render every second so the elapsed labels keep moving.
  const [, tick] = useReducer((count: number) => count + 1, 0);

  const agentNames = useMemo(() => {
    const customs = normalizeCustomCodingAgents(customAgents);
    return (agent: string): string =>
      customs.find((c) => c.id === agent)?.name ?? displayAgent(agent);
  }, [customAgents]);

  const rows = useMemo<DashboardRow[]>(() => {
    const list: DashboardRow[] = [];
    if (localAgent) {
      list.push({
        key: "local",
        leafId: -1,
        tabId: -1,
        agent: localAgent.agent,
        name: agentNames(localAgent.agent),
        status: localAgent.status,
        attentionSince: null,
        since: 0,
        local: true,
      });
    }
    for (const s of Object.values(sessions)) {
      list.push({
        key: `s${s.leafId}`,
        leafId: s.leafId,
        tabId: s.tabId,
        agent: s.agent,
        name: agentNames(s.agent),
        status: s.status,
        attentionSince: s.attentionSince,
        since: s.startedAt,
        local: false,
      });
    }
    for (const d of Object.values(detected)) {
      list.push(dashboardRowFromDetected(d, agentNames));
    }
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "waiting" ? -1 : 1;
      return a.since - b.since;
    });
  }, [sessions, detected, localAgent, agentNames]);

  // Keep something selected: the user's pick, else the first row.
  const selected =
    rows.find((r) => r.leafId === selectedLeaf) ?? rows[0] ?? null;
  const previewLeaf =
    selected && !selected.local && selected.leafId >= 0
      ? selected.leafId
      : null;

  // Poll the selected pane's buffer for the live preview.
  useEffect(() => {
    if (previewLeaf === null) {
      setPreview("");
      return;
    }
    let cancelled = false;
    const read = () => {
      const text = leafBufferText(previewLeaf, PREVIEW_LINES);
      if (!cancelled && text !== null) {
        setPreview((prev) => (prev === text ? prev : text));
      }
    };
    read();
    const timer = window.setInterval(read, PREVIEW_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [previewLeaf]);

  // Keep the preview pinned to the bottom, like a terminal.
  useEffect(() => {
    const node = previewRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [preview]);

  useEffect(() => {
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [tick]);

  const jumpTo = (row: DashboardRow) => {
    if (row.local) onActivateLocal();
    else onActivate(row.tabId, row.leafId);
  };

  const selectRow = (row: DashboardRow, event: MouseEvent) => {
    if (row.local || event.detail === 0) return;
    setSelectedLeaf(row.leafId);
  };

  const sendDraft = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || previewLeaf === null) return;
    submitToLeaf(previewLeaf, text);
    setDraft("");
  };

  /** Re-runs detection now and re-reads the preview immediately. */
  const refresh = () => {
    requestAgentScan();
    if (previewLeaf !== null) {
      const text = leafBufferText(previewLeaf, PREVIEW_LINES);
      if (text !== null) setPreview(text);
    }
    tick();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] text-foreground">Agents</span>
        {rows.length > 0 ? (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {rows.length} running
          </span>
        ) : null}
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={13} strokeWidth={2} />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="mx-2 rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          No agents running.
          <br />
          Launch one from the + menu to track it here.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Agent list */}
          <div className="min-h-0 w-64 shrink-0 overflow-y-auto border-r border-border/60 p-1">
            {rows.map((row) => (
              <AgentListRow
                key={row.key}
                row={row}
                selected={selected?.key === row.key}
                onSelect={selectRow}
                onJump={() => jumpTo(row)}
              />
            ))}
          </div>

          {/* Live preview */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
                  <AgentIcon
                    agent={selected.agent}
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {selected.name}
                  </span>
                  <StatusChip status={selected.status} />
                  <span className="truncate text-[10px] text-muted-foreground">
                    {cwdTail(leafCwd(previewLeaf ?? -1)) ??
                      (selected.local ? "AI chat" : "")}
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpTo(selected)}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={13}
                      strokeWidth={1.75}
                    />
                    Go to pane
                  </button>
                </div>
                {selected.local ? (
                  <div className="flex flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-muted-foreground">
                    The LosOS agent runs in the AI chat panel.
                  </div>
                ) : (
                  <>
                    <pre
                      ref={previewRef}
                      style={{
                        fontFamily: resolveFontFamily(font.fontFamily),
                        fontWeight: font.fontWeight,
                      }}
                      className="min-h-0 flex-1 overflow-auto px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90"
                    >
                      {preview || "Waiting for output…"}
                    </pre>
                    <form
                      onSubmit={sendDraft}
                      className="flex shrink-0 items-center gap-1.5 border-t border-border/60 p-2"
                    >
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={`Type to ${selected.name}…`}
                        className="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/30"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        title="Send to agent"
                        className="flex shrink-0 items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        <HugeiconsIcon
                          icon={SentIcon}
                          size={14}
                          strokeWidth={1.75}
                        />
                      </button>
                    </form>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function dashboardRowFromDetected(
  d: DetectedAgent,
  agentNames: (agent: string) => string,
): DashboardRow {
  return {
    key: `d${d.leafId}`,
    leafId: d.leafId,
    tabId: d.tabId,
    agent: d.agent,
    name: agentNames(d.agent),
    status: "working",
    attentionSince: null,
    since: d.since,
    local: false,
  };
}

function AgentListRow({
  row,
  selected,
  onSelect,
  onJump,
}: {
  row: DashboardRow;
  selected: boolean;
  onSelect: (row: DashboardRow, event: MouseEvent) => void;
  onJump: () => void;
}) {
  const cwd = row.local ? null : cwdTail(leafCwd(row.leafId));
  const waiting = row.status === "waiting";
  return (
    <button
      type="button"
      onClick={(event) => onSelect(row, event)}
      onDoubleClick={onJump}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <AgentIcon
        agent={row.agent}
        size={16}
        className="shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {row.name}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {cwd ?? (row.local ? "AI chat" : "terminal")}
        </span>
      </span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-[10px]",
          waiting ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        {waiting ? <span className="size-1.5 rounded-full bg-primary" /> : null}
        {waiting ? "waiting" : "working"}
        {!row.local ? (
          <span className="tabular-nums text-muted-foreground/70">
            {elapsedSince(row.since)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function StatusChip({ status }: { status: AgentStatus }) {
  const waiting = status === "waiting";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
        waiting
          ? "bg-primary/10 font-medium text-primary"
          : "bg-accent text-muted-foreground",
      )}
    >
      {waiting ? <span className="size-1.5 rounded-full bg-primary" /> : null}
      {waiting ? "waiting" : "working"}
    </span>
  );
}
