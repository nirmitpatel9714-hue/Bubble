import { usePreferencesStore } from "@/modules/settings/preferences";
import { useEffect, useRef } from "react";
import { matchBinding, SHORTCUTS, type ShortcutId } from "../shortcuts";
import { useLeaderMode } from "./leaderMode";
import { resolveShortcut } from "./resolveShortcut";

type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type UseGlobalShortcutsOptions = {
  isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
};

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "OS",
  "Shift",
]);

type Registration = {
  handlers: ShortcutHandlers;
  options?: UseGlobalShortcutsOptions;
};

// Every caller shares one listener and one leader state. Per-hook listeners used
// to fight over the leader press: whichever mounted first swallowed Ctrl+B with
// stopImmediatePropagation, so the other caller never saw the chord.
const registrations = new Set<Registration>();
let listening = false;
let pending = false;

function setLeaderActive(active: boolean) {
  if (useLeaderMode.getState().active !== active) {
    useLeaderMode.getState().setActive(active);
  }
}

function cancelLeader() {
  if (pending) {
    pending = false;
    setLeaderActive(false);
  }
}

function beginLeader() {
  pending = true;
  setLeaderActive(true);
}

function resolveForRegistration(
  e: KeyboardEvent,
  registration: Registration,
  mode: "direct" | "leader",
): ShortcutId | null {
  const { shortcuts } = usePreferencesStore.getState();
  return resolveShortcut(e, {
    shortcuts: SHORTCUTS,
    user: shortcuts,
    isDisabled: registration.options?.isDisabled,
    hasHandler: (candidate) => registration.handlers[candidate] !== undefined,
    mode,
  });
}

function onKeyDown(e: KeyboardEvent) {
  const { leaderKey } = usePreferencesStore.getState();

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
    for (const registration of registrations) {
      const id = resolveForRegistration(e, registration, "leader");
      if (id !== null) {
        cancelLeader();
        registration.handlers[id]?.(e);
        return;
      }
    }
    cancelLeader();
    return;
  }

  for (const registration of registrations) {
    const id = resolveForRegistration(e, registration, "direct");
    if (id !== null) {
      e.preventDefault();
      e.stopImmediatePropagation();
      registration.handlers[id]?.(e);
      return;
    }
  }

  if (!e.repeat && matchBinding(e, leaderKey)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    beginLeader();
  }
}

function onPointerDown(e: PointerEvent) {
  const target = e.target;
  // Interacting with the leader menu (wheel, scrollbar, text selection) must
  // not dismiss the pending chord.
  if (target instanceof Element && target.closest("[data-leader-hud]")) {
    return;
  }
  cancelLeader();
}

function installListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("blur", cancelLeader);
}

function uninstallListener() {
  if (!listening || registrations.size > 0) return;
  listening = false;
  window.removeEventListener("keydown", onKeyDown, { capture: true });
  window.removeEventListener("pointerdown", onPointerDown, {
    capture: true,
  });
  window.removeEventListener("blur", cancelLeader);
  cancelLeader();
}

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: UseGlobalShortcutsOptions,
) {
  const registration = useRef<Registration>({ handlers, options });
  registration.current.handlers = handlers;
  registration.current.options = options;

  useEffect(() => {
    const current = registration.current;
    registrations.add(current);
    installListener();
    return () => {
      registrations.delete(current);
      uninstallListener();
    };
  }, []);
}
