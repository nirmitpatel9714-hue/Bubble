# Windows setup

Bubble is built from source on Windows with the MSVC Rust toolchain. This is
the setup used to build the fork on this machine.

## Required

1. **Visual Studio Build Tools** with the "Desktop development with C++"
   workload. Install the Windows SDK and MSVC C/C++ tools.
2. **Rust** (MSVC toolchain, 1.95.0 or newer):

   ```powershell
   rustup default stable-msvc
   rustup update stable
   ```

3. **Zig 0.16.0**, used by the build for native dependencies. Download the
   Windows x86-64 archive from <https://ziglang.org/download/> and unpack it,
   for example to `%LOCALAPPDATA%\zig\zig-x86_64-windows-0.16.0`.

4. **LLVM** for `libclang`, used by bindgen. Install LLVM and point
   `LIBCLANG_PATH` at the folder containing `libclang.dll`.

5. **Bubble Core** (`herdr-core`) at runtime. The setup window can install it,
   or see the core installer in the main README.

## Environment

Set these for the current user. Adjust paths to your install locations.

```powershell
[Environment]::SetEnvironmentVariable(
  "ZIG",
  "$env:LOCALAPPDATA\zig\zig-x86_64-windows-0.16.0\zig.exe",
  "User")

[Environment]::SetEnvironmentVariable(
  "LIBCLANG_PATH",
  "$env:LOCALAPPDATA\LLVM\LLVM\bin",
  "User")
```

Important: do **not** set `CC` to `gcc` or another MinGW compiler. Rust's C
dependencies must compile with MSVC, or the build fails in crates such as
`quickjs-jit-sys` / `ring` / `zstd-sys`. A global `CC` value is overridden by
the build script below, but it is cleaner to remove it:

```powershell
[Environment]::SetEnvironmentVariable("CC", $null, "User")
```

`CC=cl.exe` on its own is **not** enough. `cl.exe` must be on `PATH`, and
`INCLUDE`, `LIB`, `WindowsSdkDir` and `VCINSTALLDIR` must be set too. Those
come from the Visual Studio developer environment, which a normal terminal
does not have. Load it into the shell before cargo (below) so this is handled
for you.

Open a new terminal after changing user environment variables.

## Optional tools

These are not needed for `cargo build`, but the docs checks and the JavaScript
tests use them.

- **Bun** (for `bun scripts/docs.ts check` and the `scripts/*.test.ts` tests):

  ```powershell
  irm bun.sh/install.ps1 | iex
  ```

## Build and run

Load the MSVC developer environment into the shell, then build:

```powershell
git clone --recurse-submodules https://github.com/nirmitpatel9714-hue/herdr-app.git
cd herdr-app
& "$env:ProgramFiles(x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64
$env:CC = "cl.exe"
cargo build --release --locked
.\target\release\bubble.exe
```

Debug builds work the same way without `--release` (`cargo build --locked`).

Running `cargo build` directly in an ordinary terminal fails with
`ToolNotFound: failed to find tool "cl.exe"` even when `CC=cl.exe` is set,
because the compiler and the Windows SDK paths are not on `PATH`.

The `defaults/` folder and the themes are compiled into the binary, so rebuild
after changing them.

### Isolated profile

`BUBBLE_APP_HOME` selects the app's config/home directory. Use it for a clean
profile without touching your normal `~/.config/bubble` data:

```powershell
$env:BUBBLE_APP_HOME = "$env:TEMP\bubble-profile"
.\target\release\bubble.exe
```

### Updates and network

This fork has no app update channel and no default telemetry endpoint. To use
a test release server:

```powershell
$env:BUBBLE_RELEASES_URL = "https://your.server"
```

To point telemetry or feedback at your own collector:

```powershell
$env:BUBBLE_TELEMETRY_URL = "https://your.server/v1/report"
$env:BUBBLE_FEEDBACK_URL  = "https://your.server/v1/feedback"
```
