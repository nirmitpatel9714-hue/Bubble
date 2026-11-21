// Bubble feature pack: terminal links open in the preview or editor instead of
// leaving Bubble. Local dev-server URLs open in the preview; other URLs pass
// through to Bubble's native opener.
import { run } from "bubble";

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MEDIA = /\.(pdf|mp4|webm|mov|mkv|avi|mp3|wav|ogg|flac|m4a)$/i;
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|rs|py|rb|go|c|h|cc|cpp|cxx|hpp|hh|cs|java|kt|kts|php|swift|sh|bash|zsh|fish|ps1|psm1|html?|xhtml|css|scss|sass|less|json|jsonc|toml|ya?ml|xml|svg|sql|lua|zig|dart|vue|svelte|txt|log|ini|conf|env|cfg|properties|gradle|cmake|dockerfile|gitignore|editorconfig)$/i;
const NAMED = /(^|[\\/])(Dockerfile|Makefile|Rakefile|Gemfile|Procfile|Justfile|CMakeLists\.txt|\.gitignore|\.env)$/i;

const base = (p) => (p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

export async function handleLink({ link, source }) {
  if (link.kind === "url") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(link.url)) {
      run("tab.new", { name: "Preview", mod: "preview", props: { url: link.url } });
      return "handled";
    }
    return "pass";
  }
  if (link.kind !== "file" || !link.path) return "pass";
  const path = link.path;
  const props = { path, cwd: source.cwd ?? undefined, on: source.machine ?? undefined };
  if (IMAGE.test(path) || MARKDOWN.test(path) || MEDIA.test(path)) {
    run("tab.new", { name: base(path), mod: "preview", props });
    return "handled";
  }
  if (CODE.test(path) || NAMED.test(path)) {
    run("tab.new", { name: base(path), mod: "editor", props });
    return "handled";
  }
  return "pass";
}
