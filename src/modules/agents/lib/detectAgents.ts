import { AGENT_LAUNCHERS } from "./launcher";
import type { CustomCodingAgent } from "./launcher";

/** What process name an agent answers to: its id plus its command's base name. */
export type AgentCommandSpec = {
  id: string;
  commands: string[];
};

/** Extensions Windows launchers (npm shims, cargo bins) put on the file name. */
const EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat", ".com", ".ps1"];

/**
 * Executables that are never agents themselves: they host them (node runs
 * claude, npx runs anything) or are shells. Matching against these would flag
 * every build script as an agent, so both spec commands and scan results that
 * land here are ignored — OSC command-line matching and hooks cover those
 * launches instead.
 */
const GENERIC_EXECUTABLES = new Set([
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "bunx",
  "deno",
  "python",
  "python3",
  "pip",
  "pip3",
  "uv",
  "uvx",
  "cargo",
  "rustc",
  "go",
  "java",
  "dotnet",
  "ruby",
  "perl",
  "php",
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "pwsh",
  "powershell",
  "cmd",
  "conhost",
  "openconsole",
  "ssh",
  "tmux",
  "screen",
  "env",
  "sudo",
  "time",
  "nice",
  "xargs",
  "nohup",
  "stdbuf",
  "winpty",
  "script",
]);

/**
 * Base name of a process executable, lower-cased with Windows launcher
 * extensions stripped, so `C:\tools\Claude.EXE` and `claude` compare equal.
 */
export function processName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const base = trimmed.split(/[\\/]/).filter(Boolean).pop() ?? trimmed;
  let name = base;
  const lower = name.toLowerCase();
  for (const suffix of EXECUTABLE_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  return name.toLowerCase();
}

/**
 * Executable the OS will run for a launch command: its first token's base
 * name, honouring quoted paths with spaces. `~/.local/bin/claude --verbose`
 * and `"my agent.exe" --flag` both land on a comparable base name.
 */
export function commandExecutable(command: string): string {
  const trimmed = command.trim();
  const quoted = trimmed.match(/^"([^"]*)"/) ?? trimmed.match(/^'([^']*)'/);
  const first = quoted ? quoted[1] : (trimmed.split(/\s+/)[0] ?? "");
  return processName(first);
}

/** Matching specs for the built-in launchers, honouring overridden commands. */
export function builtinCommandSpecs(
  launchCommands: Record<string, string> | undefined,
): AgentCommandSpec[] {
  return AGENT_LAUNCHERS.map((launcher) => ({
    id: launcher.id,
    commands: [
      launcher.id,
      commandExecutable(
        launchCommands?.[launcher.id] ?? launcher.defaultCommand,
      ),
    ],
  }));
}

/** Matching specs for user-defined agents, by their command's base name. */
export function customCommandSpecs(
  customs: CustomCodingAgent[],
): AgentCommandSpec[] {
  return customs.map((agent) => ({
    id: agent.id,
    commands: [commandExecutable(agent.command)],
  }));
}

/**
 * Which agent (if any) is running among these process names. Generic hosts are
 * skipped on both sides so `npm run my-agent` never flags every npm process.
 */
export function matchAgentProcess(
  names: Iterable<string>,
  specs: AgentCommandSpec[],
): string | null {
  for (const raw of names) {
    const name = processName(raw);
    if (!name || GENERIC_EXECUTABLES.has(name)) continue;
    for (const spec of specs) {
      for (const command of spec.commands) {
        if (!command || GENERIC_EXECUTABLES.has(command)) continue;
        if (command === name) return spec.id;
      }
    }
  }
  return null;
}

/** Specs for every agent the launcher knows: built-ins first, then customs. */
export function allAgentCommandSpecs(
  launchCommands: Record<string, string> | undefined,
  customs: CustomCodingAgent[],
): AgentCommandSpec[] {
  return [
    ...builtinCommandSpecs(launchCommands),
    ...customCommandSpecs(customs),
  ];
}
