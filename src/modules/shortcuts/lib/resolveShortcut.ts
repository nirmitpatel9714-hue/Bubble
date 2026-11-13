import {
  type KeyBinding,
  matchBinding,
  matchLeaderChord,
  type Shortcut,
  type ShortcutId,
} from "../shortcuts";

export type ShortcutMode = "direct" | "leader";

export type ResolveShortcutOptions = {
  readonly shortcuts: readonly Shortcut[];
  readonly user: Partial<Record<ShortcutId, KeyBinding[]>>;
  /** The host switches a shortcut off for this event (it falls through to the next match). */
  readonly isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
  readonly hasHandler: (id: ShortcutId) => boolean;
  /** `direct` matches single chords; `leader` matches keys after the leader press. */
  readonly mode?: ShortcutMode;
};

/**
 * Recorded characters take priority over defaults, in registry order. A disabled match
 * is skipped, not final: a later shortcut may share the binding (leader+K
 * clears a focused terminal and opens the palette elsewhere). An enabled match
 * without a handler ends the search.
 */
export function resolveShortcut(
  e: KeyboardEvent,
  {
    shortcuts,
    user,
    isDisabled,
    hasHandler,
    mode = "direct",
  }: ResolveShortcutOptions,
): ShortcutId | null {
  const wantsLeader = mode === "leader";
  for (const recorded of [true, false]) {
    for (const s of shortcuts) {
      if ((user[s.id] !== undefined) !== recorded) continue;
      if (e.repeat && !s.allowRepeat) continue;
      const bindings = user[s.id] ?? s.defaultBindings;
      if (
        !bindings.some((b) =>
          wantsLeader
            ? b.leader && matchLeaderChord(e, b, s.id, recorded)
            : !b.leader && matchBinding(e, b, s.id, recorded),
        )
      )
        continue;
      if (isDisabled?.(s.id, e)) continue;
      return hasHandler(s.id) ? s.id : null;
    }
  }
  return null;
}
