import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { matchBinding, SHORTCUTS, type ShortcutId } from "../shortcuts";
import { useLeaderMode } from "./leaderMode";
import { resolveShortcut } from "./resolveShortcut";

type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type UseGlobalShortcutsOptions = {
  isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
};

/** How long a pressed leader waits for its chord before falling back. */
const LEADER_TIMEOUT_MS = 4000;

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "OS",
  "Shift",
]);

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: UseGlobalShortcutsOptions,
) {
  const latest = useRef({ handlers, options });
  latest.current = { handlers, options };

  // Access the shortcuts from the store
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const leaderKey = usePreferencesStore((s) => s.leaderKey);

  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancelLeader = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (pending) {
        pending = false;
        useLeaderMode.getState().setActive(false);
      }
    };

    const beginLeader = () => {
      pending = true;
      useLeaderMode.getState().setActive(true);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(cancelLeader, LEADER_TIMEOUT_MS);
    };

    const onKey = (e: KeyboardEvent) => {
      const { handlers, options } = latest.current;

      // Pressing a modifier alone never completes (or cancels) a chord.
      if (MODIFIER_KEYS.has(e.key)) {
        if (pending) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }

      if (pending) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === "Escape") {
          cancelLeader();
          return;
        }
        if (e.repeat) return;
        const id = resolveShortcut(e, {
          shortcuts: SHORTCUTS,
          user: userShortcuts,
          isDisabled: options?.isDisabled,
          hasHandler: (candidate) => handlers[candidate] !== undefined,
          mode: "leader",
        });
        cancelLeader();
        if (id !== null) handlers[id]?.(e);
        return;
      }

      const id = resolveShortcut(e, {
        shortcuts: SHORTCUTS,
        user: userShortcuts,
        isDisabled: options?.isDisabled,
        hasHandler: (candidate) => handlers[candidate] !== undefined,
        mode: "direct",
      });
      if (id !== null) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlers[id]?.(e);
        return;
      }

      if (!e.repeat && matchBinding(e, leaderKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        beginLeader();
      }
    };

    const onPointerDown = () => cancelLeader();

    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("blur", cancelLeader);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("blur", cancelLeader);
      cancelLeader();
    };
  }, [userShortcuts, leaderKey]);
}
