import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useUpdater } from "./useUpdater";

type DistroKey = "arch" | "debian" | "fedora";

function distroCommand(key: DistroKey, version: string): string {
  switch (key) {
    case "arch":
      return "yay -S bubble-bin";
    case "debian":
      return `sudo apt install ./Bubble_${version}_amd64.deb`;
    case "fedora":
      return `sudo dnf install ./Bubble-${version}-1.x86_64.rpm`;
  }
}

const DISTROS: { key: DistroKey; label: string }[] = [
  { key: "arch", label: "Arch" },
  { key: "debian", label: "Debian / Ubuntu" },
  { key: "fedora", label: "Fedora / RHEL" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdaterDialog() {
  const { status, install, dismiss } = useUpdater();
  const [copied, setCopied] = useState(false);
  const [distro, setDistro] = useState<DistroKey>("arch");
  const manualVersion =
    status.kind === "manual-available" ? status.info.version : "";
  const activeCommand = distroCommand(distro, manualVersion);

  const open =
    status.kind === "available" ||
    status.kind === "manual-available" ||
    status.kind === "downloading" ||
    status.kind === "ready";

  if (!open) return null;

  const update = status.kind === "available" ? status.update : null;
  const manual = status.kind === "manual-available" ? status.info : null;
  const downloading = status.kind === "downloading";
  const ready = status.kind === "ready";
  // Release notes for the new version, shown for every update kind so the user
  // always sees what changed. Tauri updates carry it on `Update.body`; Linux
  // manual checks carry the GitHub release body on `info.body`.
  const changelog = manual?.body?.trim() || update?.body?.trim() || "";

  const copyCommand = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(activeCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  const progress =
    downloading && status.contentLength
      ? Math.min(100, (status.downloaded / status.contentLength) * 100)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (
          !o &&
          (status.kind === "available" || status.kind === "manual-available")
        )
          dismiss();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {ready
              ? "Update ready"
              : downloading
                ? "Downloading update…"
                : manual
                  ? `Bubble v${manual.version} is available`
                  : `Bubble v${update?.version} is available`}
          </DialogTitle>
          <DialogDescription>
            {ready
              ? "Restart Bubble to finish installing."
              : downloading
                ? progress !== null
                  ? `${progress.toFixed(0)}% — ${formatBytes(status.downloaded)}`
                  : formatBytes(status.downloaded)
                : manual
                  ? `You're on v${manual.currentVersion}. Pick your distro and run the command, or grab the package from GitHub.`
                  : "A new version is ready to install."}
          </DialogDescription>
        </DialogHeader>

        {changelog && !downloading && !ready && (
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
              What&rsquo;s new
            </span>
            <div className="max-h-[240px] overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-[12px] leading-relaxed whitespace-pre-wrap">
              {changelog}
            </div>
          </div>
        )}

        {downloading && progress !== null && (
          <Progress value={progress} className="mt-2" />
        )}
        {downloading && progress === null && (
          <Progress value={undefined} className="mt-2 animate-pulse" />
        )}

        {manual && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex gap-1 rounded-md bg-muted/40 p-1">
              {DISTROS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDistro(d.key)}
                  className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
                    distro === d.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[12px]">
              <span className="flex-1 select-all">$ {activeCommand}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => void copyCommand()}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {status.kind === "available" && (
            <>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button size="sm" onClick={() => void install()}>
                Install &amp; restart
              </Button>
            </>
          )}
          {manual && (
            <>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button size="sm" onClick={() => void openUrl(manual.releaseUrl)}>
                Download package
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
