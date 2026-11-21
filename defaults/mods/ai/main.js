// Bubble feature pack: a BYOK AI chat with provider/model selection, files as
// context, prompt snippets, and approval-gated file/shell/read action blocks.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import {
  spaces, panes, focused, exec, readTextFile, writeTextFile, theme, settings,
  shared, run, notify, nextCommand, window,
} from "bubble";

const PROVIDERS = {
  openai: {
    label: "OpenAI", protocol: "openai", base: "https://api.openai.com/v1", env: ["OPENAI_API_KEY"],
    models: ["gpt-4.1-mini", "gpt-4.1", "o4-mini", "gpt-4o"],
  },
  anthropic: {
    label: "Anthropic", protocol: "anthropic", base: "https://api.anthropic.com", env: ["ANTHROPIC_API_KEY"],
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  },
  google: {
    label: "Google", protocol: "google", base: "https://generativelanguage.googleapis.com", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  openrouter: {
    label: "OpenRouter", protocol: "openai", base: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"],
    models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro"],
  },
  groq: {
    label: "Groq", protocol: "openai", base: "https://api.groq.com/openai/v1", env: ["GROQ_API_KEY"],
    models: ["llama-3.3-70b-versatile", "qwen-2.5-coder-32b"],
  },
  deepseek: {
    label: "DeepSeek", protocol: "openai", base: "https://api.deepseek.com/v1", env: ["DEEPSEEK_API_KEY"],
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  mistral: {
    label: "Mistral", protocol: "openai", base: "https://api.mistral.ai/v1", env: ["MISTRAL_API_KEY"],
    models: ["mistral-large-latest", "codestral-latest"],
  },
  xai: {
    label: "xAI", protocol: "openai", base: "https://api.x.ai/v1", env: ["XAI_API_KEY"],
    models: ["grok-4", "grok-3-mini"],
  },
  cerebras: {
    label: "Cerebras", protocol: "openai", base: "https://api.cerebras.ai/v1", env: ["CEREBRAS_API_KEY"],
    models: ["llama-3.3-70b"],
  },
  ollama: { label: "Ollama", protocol: "openai", base: "http://localhost:11434/v1", env: [], models: ["llama3.2", "qwen2.5-coder"] },
  lmstudio: { label: "LM Studio", protocol: "openai", base: "http://localhost:1234/v1", env: [], models: ["local-model"] },
  mlx: { label: "MLX", protocol: "openai", base: "http://localhost:8080/v1", env: [], models: ["mlx-community/Llama-3.2-3B-Instruct-4bit"] },
  custom: { label: "Custom endpoint", protocol: "openai", base: "http://localhost:8000/v1", env: ["BUBBLE_AI_API_KEY"], models: [""] },
};

const DEFAULTS = {
  provider: "openai", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1",
  temperature: 0.2, systemPrompt: "You are Bubble, a concise coding assistant inside Bubble. Answer with short explanations and complete code blocks. To change a file, emit a fenced block tagged bubble-write with the path on the same line, followed by the full new content. To run a command, use a bubble-shell block. To read a file, use a bubble-read block with the path.",
  envKey: "", customFormatter: "", maxMessages: 30, snippets: [],
};

const ACTIONS = /```(bubble-write|bubble-shell|bubble-read)(?:[ \t]+([^\n]*))?\n([\s\S]*?)```/g;

function cfg() {
  const all = shared("bubble.settings");
  return { ...DEFAULTS, ...(all && typeof all === "object" ? all.ai ?? {} : {}) };
}

function setAi(patch) {
  const all = shared("bubble.settings");
  setShared("bubble.settings", { ...(all && typeof all === "object" ? all : {}), ai: { ...cfg(), ...patch } });
}

function loc() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null };
}

const isAbs = (p) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(p ?? "");
// Relative AI paths stay inside the project; absolute paths are shown in full
// and still require the same approval click.
function resolveInside(root, path) {
  if (!path) return "";
  if (isAbs(path)) return path;
  if (!root) return "";
  const parts = [];
  for (const segment of String(path).replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!parts.length) return ""; parts.pop(); }
    else parts.push(segment);
  }
  return `${root.replace(/[\\/]+$/, "")}/${parts.join("/")}`;
}
const shellQuote = (text, platform) => platform === "windows" ? `'${String(text).replace(/'/g, "''")}'` : `'${String(text).replace(/'/g, "'\\''")}'`;
const clip = (text, n) => text.length > n ? text.slice(0, n) + "\n… (truncated)" : text;
const base = (path) => String(path ?? "").split(/[\\/]/).pop() || String(path ?? "");

function parseActions(text) {
  const out = [];
  let match, i = 0;
  ACTIONS.lastIndex = 0;
  while ((match = ACTIONS.exec(text))) {
    out.push({ id: `${Date.now()}-${i++}`, kind: match[1], arg: (match[2] ?? "").trim(), body: match[3], status: "pending", output: "" });
  }
  return out;
}

function actionLabel(action) {
  if (action.kind === "bubble-write") return `Write ${action.arg || "a file"}`;
  if (action.kind === "bubble-shell") return `Run ${action.body.trim().split("\n")[0].slice(0, 60)}`;
  return `Read ${action.arg || "a file"}`;
}

async function openExternal(url) {
  const platform = window()?.platform;
  try {
    if (platform === "macos") await exec("open", [url]);
    else if (platform === "windows") await exec("powershell", ["-NoProfile", "-Command", `Start-Process ${shellQuote(url, "windows")}`]);
    else await exec("xdg-open", [url]);
  } catch {}
}

export default class BubbleAi extends View {
  init(_props, cx) {
    this.messages = [];
    this.attachments = [];
    this.note = "";
    this.pending = false;
    this.picking = null;
    this.keyOpen = false;
    this.attachOpen = false;
    this.snippetOpen = false;
    this.generation = 0;
    this.sessionKey = "";
    this.handle = cx.focus_handle();
    try {
      const saved = JSON.parse(localStorage.getItem("bubble.ai.transcript") ?? "[]");
      if (Array.isArray(saved)) this.messages = saved.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-80);
    } catch {}

    this.composer = TextareaState.new({ placeholder: "Ask about the code, or describe a change…", rows: 3 });
    this.composer.set_soft_wrap(true);
    this.composer.on("focus", (_e, cx) => { this.focused = true; cx.notify(); });
    this.composer.on("blur", (_e, cx) => { this.focused = false; cx.notify(); });

    this.keyInput = InputState.new({ placeholder: "API key (kept for this session only)" });
    this.keyInput.set_masked(true);
    this.attachInput = InputState.new({ placeholder: "Path to attach, e.g. src/main.ts" });
    this.attachInput.on("submit", (_e, cx) => this.attach(cx));
    this.modelInput = InputState.new({ placeholder: "Model id" });
    this.modelInput.on("submit", (_e, cx) => { setAi({ model: this.modelInput.value().trim() }); this.picking = null; cx.notify(); });
    this.baseInput = InputState.new({ placeholder: "Base URL" });
    this.baseInput.on("submit", (_e, cx) => { setAi({ baseUrl: this.baseInput.value().trim().replace(/\/+$/, "") }); this.picking = null; cx.notify(); });

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "send") this.send(cx);
        else if (command === "clear") this.clear(cx);
        else if (command === "focus") this.composer.focus();
        else if (command === "key") this.keyOpen = true;
        else if (command === "attach") { this.attachOpen = true; this.attachInput.focus(); }
        cx.notify();
      }
    });
  }

  save() {
    try { localStorage.setItem("bubble.ai.transcript", JSON.stringify(this.messages.slice(-80))); } catch {}
  }

  clear(cx) {
    this.generation++;
    this.pending = false;
    this.messages = [];
    this.attachments = [];
    this.note = "";
    this.save();
    cx.notify();
  }

  provider() { const c = cfg(); return PROVIDERS[c.provider] ?? PROVIDERS.custom; }
  providerId() { const c = cfg(); return PROVIDERS[c.provider] ? c.provider : "custom"; }
  needsKey() { const id = this.providerId(); return !["ollama", "lmstudio", "mlx", "custom"].includes(id); }
  envNames() {
    const c = cfg(), info = this.provider();
    return [...(c.envKey ? [c.envKey] : []), "BUBBLE_AI_API_KEY", ...(info.env ?? [])];
  }

  async resolveKey() {
    if (this.sessionKey.trim()) return this.sessionKey.trim();
    if (!this.needsKey() && !cfg().envKey) return this.sessionKey.trim();
    const platform = window()?.platform;
    for (const name of this.envNames()) {
      if (!name) continue;
      try {
        const r = platform === "windows"
          ? await exec("powershell", ["-NoProfile", "-Command", `if ($env:${name}) { $env:${name} }`])
          : await exec("sh", ["-c", `printf %s "\${${name}:-}"`]);
        if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
      } catch {}
    }
    return "";
  }

  attach(cx) {
    const path = this.attachInput.value().trim();
    if (!path) return;
    const cwd = loc().cwd;
    const full = isAbs(path) ? path : resolveInside(cwd, path);
    if (!full) { this.note = "Open a folder, or attach an absolute path"; cx.notify(); return; }
    this.attachOpen = false;
    this.attachInput.set_value("");
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(full);
        if (text === null) throw new Error("not found");
        if (text.includes("\0")) throw new Error("binary file");
        this.attachments.push({ path: full, text: clip(text, 24000) });
        this.note = `Attached ${path}`;
      } catch (e) { this.note = `Cannot attach ${path}: ${e}`; }
      cx.notify();
    });
  }

  buildMessages() {
    const c = cfg();
    const max = Math.max(4, Number(c.maxMessages) || 30);
    let history = this.messages.filter((m) => m.role === "user" || m.role === "assistant");
    this.trimmed = 0;
    if (history.length > max) { this.trimmed = history.length - max; history = history.slice(-max); }
    const messages = [];
    for (const m of history) messages.push({ role: m.role, content: m.content });
    const context = this.attachments.map((a) => `Attached file ${a.path}:\n\`\`\`\n${a.text}\n\`\`\``).join("\n\n");
    if (context && messages.length) messages[messages.length - 1] = { role: "user", content: `${messages[messages.length - 1].content}\n\n${context}` };
    return messages;
  }

  async request(cx) {
    const c = cfg(), info = this.provider(), id = this.providerId();
    const key = await this.resolveKey();
    if (this.needsKey() && !key) {
      this.keyOpen = true;
      const error = new Error("Add an API key, or set the environment variable named in Bubble settings.");
      error.expected = true;
      throw error;
    }
    const base = (c.baseUrl || info.base).replace(/\/+$/, "");
    const messages = this.buildMessages();
    if (info.protocol === "anthropic") {
      const r = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: c.model, max_tokens: 4096, temperature: Number(c.temperature) || 0.2, system: c.systemPrompt, messages }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
      return (data.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
    }
    if (info.protocol === "google") {
      const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: c.systemPrompt }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { temperature: Number(c.temperature) || 0.2 },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    }
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", headers,
      body: JSON.stringify({ model: c.model, messages: [{ role: "system", content: c.systemPrompt }, ...messages], temperature: Number(c.temperature) || 0.2 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("").trim();
    return "";
  }

  send(cx) {
    if (this.pending) { this.note = "A response is already in progress"; cx.notify(); return; }
    let text = this.composer.value().trim();
    if (!text) return;
    const snippets = cfg().snippets ?? [];
    const snippet = snippets.find((s) => s.handle && text.startsWith(`#${s.handle}`));
    if (snippet) text = `${snippet.text}\n\n${text.slice(snippet.handle.length + 1).trim()}`;
    this.composer.set_value("");
    this.messages.push({ role: "user", content: text });
    this.note = "";
    this.picking = null;
    this.save();
    const generation = ++this.generation;
    this.pending = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const answer = await this.request(cx);
        if (generation !== this.generation) return;
        const actions = parseActions(answer);
        this.messages.push({ role: "assistant", content: answer, actions });
        if (this.trimmed) this.note = `Trimmed ${this.trimmed} older messages to stay within the context limit.`;
      } catch (e) {
        if (generation === this.generation) this.note = e?.expected ? e.message : `Request failed: ${e}`;
      } finally {
        if (generation === this.generation) { this.pending = false; this.save(); cx.notify(); }
      }
    });
  }

  approve(message, action, cx) {
    if (action.status !== "pending") return;
    const cwd = action.cwd ?? loc().cwd;
    if (action.kind !== "bubble-shell" && action.arg && !cwd && !isAbs(action.arg)) {
      this.note = "Open a folder, or use an absolute path, before approving this action";
      cx.notify();
      return;
    }
    action.cwd = cwd;
    action.status = "running";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (action.kind === "bubble-write") {
          if (!action.arg) throw new Error("No path in the block");
          if (action.body.length > 400000) throw new Error("Content is too large");
          const full = resolveInside(cwd, action.arg);
          if (!full) throw new Error("That path leaves the project folder");
          const before = await readTextFile(full);
          await writeTextFile(full, action.body, before);
          action.output = `Wrote ${full}`;
          action.full = full;
          action.status = "done";
          notify({ title: "AI write applied", body: action.arg, level: "success" });
        } else if (action.kind === "bubble-read") {
          if (!action.arg) throw new Error("No path in the block");
          const full = resolveInside(cwd, action.arg);
          if (!full) throw new Error("That path leaves the project folder");
          const text = await readTextFile(full);
          action.output = text === null ? "File not found" : clip(text, 12000);
          action.status = text === null ? "error" : "done";
        } else if (action.kind === "bubble-shell") {
          const platform = window()?.platform;
          const r = platform === "windows"
            ? await exec("powershell", ["-NoProfile", "-Command", action.body], { cwd: cwd ?? undefined })
            : await exec("sh", ["-c", action.body], { cwd: cwd ?? undefined });
          action.output = clip(`exit ${r.code}\n${(r.stdout || "") + (r.stderr ? `\n${r.stderr}` : "")}`.trim(), 12000);
          action.status = r.code === 0 ? "done" : "error";
        }
      } catch (e) {
        action.output = String(e);
        action.status = "error";
      }
      cx.notify();
    });
  }

  deny(action, cx) { action.status = "denied"; action.output = "Denied"; cx.notify(); }

  snippets() { return Array.isArray(cfg().snippets) ? cfg().snippets : []; }

  messageBlock(message, index, t) {
    const user = message.role === "user";
    const actions = message.actions ?? [];
    return v_flex().id(`ai-message-${index}`).w_full().gap(6).p(10).rounded(9)
      .bg(user ? t.raised : t.surface).border_1().border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(10.5).font_semibold().text_color(user ? t.muted : t.accent).child(user ? "You" : "Bubble AI"))
        .when(!user && actions.length > 0, (el) => el.child(div().text_size(9.5).px(4).py(1).rounded(3).bg(t.raised).text_color(t.dim).child(`${actions.length} action${actions.length > 1 ? "s" : ""}`))))
      .child(user
        ? div().text_size(12.5).text_color(t.foreground).child(message.content)
        : TextView.markdown(`ai-md-${index}`, message.content).selectable(true)
          .on_link_click((url) => openExternal(url)).text_size(12.5).text_color(t.foreground))
      .children(actions.map((a) => v_flex().gap(5).p(8).rounded(7).bg(t.background).border_1().border_color(a.status === "error" ? t.ansi1 : a.status === "done" ? t.ansi2 : t.border)
        .child(h_flex().gap(6).items_center()
          .child(div().text_size(10).font_semibold().text_color(t.dim).child(actionLabel(a)))
          .child(div().flex_1())
          .when(a.status === "pending", (row) => row
            .child(div().h(22).px(8).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(10.5).cursor_pointer().flex().items_center().on_click(() => this.approve(message, a, cx)).child("Approve"))
            .child(div().h(22).px(8).rounded(5).bg(t.raised).text_color(t.muted).text_size(10.5).cursor_pointer().flex().items_center().on_click(() => this.deny(a, cx)).child("Deny")))
          .when(a.status === "running", (row) => row.child(div().text_size(10).text_color(t.working).child("Running…")))
          .when(a.status === "done", (row) => row.child(div().text_size(10).text_color(t.ansi2).child("Done")))
          .when(a.status === "denied", (row) => row.child(div().text_size(10).text_color(t.dim).child("Denied")))
          .when(a.status === "error", (row) => row.child(div().text_size(10).text_color(t.ansi1).child("Failed"))))
        .when(Boolean(a.arg) && a.kind !== "bubble-shell", (el) => el.child(div().text_size(10).text_color(t.dim).child(a.arg)))
        .when(a.kind === "bubble-shell", (el) => el.child(div().font_family(settings().font_family ?? "monospace").text_size(10.5).text_color(t.muted).child(clip(a.body.trim(), 900))))
        .when(Boolean(a.output), (el) => el.child(div().font_family(settings().font_family ?? "monospace").text_size(10.5).text_color(a.status === "error" ? t.ansi1 : t.muted).child(clip(a.output, 2200))))
        .when(a.status === "done" && a.full, (el) => el.child(div().text_size(10).text_color(t.accent).cursor_pointer().on_click(() => run("tab.new", { name: base(a.arg), mod: "editor", props: { path: a.full, cwd: a.cwd ?? loc().cwd } })).child("Open in editor")))));
  }

  pickerRow(id, label, note, action, active) {
    const t = theme();
    return h_flex().id(id).h(29).px(9).gap(8).items_center().rounded(6).cursor_pointer().text_size(12)
      .when(active, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click(action).child(div().w(14).text_color(t.accent).child(active ? "✓" : "")).child(div().flex_1().child(label)).child(div().text_size(10).text_color(t.dim).child(note ?? ""));
  }

  renderPicker(t, cx) {
    const c = cfg();
    if (this.picking === "provider") {
      return v_flex().flex_none().p(6).gap(1).border_b(1).border_color(t.border).bg(t.surface).max_h(230).overflow_y_scrollbar()
        .child(div().px(9).py(4).text_size(10).text_color(t.dim).child("PROVIDER"))
        .children(Object.entries(PROVIDERS).map(([id, p]) => this.pickerRow(`ai-provider-${id}`, p.label, p.protocol, () => {
          this.sessionKey = ""; this.keyOpen = false;
          setAi({ provider: id, baseUrl: p.base, model: p.models[0] });
          this.picking = "model";
          this.modelInput.set_value(p.models[0]);
          cx.notify();
        }, this.providerId() === id)));
    }
    if (this.picking === "model") {
      const info = this.provider();
      return v_flex().flex_none().p(6).gap(1).border_b(1).border_color(t.border).bg(t.surface).max_h(230).overflow_y_scrollbar()
        .child(h_flex().px(9).py(4).gap(6).items_center()
          .child(div().flex_1().text_size(10).text_color(t.dim).child(`${info.label.toUpperCase()} MODELS`))
          .child(div().text_size(10).text_color(t.accent).cursor_pointer().on_click(() => { this.picking = "base"; this.modelInput.focus(); cx.notify(); }).child("Endpoint…")))
        .children((info.models ?? []).filter(Boolean).map((model) => this.pickerRow(`ai-model-${model}`, model, model === c.model ? "current" : "", () => { setAi({ model }); this.picking = null; cx.notify(); }, model === c.model)))
        .child(h_flex().h(34).px(8).gap(6).items_center()
          .child(h_flex().flex_1().h(27).px(8).rounded(6).border_1().border_color(t.border).bg(t.background).child(Input.new(this.modelInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
          .child(div().h(24).px(8).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).flex().items_center().cursor_pointer().on_click(() => { setAi({ model: this.modelInput.value().trim() }); this.picking = null; cx.notify(); }).child("Use model")));
    }
    if (this.picking === "base") {
      return v_flex().flex_none().p(8).gap(6).border_b(1).border_color(t.border).bg(t.surface)
        .child(div().text_size(10).text_color(t.dim).child("OPENAI-COMPATIBLE ENDPOINT"))
        .child(h_flex().h(30).px(8).gap(6).items_center().rounded(7).border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.baseInput).flex_1().h_full().text_size(12).text_color(t.foreground))
          .child(div().h(24).px(8).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).flex().items_center().cursor_pointer().on_click(() => { setAi({ baseUrl: this.baseInput.value().trim().replace(/\/+$/, "") }); this.picking = null; cx.notify(); }).child("Use")))
        .child(div().text_size(10).text_color(t.dim).child("Ollama, LM Studio, MLX, vLLM, LiteLLM and any OpenAI-compatible server work here."));
    }
    return null;
  }

  render(cx) {
    const t = theme(), c = cfg(), info = this.provider(), id = this.providerId();
    const keyReady = Boolean(this.sessionKey.trim()) || !this.needsKey();
    const keys = this.envNames().filter(Boolean);

    return v_flex().id("bubble-ai").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.picking) { this.picking = null; cx.stop_propagation(); cx.notify(); return; }
        if (e.key === "enter" && (e.modifiers.control || e.modifiers.platform) && !this.pending) { this.send(cx); cx.stop_propagation(); }
      })
      .child(h_flex().h(40).flex_none().px(11).gap(7).items_center().border_b(1).border_color(t.border)
        .child(div().size(22).rounded(6).bg(t.accent + "22").flex().items_center().justify_center().child(svg("mods/workspace-chrome/layers.svg").size(13).text_color(t.accent)))
        .child(div().font_semibold().child("Bubble AI"))
        .child(div().id("ai-provider").px(6).py(2).rounded(5).bg(t.raised).text_size(10.5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => { this.picking = this.picking === "provider" ? null : "provider"; cx.notify(); }).child(info.label))
        .child(div().id("ai-model").px(6).py(2).rounded(5).bg(t.raised).text_size(10.5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => { this.picking = this.picking === "model" ? null : "model"; this.modelInput.set_value(c.model); cx.notify(); }).child(c.model || "choose a model"))
        .child(div().flex_1())
        .child(div().id("ai-key").h(24).px(7).rounded(5).flex().items_center().text_size(10.5).cursor_pointer().hover((s) => s.bg(t.hover))
          .text_color(keyReady ? t.dim : t.blocked).on_click(() => { this.keyOpen = !this.keyOpen; cx.notify(); })
          .child(keyReady ? (keys.some((k) => k) ? "key: env or session" : "key: session") : "key needed"))
        .child(div().id("ai-new").h(24).px(7).rounded(5).flex().items_center().text_size(10.5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.clear(cx)).child("New chat"))
        .child(div().id("ai-settings").size(24).rounded(5).flex().items_center().justify_center().cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => run("tab.new", { name: "Bubble Settings", mod: "bubble-settings" })).child(svg("mods/workspace-chrome/settings.svg").size(13).text_color(t.muted))))
      .when(Boolean(this.picking), (el) => el.child(this.renderPicker(t, cx)))
      .when(this.keyOpen || (this.needsKey() && !keyReady), (el) => el.child(v_flex().flex_none().p(8).gap(5).border_b(1).border_color(t.border).bg(t.surface)
        .child(h_flex().h(30).gap(6).items_center()
          .child(h_flex().flex_1().h_full().px(8).rounded(6).border_1().border_color(t.border).bg(t.background).child(Input.new(this.keyInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
          .child(div().h(24).px(8).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).flex().items_center().cursor_pointer().on_click(() => { this.sessionKey = this.keyInput.value(); this.keyOpen = false; this.note = "Key kept for this session only"; cx.notify(); }).child("Use key"))
          .child(div().h(24).px(8).rounded(5).bg(t.raised).text_color(t.muted).text_size(11).flex().items_center().cursor_pointer().on_click(() => { this.keyOpen = false; cx.notify(); }).child("Close")))
        .child(div().text_size(10).text_color(t.dim).child(keys.length ? `Environment fallback: ${keys.join(", ")}. Bubble never writes the key to disk.` : "Set an environment variable in Bubble settings, or type a key here. It is never written to disk."))))
      .when(this.snippetOpen && this.snippets().length > 0, (el) => el.child(v_flex().flex_none().p(6).gap(1).border_b(1).border_color(t.border).bg(t.surface).max_h(150).overflow_y_scrollbar()
        .children(this.snippets().map((s) => this.pickerRow(`ai-snippet-${s.handle}`, `#${s.handle}`, "", () => {
          this.composer.set_value(`${this.composer.value()}${this.composer.value() ? "\n" : ""}#${s.handle} `); this.composer.focus(); this.snippetOpen = false; cx.notify();
        }, false)))))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
        .when(this.messages.length === 0, (el) => el.child(v_flex().items_center().justify_center().gap(9).py(30)
          .child(svg("mods/workspace-chrome/layers.svg").size(32).text_color(t.dim))
          .child(div().text_size(15).font_semibold().child("Ask Bubble AI"))
          .child(div().text_size(11.5).text_color(t.muted).max_w(440).text_center().child("Bring your own key. The model can propose whole-file writes, shell commands and reads; each one waits for your approval."))
          .child(h_flex().gap(6).mt(4).when(true, (row) => row
            .child(this.suggestion("Explain this project", "Read the README and the folder tree, then explain this project.", cx))
            .child(this.suggestion("Find a bug", "Look for a likely bug in the focused file and explain a fix.", cx))
            .child(this.suggestion("Write tests", "Propose tests for the focused file.", cx))))))
        .children(this.messages.map((m, i) => this.messageBlock(m, i, t)))
        .when(this.pending, (el) => el.child(h_flex().gap(7).items_center().p(8).rounded(7).bg(t.surface).border_1().border_color(t.border)
          .child(svg("mods/workspace-chrome/spinner.svg").size(13).text_color(t.accent).spin(900))
          .child(div().text_size(11.5).text_color(t.muted).child("Waiting for the model…")))))
      .when(this.attachments.length > 0, (el) => el.child(h_flex().flex_none().px(10).py(4).gap(5).items_center().flex_wrap().border_t(1).border_color(t.border)
        .children(this.attachments.map((a, i) => h_flex().h(22).px(6).gap(5).rounded(5).bg(t.raised).text_size(10).text_color(t.muted)
          .child(div().max_w(210).truncate().child(a.path))
          .child(div().cursor_pointer().text_color(t.dim).on_click(() => { this.attachments.splice(i, 1); cx.notify(); }).child("×"))))))
      .when(this.attachOpen, (el) => el.child(h_flex().flex_none().px(10).py(6).gap(6).items_center().border_t(1).border_color(t.border)
        .child(h_flex().flex_1().h(28).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).child(Input.new(this.attachInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
        .child(div().h(24).px(8).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).flex().items_center().cursor_pointer().on_click(() => this.attach(cx)).child("Attach"))
        .child(div().h(24).px(8).rounded(5).bg(t.raised).text_color(t.muted).text_size(11).flex().items_center().cursor_pointer().on_click(() => { this.attachOpen = false; cx.notify(); }).child("Close"))))
      .child(v_flex().flex_none().p(8).gap(5).border_t(1).border_color(t.border)
        .child(h_flex().h(84).gap(6).items_end()
          .child(div().flex_1().min_w(0).h_full().rounded(8).border_1().border_color(this.focused ? t.accent : t.border).bg(t.input).p(5)
            .child(Textarea.new(this.composer).size_full().text_size(12.5).text_color(t.foreground)))
          .child(v_flex().gap(4)
            .child(div().id("ai-send").w(54).h(30).rounded(6).flex().items_center().justify_center().text_size(11.5).cursor_pointer()
              .bg(this.pending ? t.raised : t.solid).text_color(this.pending ? t.dim : t.solid_foreground)
              .on_click(() => { if (!this.pending) this.send(cx); }).child(this.pending ? "…" : "Send"))
            .child(div().id("ai-attach").w(54).h(24).rounded(6).flex().items_center().justify_center().text_size(10.5).cursor_pointer().bg(t.raised).text_color(t.muted)
              .on_click(() => { this.attachOpen = !this.attachOpen; if (this.attachOpen) this.attachInput.focus(); cx.notify(); }).child("Attach"))))
        .child(h_flex().gap(8).items_center()
          .child(div().text_size(10).text_color(t.dim).child("Ctrl+Enter sends · each action needs approval"))
          .child(div().flex_1())
          .when(this.snippets().length > 0, (el) => el.child(div().text_size(10).text_color(t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click(() => { this.snippetOpen = !this.snippetOpen; cx.notify(); }).child("Snippets")))
          .child(div().text_size(10).text_color(t.dim).child(`${c.provider}/${c.model}`))))
      .when(Boolean(this.note), (el) => el.child(h_flex().flex_none().px(10).py(5).gap(6).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(10.5).text_color(t.muted).child(this.note))
        .child(div().text_size(10).text_color(t.dim).cursor_pointer().on_click(() => { this.note = ""; cx.notify(); }).child("Dismiss"))));
  }

  suggestion(label, prompt, cx) {
    const t = theme();
    return div().h(25).px(8).flex().items_center().rounded(6).bg(t.raised).border_1().border_color(t.border).text_size(10.5).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => { this.composer.set_value(prompt); this.composer.focus(); cx.notify(); }).child(label);
  }
}
