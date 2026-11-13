import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import {
  AGENT_LAUNCHERS,
  type AgentInstanceCount,
  type AgentLaunchRequest,
  type AgentLauncher,
  type CustomCodingAgent,
  customAgentLauncher,
  findAgentLauncher,
  normalizeAgentLaunchCommands,
  validateAgentLaunchCommand,
} from "@/modules/agents/lib/launcher";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAgentLaunchCommands,
  setCustomCodingAgents,
} from "@/modules/settings/store";
import {
  ArrowLeft01Icon,
  PlayIcon,
  Refresh01Icon,
  Settings01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  onBack: () => void;
  onLaunch: (request: AgentLaunchRequest) => void;
};

const INSTANCE_COUNTS: AgentInstanceCount[] = [1, 2, 3, 4];

function commandsFor(
  customAgents: CustomCodingAgent[],
): Record<string, string> {
  return Object.fromEntries(
    customAgents.map((agent) => [agent.id, agent.command]),
  );
}

export function AgentLauncherPanel({ onBack, onLaunch }: Props) {
  const storedCommands = usePreferencesStore((s) => s.agentLaunchCommands);
  const addedAgents = usePreferencesStore((s) => s.addedAgents);
  const customAgents = usePreferencesStore((s) => s.customCodingAgents);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [instances, setInstances] = useState<AgentInstanceCount>(2);
  const [drafts, setDrafts] = useState<Record<string, string>>(storedCommands);
  const hydratedRef = useRef(hydrated);
  const persistedRef = useRef<Record<string, string>>(storedCommands);
  const agents: AgentLauncher[] = [
    ...AGENT_LAUNCHERS.filter((agent) => addedAgents.includes(agent.id)),
    ...customAgents.map(customAgentLauncher),
  ];
  const selected =
    agentId && agents.some((agent) => agent.id === agentId)
      ? agentId
      : (agents[0]?.id ?? null);
  const command = selected ? (drafts[selected] ?? "") : "";
  const validation = validateAgentLaunchCommand(command);
  const launcher = selected ? findAgentLauncher(selected, customAgents) : null;

  useEffect(() => {
    if (!hydrated || hydratedRef.current) return;
    hydratedRef.current = true;
    persistedRef.current = storedCommands;
    setDrafts({ ...storedCommands, ...commandsFor(customAgents) });
  }, [hydrated, storedCommands, customAgents]);

  // Keep custom agents (edited in Settings) in sync while the panel is open.
  useEffect(() => {
    if (!hydrated) return;
    setDrafts((current) => ({ ...current, ...commandsFor(customAgents) }));
  }, [customAgents, hydrated]);

  const save = (next: Record<string, string>) => {
    const changed = AGENT_LAUNCHERS.some(
      ({ id }) => next[id] !== persistedRef.current[id],
    );
    if (!changed) return;
    const previous = persistedRef.current;
    persistedRef.current = next;
    void setAgentLaunchCommands(normalizeAgentLaunchCommands(next)).catch(
      (error) => {
        persistedRef.current = previous;
        console.error("[losos] failed to save agent launch commands:", error);
      },
    );
  };

  const persist = (
    id: string,
    value: string,
  ): Record<string, string> | null => {
    const result = validateAgentLaunchCommand(value);
    if (!result.ok) return null;
    const next = { ...drafts, [id]: result.command };
    setDrafts(next);
    const custom = customAgents.find((agent) => agent.id === id);
    if (custom) {
      // Custom agents store their command in the agent definition itself.
      if (custom.command !== result.command) {
        const updated = customAgents.map((agent) =>
          agent.id === id ? { ...agent, command: result.command } : agent,
        );
        void setCustomCodingAgents(updated).catch((error) => {
          console.error("[losos] failed to save custom agent command:", error);
        });
      }
    } else {
      save(next);
    }
    return next;
  };

  const selectAgent = (id: string) => {
    if (selected) persist(selected, command);
    setAgentId(id);
  };

  const resetCommand = () => {
    if (!selected || !launcher) return;
    persist(selected, launcher.defaultCommand);
  };

  const submit = () => {
    if (!selected) return;
    const next = persist(selected, command);
    if (!next) return;
    onLaunch({
      agent: selected,
      command: next[selected],
      instances,
    });
  };

  return (
    <form
      className="animate-in fade-in-0 slide-in-from-right-2 duration-150"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex h-9 items-center gap-2 px-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-md text-muted-foreground"
          onClick={onBack}
          aria-label="Back to new window menu"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
        </Button>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            Launch agents
          </div>
          <div className="text-[10px] text-muted-foreground">
            One workspace, up to four panes
          </div>
        </div>
      </div>

      {hydrated && agents.length === 0 ? (
        <div className="mt-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-5 text-center">
          <HugeiconsIcon
            icon={UserMultiple02Icon}
            size={20}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium">No agents added</span>
            <span className="text-[10.5px] text-muted-foreground">
              Add coding agents in Settings to launch them here.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void openSettingsWindow("agents")}
          >
            <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={1.75} />
            Open Settings
          </Button>
        </div>
      ) : agents.length > 0 ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-1 border-t border-border/60 pt-1.5">
            {agents.map((agent) => {
              const isSelected = agent.id === selected;
              return (
                <button
                  key={agent.id}
                  type="button"
                  disabled={!hydrated}
                  aria-pressed={isSelected}
                  onClick={() => selectAgent(agent.id)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50",
                    isSelected
                      ? "border-primary/35 bg-primary/10 text-foreground"
                      : "border-transparent bg-foreground/[0.035] text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <AgentIcon
                    agent={agent.id}
                    size={16}
                    className={cn(
                      "shrink-0",
                      isSelected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate text-xs font-medium">
                    {agent.label}
                  </span>
                </button>
              );
            })}
          </div>

          <fieldset className="mt-3">
            <legend className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Instances
            </legend>
            <div className="grid grid-cols-4 gap-1">
              {INSTANCE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={!hydrated}
                  aria-label={`${count} ${count === 1 ? "instance" : "instances"}`}
                  aria-pressed={instances === count}
                  onClick={() => setInstances(count)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50",
                    instances === count
                      ? "border-primary/35 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/30 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <PaneGlyph count={count} />
                  {count}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center">
              <label
                htmlFor="agent-start-command"
                className="text-[11px] font-medium text-muted-foreground"
              >
                Start command
              </label>
              <button
                type="button"
                onClick={resetCommand}
                disabled={
                  !hydrated || !selected || command === launcher?.defaultCommand
                }
                className="ml-auto flex items-center gap-1 rounded-md px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                title={
                  launcher ? `Reset to ${launcher.defaultCommand}` : undefined
                }
              >
                <HugeiconsIcon
                  icon={Refresh01Icon}
                  size={11}
                  strokeWidth={1.75}
                />
                Reset
              </button>
            </div>
            <Input
              id="agent-start-command"
              disabled={!hydrated}
              value={command}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!validation.ok}
              onChange={(event) => {
                if (!selected) return;
                const id = selected;
                setDrafts((current) => ({
                  ...current,
                  [id]: event.target.value,
                }));
              }}
              onBlur={() => {
                if (selected) persist(selected, command);
              }}
              className="h-8 rounded-xl bg-input/40 px-2.5 font-mono text-xs"
              placeholder={launcher?.defaultCommand ?? ""}
            />
            <div
              className={cn(
                "mt-1 min-h-4 text-[10px]",
                validation.ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {validation.ok
                ? "Aliases and flags are supported."
                : validation.error}
            </div>
          </div>

          <Button
            type="submit"
            size="sm"
            className="mt-1 w-full rounded-xl"
            disabled={!hydrated || !validation.ok || !selected}
          >
            <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
            Launch {instances} {instances === 1 ? "agent" : "agents"}
          </Button>
        </>
      ) : null}
    </form>
  );
}

function PaneGlyph({ count }: { count: AgentInstanceCount }) {
  const cell = "rounded-[1px] bg-current opacity-75";
  if (count === 1) {
    return (
      <span className="grid size-3 grid-cols-1 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cell} />
      </span>
    );
  }
  if (count === 2) {
    return (
      <span className="grid size-3 grid-cols-2 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cell} />
        <span className={cell} />
      </span>
    );
  }
  if (count === 3) {
    return (
      <span className="grid size-3 grid-cols-2 grid-rows-2 gap-px rounded-[2px] border border-current/50 p-px">
        <span className={cn(cell, "row-span-2")} />
        <span className={cell} />
        <span className={cell} />
      </span>
    );
  }
  return (
    <span className="grid size-3 grid-cols-2 grid-rows-2 gap-px rounded-[2px] border border-current/50 p-px">
      <span className={cell} />
      <span className={cell} />
      <span className={cell} />
      <span className={cell} />
    </span>
  );
}
