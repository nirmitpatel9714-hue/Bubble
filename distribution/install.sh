#!/bin/sh
# Installs the Bubble app, and its terminal core if there's none yet, from a
# Bubble release server. Bubble releases are not published by this fork:
# build from source instead (see README.md), or set BUBBLE_RELEASES_URL to
# your own server that serves app/latest.json.
#
#   BUBBLE_RELEASES_URL=https://your.server curl -fsSL .../app/install.sh | sh
#
# Linux: the app into ~/.local/share/bubble, `bubble` in ~/.local/bin,
# a launcher entry and icon. macOS: Bubble.app into ~/Applications, keeping
# its release signature intact (ad hoc for unsigned/dev builds). The core, with its
# own installer, into ~/.local/bin/herdr-core (and `hc`) only if none is
# there yet. Running it again updates the app.
set -eu

releases=${BUBBLE_RELEASES_URL:-}
bin="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { say "bubble: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "needs $1"; }
[ -n "$releases" ] || fail "Bubble releases are not published; build from source (see README.md)"
need curl
need tar

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  MINGW* | MSYS* | CYGWIN*) fail "this installer is for Linux and macOS; on Windows, build from source (see README.md)" ;;
  *) fail "no build for $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x86_64 ;;
  arm64 | aarch64) arch=aarch64 ;;
  *) fail "no build for $(uname -m)" ;;
esac
if [ "$os" = macos ] && [ "$arch" = x86_64 ]; then
  # Rosetta reports x86_64 even on Apple Silicon.
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ] ||
     [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    arch=aarch64
  else
    fail "Intel Macs aren't supported; build from source (see README.md)"
  fi
fi
target="$os-$arch"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$releases/app/latest.json" -o "$tmp/latest.json" || fail "cannot reach $releases"
# Read without jq: the manifest is flat enough for sed once spaces are gone.
entry=$(tr -d '\n ' < "$tmp/latest.json" | sed -n "s/.*\"$target\":{\([^}]*\)}.*/\1/p")
url=$(printf '%s' "$entry" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
want=$(printf '%s' "$entry" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')
version=$(tr -d '\n ' < "$tmp/latest.json" | sed -n 's/^{"version":"\([^"]*\)".*/\1/p')
[ -n "$url" ] && [ -n "$want" ] || fail "no build for $target yet"

# Tells the release server's download counter a new install from a reinstall;
# the file is the same either way. Only plain URLs on the release server in
# use are marked: one with a query or fragment (a mirror's signed URL) is
# fetched exactly as the manifest gives it.
src=install
for have in "${XDG_DATA_HOME:-$HOME/.local/share}/bubble" "$HOME/Applications/Bubble.app" /Applications/Bubble.app; do
  if [ -e "$have" ]; then src=reinstall; fi
done
case $url in
  *[?#]*) download=$url ;;
  "$releases"/*) download="$url?src=$src" ;;
  *) download=$url ;;
esac

say "Installing Bubble ${version:-} for $target..."
curl -fsSL "$download" -o "$tmp/app.tar.gz" || fail "download failed"
[ "$(sha256 "$tmp/app.tar.gz")" = "$want" ] || fail "download is damaged (checksum mismatch); try again"
tar -xzf "$tmp/app.tar.gz" -C "$tmp"
mkdir -p "$bin"

if [ "$os" = linux ]; then
  data=${XDG_DATA_HOME:-$HOME/.local/share}
  home="$data/bubble"
  mkdir -p "$data"
  rm -rf "$home.new"
  mv "$tmp/bubble" "$home.new"
  rm -rf "$home"
  mv "$home.new" "$home"
  ln -sfn "$home/bubble" "$bin/bubble"
  mkdir -p "$data/applications" "$data/icons/hicolor/scalable/apps"
  cp "$home/bubble.svg" "$data/icons/hicolor/scalable/apps/bubble.svg"
  cat > "$data/applications/bubble.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Bubble
Comment=Terminals and coding agents that keep running
Exec=$bin/bubble
Icon=bubble
Terminal=false
Categories=Development;
StartupWMClass=app.bubble
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$data/applications" 2>/dev/null || true
  [ -f "$data/icons/hicolor/icon-theme.cache" ] && gtk-update-icon-cache -f -t "$data/icons/hicolor" >/dev/null 2>&1 || true
  # Plasma remembers a missing icon until it is told the theme changed,
  # so a fresh install shows an empty page in the taskbar.
  command -v dbus-send >/dev/null 2>&1 &&
    dbus-send --session --type=signal /KIconLoader org.kde.KIconLoader.iconChanged int32:0 2>/dev/null || true
else
  apps="$HOME/Applications"
  app="$apps/Bubble.app"
  mkdir -p "$apps"
  # Prepared in the temp folder, so Spotlight never indexes a half-made
  # bundle under a temporary name in Applications.
  # Never change a certificate-signed bundle: macOS permissions follow its
  # signing identity. Only unsigned/ad-hoc development builds need this PATH.
  signed=false
  if signature=$(/usr/bin/codesign -dvv "$tmp/Bubble.app" 2>&1); then
    if printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:'; then
      signed=true
    elif ! printf '%s\n' "$signature" | grep -qx 'Signature=adhoc'; then
      fail "cannot determine app signature: $signature"
    fi
  elif ! printf '%s\n' "$signature" | grep -q ': code object is not signed at all$'; then
    fail "cannot determine app signature: $signature"
  fi
  if [ "$signed" = true ]; then
    /usr/bin/codesign --verify --deep --strict "$tmp/Bubble.app" || fail "invalid app signature"
  else
    /usr/libexec/PlistBuddy -c "Add :LSEnvironment:PATH string $bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" "$tmp/Bubble.app/Contents/Info.plist"
    /usr/bin/codesign --force --sign - "$tmp/Bubble.app" >/dev/null 2>&1
  fi
  rm -rf "$app"
  mv "$tmp/Bubble.app" "$app"
  ln -sfn "$app/Contents/MacOS/Bubble" "$bin/bubble"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" 2>/dev/null || true
fi

# The core: installed only if there's none yet. One that's already there
# (yours, or from a package manager) is left alone; the app updates it.
if [ ! -e "$bin/herdr-core" ] && ! command -v herdr-core >/dev/null 2>&1; then
  curl -fsSL "$releases/core/install.sh" | HC_INSTALL_DIR="$bin" HERDR_RELEASES_URL="$releases" sh || say "Bubble Core didn't install; Bubble will offer it when it opens."
fi

say "Bubble is installed. Open it from your apps, or run: bubble"
case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to use bubble and hc from a terminal." ;;
esac
