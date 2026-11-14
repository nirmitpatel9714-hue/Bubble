import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setCustomCss, setTerminalCss } from "@/modules/settings/store";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function CssSection() {
  const customCss = usePreferencesStore((s) => s.customCss);
  const terminalCss = usePreferencesStore((s) => s.terminalCss);
  const [draft, setDraft] = useState(customCss);
  const [justSaved, setJustSaved] = useState(false);

  // Keep the editor in sync when the stored value changes in another window.
  useEffect(() => {
    setDraft(customCss);
  }, [customCss]);

  const dirty = draft !== customCss;

  const save = (value: string) => {
    setDraft(value);
    void setCustomCss(value);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="CSS"
        description="Inject your own CSS and switch on the sharp-cornered terminal styling."
      />

      <SettingRow
        title="Terminal CSS"
        description="Square off pane, card and terminal corners. Theme colours are unchanged."
      >
        <Switch
          checked={terminalCss}
          onCheckedChange={(v) => void setTerminalCss(v)}
        />
      </SettingRow>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
            Custom CSS
          </span>
          <div className="flex items-center gap-1.5">
            {justSaved && !dirty ? (
              <span className="text-[11px] text-muted-foreground">Saved</span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              disabled={!customCss && !draft}
              onClick={() => save("")}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              disabled={!dirty}
              onClick={() => save(draft)}
            >
              Save
            </Button>
          </div>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder={
            "/* e.g. make the terminal font larger */\n.bubble-pane { font-size: 15px; }"
          }
          className="min-h-[240px] resize-y rounded-lg border-border/60 bg-card/40 px-3 py-2 font-mono text-[11.5px] leading-relaxed"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Rules are appended last, so they override the built-in styles. Colours
          still follow the active theme: set a custom{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10.5px]">
            font-family
          </code>{" "}
          freely, the theme keeps the text and terminal palette.
        </p>
      </div>
    </div>
  );
}
