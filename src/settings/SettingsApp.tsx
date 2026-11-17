import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WindowControls } from "@/components/WindowControls";
import {
  IS_MAC,
  USE_CUSTOM_WINDOW_CONTROLS,
  applyWindowChrome,
} from "@/lib/platform";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { WindowActivityBridge } from "@/modules/theme";
import {
  AiScanIcon,
  Cancel01Icon,
  CodeIcon,
  InformationCircleIcon,
  KeyboardIcon,
  PaintBoardIcon,
  Search01Icon,
  Settings01Icon,
  SourceCodeIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { type JSX, useEffect, useState } from "react";
import {
  SettingsSearchContext,
  matchesSettingsSearch,
} from "./components/settingsSearch";
import { SETTINGS_SEARCH_INDEX } from "./searchIndex";
import { AboutSection } from "./sections/AboutSection";
import { AgentsSection } from "./sections/AgentsSection";
import { CssSection } from "./sections/CssSection";
import { EditorSection } from "./sections/EditorSection";
import { GeneralSection } from "./sections/GeneralSection";
import { ModelsSection } from "./sections/ModelsSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { ThemesSection } from "./sections/ThemesSection";

const TABS: {
  id: SettingsTab;
  label: string;
  icon: typeof Settings01Icon;
  component: () => JSX.Element;
}[] = [
  {
    id: "general",
    label: "General",
    icon: Settings01Icon,
    component: GeneralSection,
  },
  {
    id: "editor",
    label: "Editor",
    icon: SourceCodeIcon,
    component: EditorSection,
  },
  {
    id: "themes",
    label: "Themes",
    icon: PaintBoardIcon,
    component: ThemesSection,
  },
  {
    id: "css",
    label: "CSS",
    icon: CodeIcon,
    component: CssSection,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: KeyboardIcon,
    component: ShortcutsSection,
  },
  { id: "models", label: "Models", icon: AiScanIcon, component: ModelsSection },
  {
    id: "agents",
    label: "Agents",
    icon: UserMultiple02Icon,
    component: AgentsSection,
  },
  {
    id: "about",
    label: "About",
    icon: InformationCircleIcon,
    component: AboutSection,
  },
];

const VALID_TABS: SettingsTab[] = [
  "general",
  "editor",
  "themes",
  "css",
  "shortcuts",
  "models",
  "agents",
  "about",
];

function readInitialTab(): SettingsTab {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  const t = url.searchParams.get("tab");
  // Back-compat: legacy "ai" / "connections" → "models".
  if (t === "ai" || t === "connections") return "models";
  if (t && (VALID_TABS as string[]).includes(t)) return t as SettingsTab;
  return "general";
}

export function SettingsApp() {
  const [active, setActive] = useState<SettingsTab>(readInitialTab);
  const [query, setQuery] = useState("");
  const init = usePreferencesStore((s) => s.init);
  const systemDecorations = usePreferencesStore((s) => s.systemDecorations);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const ActiveSection = TABS.find((t) => t.id === active)?.component;

  const results = query.trim()
    ? SETTINGS_SEARCH_INDEX.filter((entry) => {
        const label = TABS.find((t) => t.id === entry.tab)?.label ?? entry.tab;
        return matchesSettingsSearch(query, entry.title, entry.keywords, label);
      }).slice(0, 8)
    : [];

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!prefsHydrated || IS_MAC) return;
    applyWindowChrome(systemDecorations);
    void invoke("set_system_decorations", {
      enabled: systemDecorations,
    }).catch((error) => {
      console.error("set_system_decorations failed", error);
    });
  }, [prefsHydrated, systemDecorations]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.getElementById("settings-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const apply = (detail: string) => {
      if (detail === "ai" || detail === "connections") {
        setActive("models");
        return;
      }
      if ((VALID_TABS as string[]).includes(detail)) {
        setActive(detail as SettingsTab);
      }
    };
    const unlistenPromise = getCurrentWebviewWindow().listen<string>(
      "bubble:settings-tab",
      (e) => apply(e.payload),
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground select-none">
      <header
        data-tauri-drag-region
        className={`flex h-11 shrink-0 items-center border-b border-border/60 bg-card/60 ${
          IS_MAC ? "pr-3 pl-22" : "pr-0 pl-3"
        }`}
      >
        <Tabs
          value={active}
          onValueChange={(v) => setActive(v as SettingsTab)}
          orientation="horizontal"
          className="flex-1 items-center"
          data-tauri-drag-region
        >
          <TabsList className="mx-auto h-7 bg-muted/40 px-2">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-6 gap-1.5 px-2.5 text-[11.5px]"
              >
                <HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.75} />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative mr-2 flex shrink-0 items-center">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <input
            id="settings-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search settings"
            aria-label="Search settings"
            className="h-7 w-44 rounded-md border border-border/60 bg-background/70 pr-7 pl-7 text-[11.5px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
          {query ? (
            <button
              type="button"
              title="Clear search"
              onClick={() => {
                setQuery("");
                document.getElementById("settings-search")?.focus();
              }}
              className="absolute right-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          ) : null}
          {query.trim() ? (
            <div className="absolute top-9 right-0 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
              {results.length === 0 ? (
                <p className="px-2.5 py-2 text-[11.5px] text-muted-foreground">
                  No settings match “{query.trim()}”.
                </p>
              ) : (
                results.map((entry) => {
                  const label =
                    TABS.find((t) => t.id === entry.tab)?.label ?? entry.tab;
                  return (
                    <button
                      key={`${entry.tab}:${entry.title}`}
                      type="button"
                      onClick={() => {
                        setActive(entry.tab);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="truncate text-[11.5px]">
                        {entry.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
        {USE_CUSTOM_WINDOW_CONTROLS && !systemDecorations && (
          <WindowControls closeOnly />
        )}
      </header>
      <WindowActivityBridge />
      <Toaster position="bottom-right" />

      <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-6 pb-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SettingsSearchContext.Provider value={query}>
          <div className="mx-auto w-full max-w-160">
            {ActiveSection && <ActiveSection />}
          </div>
          {query.trim() ? (
            <p className="mx-auto mt-4 w-full max-w-160 text-[11px] text-muted-foreground">
              Filtering this tab. Pick a result above to jump to another tab.
            </p>
          ) : null}
        </SettingsSearchContext.Provider>
      </main>
    </div>
  );
}
