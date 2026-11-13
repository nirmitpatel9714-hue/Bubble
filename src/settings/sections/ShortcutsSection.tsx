import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setLeaderKey, setShortcuts } from "@/modules/settings/store";
import {
  getBindingTokens,
  type KeyBinding,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type Shortcut,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import {
  ArrowTurnBackwardIcon,
  Delete02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

export function ShortcutsSection() {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const leaderKey = usePreferencesStore((s) => s.leaderKey);
  const [search, setSearch] = useState("");
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [recordingLeader, setRecordingLeader] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const filteredShortcuts = useMemo(() => {
    // Filter out internal/non-overridable shortcuts like tab.selectByIndex.
    const base = SHORTCUTS.filter((s) => s.id !== "tab.selectByIndex");
    if (!search) return base;
    const lower = search.toLowerCase();
    return base.filter(
      (s) =>
        s.label.toLowerCase().includes(lower) ||
        s.group.toLowerCase().includes(lower),
    );
  }, [search]);

  const onRecord = (id: ShortcutId, binding: KeyBinding) => {
    const next = { ...userShortcuts, [id]: [binding] };
    void setShortcuts(next);
    setRecordingId(null);
  };

  const onClear = (id: ShortcutId) => {
    const next = { ...userShortcuts, [id]: [] };
    void setShortcuts(next);
  };

  const onResetShortcut = (id: ShortcutId) => {
    const next = { ...userShortcuts };
    delete next[id];
    void setShortcuts(next);
  };

  const onResetAll = () => {
    void setShortcuts({});
    setResetDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Shortcuts"
          description="View and customize keyboard shortcuts."
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[11px]"
          onClick={() => setResetDialogOpen(true)}
        >
          <HugeiconsIcon
            icon={ArrowTurnBackwardIcon}
            size={12}
            strokeWidth={2}
          />
          Reset All
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-medium">Leader key</span>
          <span className="text-[11px] text-muted-foreground">
            Press it, release, then press a shortcut key. Alt and Super are not
            allowed.
          </span>
        </div>
        {recordingLeader ? (
          <Recorder
            requireCtrl
            onRecord={(binding) => {
              void setLeaderKey(binding);
              setRecordingLeader(false);
            }}
            onCancel={() => setRecordingLeader(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRecordingLeader(true)}
            className="flex min-w-[100px] cursor-pointer items-center justify-end gap-1 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
          >
            <KbdGroup>
              {getBindingTokens(leaderKey).map((token) => (
                <Kbd key={token}>{token}</Kbd>
              ))}
            </KbdGroup>
          </button>
        )}
      </div>

      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          size={14}
          strokeWidth={2}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search shortcuts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-9 text-[12.5px]"
        />
      </div>

      <div className="flex flex-col gap-8">
        {SHORTCUT_GROUPS.map((group) => {
          const items = filteredShortcuts.filter((s) => s.group === group);
          if (items.length === 0) return null;

          return (
            <div key={group} className="flex flex-col gap-3">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group}
              </h3>
              <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
                {items.map((s) => (
                  <ShortcutRow
                    key={s.id}
                    shortcut={s}
                    isRecording={recordingId === s.id}
                    onStartRecording={() => setRecordingId(s.id)}
                    onStopRecording={() => setRecordingId(null)}
                    onRecord={(b) => onRecord(s.id, b)}
                    onClear={() => onClear(s.id)}
                    onReset={() => onResetShortcut(s.id)}
                    userBindings={userShortcuts[s.id]}
                    leaderKey={leaderKey}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all shortcuts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert all your custom keyboard shortcuts to their
              factory defaults. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onResetAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  isRecording,
  onStartRecording,
  onStopRecording,
  onRecord,
  onClear,
  onReset,
  userBindings,
  leaderKey,
}: {
  shortcut: Shortcut;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRecord: (b: KeyBinding) => void;
  onClear: () => void;
  onReset: () => void;
  userBindings?: KeyBinding[];
  leaderKey: KeyBinding;
}) {
  const bindings =
    userBindings !== undefined ? userBindings : shortcut.defaultBindings;
  const isModified = userBindings !== undefined;
  const hasBindings = bindings && bindings.length > 0;

  return (
    <div className="group flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12.5px] font-medium">{shortcut.label}</span>
      </div>

      <div className="flex items-center gap-2">
        {isRecording ? (
          <Recorder
            leader={shortcut.defaultBindings[0]?.leader === true}
            onRecord={onRecord}
            onCancel={onStopRecording}
          />
        ) : (
          <>
            <div
              onClick={onStartRecording}
              className="flex min-w-[100px] cursor-pointer items-center justify-end gap-1"
            >
              {hasBindings ? (
                <KbdGroup>
                  {getBindingTokens(bindings[0], leaderKey).map((t, i) => (
                    <Kbd
                      key={i}
                      className="group-hover:bg-accent group-hover:text-accent-foreground transition-colors"
                    >
                      {t}
                    </Kbd>
                  ))}
                </KbdGroup>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">
                  Unassigned
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {isModified && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={onReset}
                  title="Reset to default"
                >
                  <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={12} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                onClick={onClear}
                title="Clear shortcut"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Recorder({
  onRecord,
  onCancel,
  requireCtrl = false,
  leader = false,
}: {
  onRecord: (b: KeyBinding) => void;
  onCancel: () => void;
  /** The leader key must be Ctrl-based (no Alt, no Super). */
  requireCtrl?: boolean;
  /** Record the second half of a leader chord: a plain key, Shift allowed. */
  leader?: boolean;
}) {
  const [_mods, setMods] = useState({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        onCancel();
        return;
      }

      const isMod = ["Control", "Shift", "Alt", "Meta"].includes(e.key);
      if (isMod) {
        setMods({
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        });
        return;
      }

      // Require at least one primary modifier (Ctrl, Alt, Meta).
      // Reject Shift‑only shortcuts that would insert a character.
      const hasPrimaryModifier = e.ctrlKey || e.altKey || e.metaKey;
      if (requireCtrl && (!e.ctrlKey || e.altKey || e.metaKey)) return;
      if (leader) {
        // Leader chords are pressed after the leader, so they carry no Ctrl,
        // Alt, or Super. Shift + key is allowed; a plain key is the norm.
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        onRecord({ leader: true, key: e.key, shift: e.shiftKey });
        return;
      }
      const isCharacterKey = e.key.length === 1; // anything that types a glyph
      // this blocks shortcuts such as Shift+2 which would be "@" and Shift+, which would be "<" on many layouts
      if (!hasPrimaryModifier && (!e.shiftKey || isCharacterKey)) {
        return;
      }
      onRecord({
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
    };

    const onUp = (e: KeyboardEvent) => {
      const isMod = ["Control", "Shift", "Alt", "Meta"].includes(e.key);
      if (isMod) {
        setMods({
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        });
      }
    };

    window.addEventListener("keydown", onDown, { capture: true });
    window.addEventListener("keyup", onUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onDown, { capture: true });
      window.removeEventListener("keyup", onUp, { capture: true });
    };
  }, [onRecord, onCancel, requireCtrl, leader]);

  return (
    <div className="flex items-center gap-2 rounded bg-accent/50 px-2 py-1 text-[11px] ring-1 ring-accent">
      <span className="animate-pulse font-medium">Recording...</span>
      <span className="text-muted-foreground">(Esc to cancel)</span>
    </div>
  );
}
