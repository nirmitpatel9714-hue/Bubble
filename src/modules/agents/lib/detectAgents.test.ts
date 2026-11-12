import { describe, expect, it } from "vitest";
import {
  allAgentCommandSpecs,
  builtinCommandSpecs,
  commandExecutable,
  customCommandSpecs,
  matchAgentProcess,
  processName,
} from "./detectAgents";

describe("processName", () => {
  it("takes the base name across both path separators", () => {
    expect(processName("/usr/local/bin/claude")).toBe("claude");
    expect(processName("C:\\tools\\Codex.EXE")).toBe("codex");
    expect(processName("gemini.cmd")).toBe("gemini");
    expect(processName("my-agent.ps1")).toBe("my-agent");
    expect(processName("claude")).toBe("claude");
  });

  it("returns empty for blank input", () => {
    expect(processName("   ")).toBe("");
  });
});

describe("commandExecutable", () => {
  it("resolves the executable a launch command will run", () => {
    expect(commandExecutable("claude --verbose")).toBe("claude");
    expect(commandExecutable("~/.local/bin/myagent --fast")).toBe("myagent");
    expect(commandExecutable(`"C:\\tools\\my agent.exe" --flag`)).toBe(
      "my agent",
    );
  });
});

describe("matchAgentProcess", () => {
  const specs = allAgentCommandSpecs(undefined, [
    { id: "custom-1", name: "MyAgent", command: "myagent --flag" },
  ]);

  it("matches built-in agents by id and by command name", () => {
    expect(matchAgentProcess(["claude"], specs)).toBe("claude");
    expect(matchAgentProcess(["Codex.exe", "pwsh"], specs)).toBe("codex");
    expect(matchAgentProcess(["conhost", "claude"], specs)).toBe("claude");
  });

  it("matches custom agents by their command's base name", () => {
    expect(matchAgentProcess(["myagent"], specs)).toBe("custom-1");
    expect(matchAgentProcess(["MYAGENT.EXE"], specs)).toBe("custom-1");
  });

  it("never matches generic hosts or unknown processes", () => {
    expect(matchAgentProcess(["node", "npm", "python"], specs)).toBeNull();
    expect(matchAgentProcess(["python", "bash"], specs)).toBeNull();
    expect(matchAgentProcess(["some-random-binary"], specs)).toBeNull();
    expect(matchAgentProcess([], specs)).toBeNull();
  });

  it("ignores specs whose command is a generic host", () => {
    const wrapped = [{ id: "wrapped", commands: ["npm"] }, ...specs];
    expect(matchAgentProcess(["npm"], wrapped)).toBeNull();
    expect(matchAgentProcess(["claude"], wrapped)).toBe("claude");
  });
});

describe("spec builders", () => {
  it("builtinCommandSpecs honours overridden launch commands", () => {
    const specs = builtinCommandSpecs({ claude: "~/bin/claude-mp" });
    const claude = specs.find((s) => s.id === "claude");
    expect(claude?.commands).toContain("claude");
    expect(claude?.commands).toContain("claude-mp");

    const codex = builtinCommandSpecs(undefined).find((s) => s.id === "codex");
    expect(codex?.commands).toEqual(["codex", "codex"]);
  });

  it("customCommandSpecs maps each agent to its command", () => {
    const specs = customCommandSpecs([
      { id: "c1", name: "A", command: "agent-a" },
      { id: "c2", name: "B", command: '"C:\\x\\agent b.exe"' },
    ]);
    expect(specs[0]).toEqual({ id: "c1", commands: ["agent-a"] });
    expect(specs[1]).toEqual({ id: "c2", commands: ["agent b"] });
  });
});
