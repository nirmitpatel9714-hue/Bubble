import { cn } from "@/lib/utils";
import type { Tab } from "@/modules/tabs";
import { useMemo } from "react";
import { accentFor } from "./lib/spaceColor";
import { useSpaces } from "./lib/useSpaces";

type Props = {
  tabs: Tab[];
};

/**
 * tuios-style workspace strip: one numbered pill per workspace with its open
 * window count. The active workspace expands to show its name; clicking a
 * number switches to it. Management (rename, reorder, delete) stays in the
 * switcher popover next to the strip.
 */
export function WorkspacesBar({ tabs }: Props) {
  const spaces = useSpaces((s) => s.spaces);
  const activeId = useSpaces((s) => s.activeId);
  const setActive = useSpaces((s) => s.setActive);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tabs) m.set(t.spaceId, (m.get(t.spaceId) ?? 0) + 1);
    return m;
  }, [tabs]);

  if (spaces.length === 0) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg bg-foreground/[0.035] p-0.5 ring-1 ring-inset ring-foreground/[0.05]">
      {spaces.map((space, index) => {
        const active = space.id === activeId;
        const count = counts.get(space.id) ?? 0;
        const noun = count === 1 ? "window" : "windows";
        return (
          <button
            key={space.id}
            type="button"
            onClick={() => setActive(space.id)}
            aria-label={`Workspace ${index + 1}: ${space.name}, ${count} ${noun}`}
            aria-current={active ? "true" : undefined}
            title={`Workspace ${index + 1}: ${space.name} · ${count} ${noun}`}
            className={cn(
              "flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-inset ring-border/50"
                : "text-muted-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground",
            )}
          >
            <span
              className="font-semibold leading-none"
              style={active ? { color: accentFor(space) } : undefined}
            >
              {index + 1}
            </span>
            {active ? (
              <span className="max-w-28 truncate font-medium leading-none">
                {space.name}
              </span>
            ) : null}
            {count > 0 ? (
              <span
                className={cn(
                  "rounded-[4px] px-1 py-px text-[9px] font-medium leading-none",
                  active
                    ? "bg-foreground/[0.06] text-muted-foreground"
                    : "bg-foreground/[0.04] text-muted-foreground/60",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
