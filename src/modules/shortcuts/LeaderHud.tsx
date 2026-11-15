import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useEffect, useMemo, useState } from "react";
import { useLeaderMode } from "./lib/leaderMode";
import {
  getBindingTokens,
  getLeaderChordTokens,
  SHORTCUT_GROUPS,
  SHORTCUTS,
} from "./shortcuts";

/** Wait before showing the menu, so quick leader chords never flash it. */
const LEADER_HUD_DELAY_MS = 750;

type LeaderEntry = {
  id: string;
  label: string;
  chords: string[];
};

type LeaderGroup = {
  group: string;
  entries: LeaderEntry[];
};

/** Bottom menu shown while the leader waits for its chord. */
export function LeaderHud() {
  const active = useLeaderMode((s) => s.active);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const leaderKey = usePreferencesStore((s) => s.leaderKey);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), LEADER_HUD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const groups = useMemo<LeaderGroup[]>(
    () =>
      SHORTCUT_GROUPS.flatMap((group) => {
        const entries = SHORTCUTS.filter((s) => s.group === group).flatMap(
          (shortcut): LeaderEntry[] => {
            const bindings = (
              userShortcuts[shortcut.id] ?? shortcut.defaultBindings
            ).filter((binding) => binding.leader);
            if (bindings.length === 0) return [];
            return [
              {
                id: shortcut.id,
                label: shortcut.label,
                chords: bindings.map((binding) =>
                  getLeaderChordTokens(binding).join(" "),
                ),
              },
            ];
          },
        );
        return entries.length > 0 ? [{ group, entries }] : [];
      }),
    [userShortcuts],
  );

  if (!active || !visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        data-leader-hud
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex h-[50vh] w-[75vh] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border/60 bg-popover/90 p-3 text-[11px] shadow-xl backdrop-blur-md"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 pb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <KbdGroup>
              {getBindingTokens(leaderKey).map((token) => (
                <Kbd key={token}>{token}</Kbd>
              ))}
            </KbdGroup>
            <span>Leader</span>
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
            <Kbd>Esc</Kbd>
            <span>Cancel</span>
          </span>
        </div>

        <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 content-start gap-x-5 gap-y-2.5 overflow-y-auto pr-1 lg:grid-cols-3">
          {groups.map((group) => (
            <section key={group.group} className="flex flex-col gap-1">
              <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.group}
              </h3>
              {group.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-muted-foreground">
                    {entry.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {entry.chords.map((chord) => (
                      <Kbd key={`${entry.id}-${chord}`}>{chord}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
