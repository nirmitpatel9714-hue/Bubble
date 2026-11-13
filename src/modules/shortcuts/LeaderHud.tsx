import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  getLeaderChordTokens,
  SHORTCUTS,
  type ShortcutId,
} from "./shortcuts";
import { useLeaderMode } from "./lib/leaderMode";

const HINTS: readonly { id: ShortcutId; label: string }[] = [
  { id: "tiling.toggle", label: "Tile" },
  { id: "tab.new", label: "New" },
  { id: "tab.close", label: "Close" },
  { id: "tab.prev", label: "Prev window" },
  { id: "tab.next", label: "Next window" },
  { id: "space.prev", label: "Prev workspace" },
  { id: "space.next", label: "Next workspace" },
  { id: "commandPalette.open", label: "Palette" },
];

/** Bottom pill shown while the leader waits for its chord. */
export function LeaderHud() {
  const active = useLeaderMode((s) => s.active);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const leaderKey = usePreferencesStore((s) => s.leaderKey);

  if (!active) return null;

  const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));
  const hints = HINTS.flatMap(({ id, label }) => {
    const shortcut = byId.get(id);
    const binding = (userShortcuts[id] ?? shortcut?.defaultBindings ?? []).find(
      (candidate) => candidate.leader,
    );
    if (!binding) return [];
    return [{ id, label, tokens: getLeaderChordTokens(binding) }];
  });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border border-border/60 bg-popover/90 px-3 py-2 text-[11px] shadow-xl backdrop-blur-md"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <KbdGroup>
            {getBindingTokens(leaderKey).map((token) => (
              <Kbd key={token}>{token}</Kbd>
            ))}
          </KbdGroup>
          <span>Leader</span>
        </span>
        <span aria-hidden className="h-3.5 w-px bg-border" />
        {hints.map((hint) => (
          <span
            key={hint.id}
            className="flex items-center gap-1 whitespace-nowrap text-muted-foreground"
          >
            <Kbd>{hint.tokens.join(" ")}</Kbd>
            <span>{hint.label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
          <Kbd>Esc</Kbd>
          <span>Cancel</span>
        </span>
      </div>
    </div>
  );
}
