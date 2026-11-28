# Bubble feature parity in the Bubble fork

This fork ports the feature surface of [Bubble](https://github.com/nirmitpatel9714-hue/Bubble)
into Herdr and then renames the product to Bubble. Bubble is a Tauri + React
app with its own PTY, CodeMirror, LSP hosts, WebViews, and OS keychain
integration. Herdr is a Rust terminal with a JavaScript mod system. Some
Bubble features map directly; some are rebuilt with Herdr primitives; some
cannot exist without a native host and are listed here as gaps instead of
being claimed.

## Fork and rebrand notes

- The app, binary and CLI are `bubble`; the package is `bubble`; the Windows
  app ID is `app.bubble`; the app home is `~/.config/bubble`; environment
  variables use `BUBBLE_`; the mod module is `"bubble"`.
- The terminal core is still the upstream `herdr-core` / `hc` binary. It is
  presented in the UI and docs as **Bubble Core** but keeps its upstream names
  so the core's own installer and updates continue to work. This is the one
  deliberate upstream dependency.
- App self-updates and default telemetry/feedback endpoints are disabled.
  Telemetry is local-only unless `BUBBLE_TELEMETRY_URL` is set; feedback needs
  `BUBBLE_FEEDBACK_URL`.
- The icon set, welcome image, window titles, dialogs, docs and distribution
  text use Bubble branding.
- `defaults/` and themes are embedded in the binary, so a rebuild is required
  after changing them.


The pack is installed by the shipped defaults in this repository:

| Area | Mod / file |
| --- | --- |
| Code editor | `defaults/mods/editor` |
| Source control | `defaults/mods/git` |
| AI chat and actions | `defaults/mods/ai` |
| File and media preview | `defaults/mods/preview` |
| Project checker and Problems panel | `defaults/mods/diagnostics` |
| Command palette | `defaults/mods/command-palette` |
| Bubble settings | `defaults/mods/bubble-settings` |
| Terminal link routing | `defaults/mods/open-link` |
| Explorer additions | `defaults/mods/files` |
| Panel menu | `defaults/mods/panel-menu`, opened from `defaults/mods/workspace-chrome` (sidebar footer) and `defaults/mods/tabs` (bar layouts) |
| Launcher rows | `defaults/mods/new-menu` |
| Welcome panel picker | `defaults/frame/welcome` |
| Layout blocks and link order | `defaults/layouts/main.json` |
| Shortcuts | `defaults/keys.json`, `defaults/keys.macos.json` |
| Bubble themes | `defaults/themes/*.json`, `src/settings.rs` |

Status words:

- **Ported**: the behavior exists and is usable.
- **Adapted**: the intent exists, with a different mechanism or a smaller
  scope than Bubble.
- **Gap**: not possible through the Herdr mod API today.

## Terminal

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| GPU-accelerated terminal | Ported by Herdr | Herdr's native terminal. |
| Multi-tab terminals | Ported by Herdr | `tab.new`, the tabs mod, and the new menu. |
| Native PTY shells (zsh, bash, pwsh, fish, cmd) | Ported by Herdr | Herdr starts the login shell. |
| Split panes | Ported by Herdr | `pane.split`, `alt-h/j/k/l`, `pane.go`. |
| Shell integration (cwd, prompt markers) | Ported by Herdr | Herdr tracks cwd, branch and agent status. |
| Inline search and link detection | Ported by Herdr | `terminal.search`; `open-link` routes clicked links. |
| True color | Ported by Herdr | Theme `ansi` entries. |
| Drag and drop files as quoted paths | Ported by Herdr | Terminal drop support. |
| Private terminal tabs (redacted from AI) | Gap | Herdr has no AI context channel to redact; the AI mod only sees what you type or attach. |
| WSL bridge as a workspace environment | Adapted | New-menu detects distros with `wsl.exe -l -q` and opens each as a tab running `wsl.exe -d <distro>`. No per-space environment injection. |
| Spaces with restored tabs, cwd and split layouts | Ported by Herdr | Spaces persist through herdr-core. |
| Block mode (command output as collapsible blocks) | Gap | OSC 133 blocks need renderer support; Herdr draws its own scrollback. |
| Scrollback search UI | Ported by Herdr | `terminal.search`. |
| Terminal font, size, weight, cursor, scrollback settings | Ported by Herdr | `app.settings` and `settings.json`. |
| Leader-key chords | Adapted | Herdr's `keys.json` sections and global bindings; no prefix/leader state machine. Settings → Keys records a key per action, including `app.sequence` combos. |

## Workspaces, tabs and layout

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Named workspaces | Ported by Herdr | Spaces; `space.new`, `space.rename`. |
| Workspace-scoped cwd and environment | Adapted | Each space has a folder and machine; per-space env vars are not a Herdr feature. |
| Workspace switching keeps sessions alive | Ported by Herdr | Terminals live in herdr-core. |
| Stacked tabs | Ported | The space's tabs as a list in the sidebar (`tabs` with `props().list`); Settings → Tabs → Top bar moves them to a bar across the top instead, with the window buttons in it. |
| Tiled/scrolling columns (niri style) | Ported | `tiled_tabs: true` (Settings → Tabs) draws every open tab of the space as a scrolling column; click one to show it. |
| Drag a tab onto another to split | Gap | Herdr supports pane splits but not tab-to-split drag. |
| Tab drag to reorder | Ported by Herdr | Drag in the tab bar. |
| Per-space side-panel memory | Ported | `defaults/mods/tabs` stores the open panel per space; an open panel covers the sidebar, and Home in the panel menu brings the tabs back. |
| Restored window and tab state | Ported by Herdr | herdr-core restores spaces/tabs where possible. |
| Sidebar toggle | Ported by Herdr | `layout.toggle:sidebar`, `ctrl-shift-b`. |
| Status bar | Ported by Herdr | `workspace-status`. |
| New-window/tab sheet with agents | Ported | `defaults/mods/new-menu`. |
| Bubble's new-block terminal | Gap | No block mode. |

## Editor

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Multi-tab editor | Ported by `editor` | Tabs inside the mod, plus one editor tab per open file. |
| Open files from explorer or quick open | Ported | Files mod "Open in editor" and the editor's `Ctrl+P` list. |
| Multi-language syntax highlighting | Ported | Herdr `EditorState` languages plus a Bubble syntax palette. |
| Line numbers and folding | Ported by `EditorState` | Always on. |
| Editing and saving | Ported | `Ctrl+S`; stale-write detection; "Keep mine" overwrite. |
| Save all | Ported | `Ctrl+Shift+S` in the editor. |
| Autosave with delay | Ported | Bubble settings (off by default). |
| Format on save | Adapted | External `prettier`, `biome`, `ruff`, `rustfmt`, `gofmt`, `clang-format`, `shfmt`, `zigfmt`, or a custom command. No LSP formatting. |
| Word wrap | Ported | Toggle rebuilds `EditorState` with `soft_wrap`. |
| Find and replace | Adapted | Find lists matching lines and counts them; replace-all rewrites the whole buffer. `EditorState` exposes no cursor or selection API, so there is no jump-to-match or single replace. |
| Quick open | Ported | The editor's `Ctrl+P` list, backed by `git ls-files` with a configurable limit. |
| Markdown preview | Ported | Toggle rendered Markdown inside the editor mod. |
| Inline AI autocomplete | Gap | Needs a cursor/selection API and completion rendering; not exposed by `EditorState`. |
| AI edit diffs | Adapted | The AI mod proposes `bubble-write` blocks; approval applies them, but there is no inline diff widget. |
| LSP diagnostics | Gap | No LSP client, document sync, or diagnostics API in the mod runtime. |
| Autocomplete | Gap | `EditorState` has no completion hook or cursor position. |
| Go to definition / references | Gap | Same cursor and LSP limits. |
| Vim / Helix keymaps | Gap | `EditorState` does not expose a keymap or modal editing mode. |
| Git gutter and per-line blame | Gap | No editor decoration API. Diff viewing is in the Git mod. |
| Editor theme selection per app theme | Adapted | Editor syntax follows the active Herdr theme; Bubble's separate editor-theme setting is not available. |
| Editor font size | Adapted | Follows `settings().font_size`; there is no editor-only size override. |
| New editor dialog | Ported | Editor's empty state creates a file inline. |
| Autosave conflict handling | Ported | Stale writes are reported and can be retried or reloaded. |

## File explorer

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Tree with folder expansion | Ported | `files`. |
| File-type icons | Adapted | Herdr ships file/folder glyphs; Bubble's full icon-theme set is not packaged. |
| Live filesystem updates | Ported | `watchFolder` plus a 10-second refresh. |
| Git status decorations | Ported | A, M, D and U marks. |
| Hidden files | Ported | Hidden entries are listed; a toolbar toggle filters dotfiles. |
| Fuzzy file search | Ported | The Files toolbar search scores repository files from `git ls-files` (with a filesystem fallback); the editor's quick open does the same. |
| Create file / folder | Ported | Inline prompt in the files panel. |
| Rename | Ported | Inline prompt; refuses to overwrite. |
| Delete | Ported | Inline confirmation. |
| Copy / cut / paste | Gap | No file clipboard or drag-and-drop move in the mod API. |
| Drag and drop | Gap | No file drag events. |
| Context menu on rows | Adapted | Row toolbar actions and the "Open in editor" preview action replace Bubble's full menu. |
| Keyboard navigation | Gap | No focusable tree rows; keys are handled by the panel only for prompts. |
| Reveal active editor file | Adapted | The panel follows the focused pane's cwd, not the editor tab. |
| Explorer follows active editor tab | Gap | Files cannot see another mod's active tab. |
| Workspace root switching | Ported | Follows the focused pane's cwd. |

## Source control and Git history

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Status list with staged/unstaged states | Ported by `git` | Two sections, file action buttons. |
| Stage / unstage a file | Ported | `git add`, `git restore --staged`. |
| Stage all / unstage all | Ported | Toolbar. |
| Commit | Ported | Commit staged changes; amend option. |
| Commit all | Ported | "Stage all" then commit. |
| Discard a file | Ported | Inline confirmation; restores tracked files and deletes untracked ones. |
| Per-file diff | Ported | Unified diff viewer. |
| Hunk staging | Gap | Writing patches into `git apply --cached` via `exec` is possible but not implemented; there is no editor selection to build hunks from. |
| Branch list and switch | Ported | Branch picker in the Git mod. |
| Create branch | Ported | Inline prompt. |
| Git history / graph | Adapted | Commit list and selected commit stat/diff. Text graph is bounded; no interactive graph. |
| Push / pull / fetch | Ported | Toolbar actions. |
| Conflicts | Adapted | Conflict files are flagged `U`; resolution is done in the editor/terminal. |
| Git gutter in editor | Gap | No editor decorations. |
| Auto-refresh | Ported | Folder watch plus a 10-second timer. |
| Worktrees | Ported by Herdr | The shipped `worktree` mod; new-menu rows. |
| Bubble's dedicated history window | Ported | The Git mod's History view, opened directly by the command palette's "Bubble: Git history" entry. |

## AI

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Bring your own provider and endpoint | Ported | OpenAI-compatible, Anthropic, Google, plus custom OpenAI-compatible base URLs. |
| OpenAI, Anthropic, Google, xAI, Cerebras, Groq, DeepSeek, Mistral, OpenRouter | Adapted | All use the OpenAI-compatible protocol when a compatible base URL is set. Anthropic and Google have native request shapes. |
| LM Studio, MLX, Ollama | Ported | OpenAI-compatible local base URLs. |
| API keys in the OS keychain | Adapted | Keys are read from environment variables (`BUBBLE_AI_API_KEY`, provider-specific names) or typed per session. Nothing is persisted by the mod. |
| Custom endpoints | Ported | Base URL and model in Bubble settings; the key comes from the environment or the session field. |
| Chat with history | Ported | Conversation is stored in mod `localStorage`. |
| Streaming responses | Gap | `fetch` exposes no streaming body; responses appear when complete. |
| Tools with approval gating (write/edit/bash/read) | Adapted | A provider-neutral action-block convention (`bubble-write`, `bubble-shell`, `bubble-read`) with inline Approve/Deny. Not native provider tool calls. |
| Multi-agent and sub-agents | Gap | Herdr's agents are terminals; the AI mod cannot spawn or supervise them as model tools. |
| Approval-gated Claude Code orchestration | Adapted | Start Claude Code as a terminal agent from the new menu; its own approval UI is untouched. |
| Inline edits and AI diff review | Adapted | `bubble-write` approval writes whole files; no inline selection or diff. |
| Voice input / speech-to-text | Gap | No microphone capture. |
| Reusable prompt snippets (`#handle`) | Ported | Stored in Bubble settings; typing `#` lists them. |
| Project memory and project configuration | Adapted | System prompt plus files attached by path; no automatic project index. |
| Workspace file picker for context | Adapted | Attach a file by typing its path; the AI mod reads it into the next request. |
| Auto-compact long context | Adapted | Trims old turns when the transcript exceeds the configured limit, with a notice. |
| Favorite and recent models | Adapted | Each provider ships a preset model list plus a free-form model id; there is no separate favorites or recent list. |
| AI mini window | Adapted | Open AI as a tab or in the side panel. |
| Selection "Ask AI" | Gap | No selection API in the editor or terminal. |
| Todo strip | Gap | No tool-call loop to produce todos. |
| Agent status pills and notifications | Ported by Herdr | Herdr's own agent status, tabs and notifications. |

## Previews

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Rendered Markdown | Ported by `preview` | `TextView.markdown`, with a source toggle. |
| Raw Markdown | Ported | Read-only `EditorState`. |
| Image viewer | Ported | Local images are copied into the app-home cache and drawn with `image()`. |
| Video viewer | Gap | No video element in the mod API; offers "Open externally". |
| Audio viewer | Gap | Same. |
| PDF viewer | Gap | Same. |
| Sandboxed iframe / web preview | Gap | No WebView. A local dev-server URL can be fetched as text or opened in the system browser. |
| Auto-detected local dev server | Gap | No process/port discovery API; the URL picker is manual. |
| Preview address bar | Adapted | URL input with "Open URL" (fetches source text) and "Browser"; no navigation history. |
| Browser fallback | Ported | OS opener from the preview mod. |
| CSV / JSON table preview | Gap | Text preview only. |
| Font preview | Gap | Text preview only. |

## Problems and diagnostics

The `diagnostics` mod runs the project checker and turns its output into an
editor-linked Problems list.

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Problems panel with errors and warnings | Ported | Parses TypeScript, Rust, Go, Python, ESLint/unix and generic `file:line:column` output. |
| Run a checker on demand | Ported | Auto-detects `npm run typecheck`/`lint`, `tsc`, `cargo check`, `go vet`, `ruff` or `eslint`; any command can be set instead. |
| Click a problem to open the file | Ported | Opens the file in the editor, but cannot place the cursor because `EditorState` exposes no cursor API. |
| Filter by severity and text | Ported | Error/warning chips plus a text filter. |
| Auto-run while open | Ported | Optional 30-second poll. |
| Inline squiggles in the editor | Gap | No editor decoration API. |
| LSP push diagnostics | Gap | No language-server client; the mod runs external checkers. |

## Command palette

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| `Ctrl+Space` palette | Ported | `command-palette` mod. |
| Fuzzy filter | Ported | Subsequence scoring over command names, titles and descriptions. |
| Commands with groups | Ported | Herdr app commands, Bubble actions and theme choices. |
| File search / quick open | Adapted | The palette has no file mode; the editor's `Ctrl+P` quick open and the Files panel search repository files. |
| Content search | Gap | No streaming ripgrep UI; use the terminal. |
| Command history | Gap | Every query searches the full list; there is no recency ordering. |
| MRU file ranking | Gap | No file entries in the palette. |
| Prefix modes | Gap | No `>` / `#` / `:` / `@` modes; group labels distinguish entries instead. |
| Keyboard navigation | Ported | Up/Down, `Ctrl+N`/`Ctrl+P`, Enter, Esc. |
| Every action is one keystroke away | Adapted | Commands with required arguments open an inline form; optional arguments are omitted. |
| Theme picker | Ported | Theme entries run `app.theme`. |
| Shortcut hints | Ported | Renders the bound key for the active platform. |
| Git history | Ported | The "Bubble: Git history" entry opens the Git mod's History view directly. |

## Themes and customization

Bubble's built-in themes ship as Herdr theme files in `defaults/themes/` and
are installed to the app-home `themes/` folder at start. Each file colors both
ANSI and UI chrome, so the terminal and mods change together.

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Built-in app and terminal themes | Ported | 31 Bubble theme files: Caffeine (dark/light), Catppuccin (dark/light), Claude (dark/light), Default (dark/light), Dracula, Everforest (dark/light), Gruvbox (dark/light), Kanagawa (dark, Dragon, light), Noctalia (dark/light), Nord (dark/light), Rosé Pine (dark/light), Sage (dark/light), Solarized (dark/light), Tide (dark/light), Tokyo Night, and Xcode (dark/light). |
| Import custom themes | Adapted | Herdr reads `themes/*.json`; there is no JSON text import UI, but a theme file dropped in the folder appears in the picker. |
| Share themes | Adapted | Theme files are plain JSON and can be committed or shared. |
| App theme and terminal palette together | Ported | A Herdr theme file colors ANSI and UI chrome. |
| Separate editor theme | Gap | One Herdr theme supplies syntax and chrome; no independent editor theme. |
| Background image | Gap | No window background-image setting. |
| Background opacity and blur | Gap | No compositor hooks in a mod. |
| Window vibrancy | Gap | Native window effect; not exposed. |
| Custom CSS | Gap | Herdr mods draw with GPUI, not HTML/CSS. |
| Terminal CSS (sharp corners) | Gap | No CSS; layout radius is the closest control. |
| Theme color editing UI | Adapted | Bubble Settings lists every theme with its accent swatch and applies it live; edit theme JSON for colors. |
| Font family and size | Ported by Herdr | `app.settings`. |
| UI zoom | Ported by Herdr | `ctrl+=`, `ctrl+-`, `ctrl+0`. |

## Platform integration

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| macOS, Linux, Windows builds | Adapted | The fork builds from source on Windows; Linux/macOS packaging scripts remain but releases are not published here. |
| WSL | Adapted | New-menu detects distros with `wsl.exe -l -q` and opens each as a tab running `wsl.exe -d <distro>`; no per-space environment injection. |
| Windows Explorer context-menu integration | Gap | Installer/registry work, not a mod capability. |
| Auto-updater | Gap | App updates are deliberately disabled so upstream Herdr cannot replace Bubble. Rebuild from source; Bubble Core updates remain available. |
| OS keychain for API keys | Adapted | Environment variables or session-only entry; Herdr has no keychain API. |
| No telemetry | Ported | Local-only; nothing is sent unless `BUBBLE_TELEMETRY_URL` is set. |
| AUR / deb / rpm / AppImage / NSIS | Ported by Herdr | Herdr's packaging, not reimplemented. |
| Deep links / file associations | Gap | No app-level URL scheme registration. |

## Security and privacy

| Bubble feature | Status | Where / notes |
| --- | --- | --- |
| Path guards for AI tools | Adapted | Relative AI paths are resolved inside the project; `..` escapes are rejected, and absolute paths are shown in full before the same approval click. |
| SSRF and DNS rebinding defenses | Gap | Mod `fetch` is unrestricted; the AI mod only contacts the configured endpoint. |
| OSC trust gating | Ported by Herdr | Herdr's own terminal escape handling. |
| Sandboxed preview surface | Gap | Previews render Markdown/images in the host UI, not untrusted web content. |
| IPC sandboxing | Adapted | Mods run in the host's JavaScript runtime behind a capability API; they are not a security sandbox and have unrestricted `exec` and network access. |
| Approval for shell actions | Ported | `bubble-shell` blocks require an explicit click. |
| Secrets never persisted | Ported | AI keys live in environment variables or memory. |
| Private terminal redaction | Gap | No AI context pipeline to redact. |

## Settings

`bubble-settings` is one tab with these sections:

- **Editor**: autosave and delay, format on save, formatter choice, custom formatter command, word wrap, quick-open file limit.
- **AI**: provider, model, base URL, temperature, environment-variable name, history length, system prompt, and prompt-snippet JSON. API keys are never stored here.
- **Git**: confirm discards, auto-refresh, and history depth.
- **Preview**: render Markdown by default, follow the most recent file, and maximum preview bytes.
- **Problems**: check command, auto-run, timeout, maximum problems, and project-folder override.
- **Appearance**: every shipped and personal theme, applied live with an accent swatch and light/dark label.
- **Keys**: the Bubble bindings (`global` mod-open bindings and every `mod:` section).
- **About**: the gap list plus app-home, editor and command-palette launchers.

Bubble settings that stay in Herdr's own `app.settings` because they are
native: fonts, terminal padding, terminal opacity, sounds, zoom, theme name,
worktree directory, and SSH machines.

## Shortcuts added by the pack

Global, Windows/Linux:

| Keys | Action |
| --- | --- |
| `Ctrl+Space` | Command palette |
| `Ctrl+Shift+Enter` | New editor |
| `Ctrl+Shift+A` | New AI chat |
| `Ctrl+Shift+G` | New Git client |
| `Ctrl+Shift+M` | New preview |
| `Ctrl+Shift+R` | New Problems panel |
| `Ctrl+Shift+,` | Bubble settings |

Global, macOS:

| Keys | Action |
| --- | --- |
| `Ctrl+Space` | Command palette |
| `Cmd+Shift+E` | New editor |
| `Cmd+Shift+A` | New AI chat |
| `Cmd+Shift+G` | New Git client |
| `Cmd+Shift+M` | New preview |
| `Cmd+Shift+R` | New Problems panel |
| `Cmd+Shift+,` | Bubble settings |

In-mod keys (both platforms; `Ctrl` is kept so standard text-editing chords
still reach text fields):

| Mod | Keys | Action |
| --- | --- | --- |
| Editor | `Ctrl+S` | Save |
| Editor | `Ctrl+Shift+S` | Save all |
| Editor | `Ctrl+P` | Quick open |
| Editor | `Ctrl+F` / `Ctrl+H` | Find / replace |
| Editor | `Ctrl+Shift+M` | Toggle Markdown preview |
| Editor | `Ctrl+R` | Reload from disk |
| Editor | `Alt+W` / `Alt+Z` | Close tab / toggle word wrap |
| Git | `Ctrl+Enter` / `Ctrl+R` | Commit / refresh |
| Git | `Alt+A` / `Alt+U` | Stage all / unstage all |
| Git | `Alt+1` / `Alt+2` / `Alt+3` | Changes / history / branches |
| Git | `Alt+N` | New branch |
| Git | `Alt+F` / `Alt+P` / `Alt+S` | Fetch / pull / push |
| AI | `Ctrl+Enter` | Send |
| AI | `Alt+K` / `Alt+A` | API key / attach a file |
| AI | `Alt+C` / `Alt+L` | New chat / focus composer |
| Preview | `Ctrl+R` / `Alt+U` | Refresh / URL field |
| Preview | `Alt+S` / `Alt+V` | Source / rendered |
| Preview | `Alt+O` / `Alt+E` | Open externally / open in editor |
| Problems | `Ctrl+Enter` or `Ctrl+R` | Run the checker |
| Problems | `Ctrl+F` / `Alt+C` | Filter / clear |
| Files | `Alt+N` / `Alt+Shift+N` | New file / new folder |
| Files | `Alt+R` / `Alt+D` | Rename / delete |
| Files | `Ctrl+F` / `Ctrl+R` | Search / refresh |
| Files | `Alt+L` | Focus the panel |
| Settings | `Ctrl+S` / `Alt+R` | Save / reset the section |
| Palette | `Alt+S` | Open Bubble settings |

## Deliberate gaps

These need native Herdr support and are not claimed as ports:

1. Streaming model responses and cancellation.
2. Real provider tool calls, sub-agents, and a todo/tool loop.
3. LSP servers, diagnostics, completion, navigation, and formatting.
4. Editor cursor/selection access, inline AI completion, vim/helix modes, and
   decorations.
5. WebView previews, media/PDF playback, and dev-server detection.
6. Microphone capture and speech-to-text.
7. File drag-and-drop, file clipboard, and a focusable explorer tree.
8. Block-mode terminal output.
9. Window background images, vibrancy, blur, and custom CSS.
10. OS keychain storage and installer-level Explorer integration.
