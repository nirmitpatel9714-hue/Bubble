# Bubble

Bubble is a desktop app for terminals and coding agents. Keep work in spaces, see which agents need you, and leave terminals running when you close the window. Supports all herdr-app layouts and mods. Herdr mobile and shh support too. Built on GPUI and rust. 

`Partially forked from herdr-app and terax-ai.`

## Install

Bubble is built from source. Upstream Herdr's installers are intentionally
not used here: they install Herdr, not Bubble. There is no Bubble release
channel.

### Windows

Install the Rust MSVC toolchain, the Visual Studio C++ build tools, Zig
0.16.0 and LLVM (for `libclang`). See [Windows setup](docs/windows-setup.md)
for the environment variables and versions used here.

```powershell
git clone --recurse-submodules https://github.com/nirmitpatel9714-hue/herdr-app.git
cd herdr-app
.\scripts\build.ps1 --release
```

The script loads the Visual Studio developer environment (so `cl.exe`,
`INCLUDE` and `LIB` are present) and then runs `cargo build`. Running plain
`cargo build` in an ordinary terminal fails even with `CC=cl.exe` set.

The app is `target\release\bubble.exe`. It needs a Bubble Core (`herdr-core`)
binary on `PATH` or in one of the standard core install locations; the setup
window offers to install one if it cannot find it.

### Linux and macOS

```sh
git clone --recurse-submodules https://github.com/nirmitpatel9714-hue/herdr-app.git
cd herdr-app
just build
```

Linux needs a desktop session, a working Vulkan driver, and the development
packages listed in [CI](.github/workflows/ci.yml). macOS builds are untested
for this fork. Build both from the same checkout; the shipped defaults and
themes are compiled into the binary.

`just` and Bun are optional for `cargo build`; `just test` also runs Bun
tests. `just install` adds the built app to your desktop.

### Core

Bubble Core is the background terminal core. This fork keeps the upstream
binary names (`herdr-core` / `hc`) so the core's own installer and updates
continue to work. The setup window can install it, or run the core installer
yourself:

```sh
curl -fsSL https://releases.herdr.dev/core/install.sh | sh
```

The core is the one deliberate upstream dependency left in Bubble.

## Find your work

A **space** holds work on one machine, usually in one repo. Each space has **tabs**. Split a tab into **panes** to put terminals or mod panels beside each other.

An unnamed space follows its first terminal's folder. Name a space or tab when you want a label that stays.
New tabs start in the focused terminal's folder.

The agents sidebar brings agents from your spaces into one list, including workers started by another agent.
Agents that report status show as:

- **Working:** still busy.
- **Blocked:** waiting for you.
- **Done:** finished while you were looking elsewhere.
- **Idle:** not working, or a finished agent you have looked at.

Click an agent to see it. A worker without a pane opens in **peek**, over your tab. Keep it as a tab if you want it beside your other work.
Ctrl-click a live terminal address in terminal text to peek at it; use Cmd-click on macOS.
An address such as `t7` means a terminal on the same machine as the terminal showing it. `vps/t7` names one on another machine.

The window arranges terminals. The core runs them.
Closing the window leaves them running; closing a pane or tab ends its terminals.
After a reboot or core crash, kept panes get fresh shells in their last folders, not their old programs.

## Work on another machine

Add an SSH machine from Settings → Machines or the sidebar's Add machine action.
Pick a host from your SSH config or type how SSH reaches it.
Spaces on that machine run their terminals there, not on your computer.

Each machine keeps its spaces, tabs and splits in its core. Connected screens share that structure and the live terminals, but keep their own focus and zoom.
Remote work keeps running when your local window closes or your laptop sleeps, as long as the remote machine and core stay up.

## Make it yours

Open the command palette to find an action by name, or open Settings to change fonts, colors, sounds and other preferences.
Settings > Look also adjusts terminal line height, cell width and scroll speed. All default to 100%; layouts can override them with `terminal_line_height` (0.8–2), `terminal_cell_width` (0.8–2) and `terminal_scroll_speed` (0.1–5).
The built-in layouts include Bubble, Terminals and Bubble 98.
A **layout** arranges the window. **Mods** are small JavaScript programs that draw its panels, menus and dialogs.

Duplicate a shipped layout or mod before changing its structure or code. Your copies stay yours; Bubble updates the shipped ones on start.
Save a personal layout, mod or key file and the window reloads it.
A broken edit keeps the last good version and reports the error.

Ctrl+Shift+P shows every command and its key (Cmd+Shift+P on macOS). Change any key in `keys.json`; see [the keys section](defaults/AGENTS.md#keys-keysjson) of the mod guide for the format, including JSON objects for named, typed command arguments.

On macOS, Cmd+A selects the terminal's whole screen and scrollback, ready for Cmd+C.
In vim and other alternate-screen apps, it selects only that screen.
Linux and Windows keep Ctrl+A for the shell; bind `terminal.select_all` in `keys.json` if desired.

[Layouts and mods](docs/mods.md) · [Commands](docs/commands.md)

## Updates and privacy

This fork has no app update channel: rebuild from source to update Bubble.
Settings → Updates still shows the installed versions, and can update Bubble
Core when you ask it to. Your terminals keep running in the core.
What's New is available from the command palette.

Telemetry is local-only: nothing is sent unless you set
`BUBBLE_TELEMETRY_URL`. Feedback is unavailable unless you set
`BUBBLE_FEEDBACK_URL`. `DO_NOT_TRACK=1` and `BUBBLE_TELEMETRY=0` turn
telemetry off entirely, and Settings → Privacy has the same switch.
Mods are trusted code, not sandboxed extensions. Read
[security and privacy](docs/security.md) before installing someone else's mod.

## For agents

```sh
bubble --skill
```

This prints the agent guide for driving the window. The Bubble Core skill
points agents here. Use Bubble Core for running and coordinating programs;
use the app to change what you see.

```sh
bubble ls
bubble status
bubble commands
```

The first two inspect the open window. The command list also works without one.
See the [command reference](docs/commands.md) for arguments.

## Build from source

For bugs, mod API requests and code contributions, see [Contributing](CONTRIBUTING.md).

Clone this repo with its submodules. Use Rust 1.95.0 or newer and Zig 0.16.0, the versions used in [CI](.github/workflows/ci.yml).
Linux needs the development packages listed in that workflow.

```sh
git clone --recurse-submodules https://github.com/nirmitpatel9714-hue/herdr-app.git
cd herdr-app
just build
just test
just install
```

Install [just](https://github.com/casey/just) to use these recipes.
The platform installer builds a release and adds the app to your desktop.
On Linux it links to this checkout, so keep the checkout in place.
Quit and reopen Bubble to use the new build.

Documentation checks also need [Bun](https://bun.sh): `just docs-check` checks generated pages and CLI examples; `just docs-generate` refreshes the reference pages.

To compare drawing changes on Windows, Linux or macOS, run the same fixed workloads against each build:

```sh
python scripts/bench.py --bin <app executable> --set spinners --seconds 20
```

The runner requires `hc` on PATH and uses the Python executable running the script. It prints a unique artifact folder with the run settings, counters and results, then stops its private app, terminals and core. Every set uses Python fixture programs; the default set’s TUI workload replaces historical `btop` measurements. `--only spinners` measures just the quiet native spinner scenario. `--set titles` runs eight agents whose titles spin after a prefix (`π ⠹ task`) on the main layout. Keep the window visible and the display awake, and compare the same window activity and display settings; inactive windows may draw at a lower rate. Windows records visibility, foreground activity and display Hz at each measurement boundary; other platforms mark these observations unavailable. Visibility does not establish occlusion. Draws are window render calls. Render-to-paint elapsed time stops before scene finalization, backend drawing, uploads and presentation; it is separate from OS process CPU time. Neither measures physical presentation or the FPS HUD’s derived MAX FPS.

`python scripts/bench_compare.py ghostty --root <artifact folder>` reuses a run’s fake agent for the macOS comparison. Benchmark checks: `python -m unittest discover -s scripts -p test_bench.py`.
