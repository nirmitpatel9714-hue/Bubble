# losos-shell-integration (zshenv)
#
# LosOS points ZDOTDIR at its integration directory so zsh reads these wrappers
# first. The user's files are sourced with ZDOTDIR switched back to their own
# directory, so `$ZDOTDIR/conf.d/*.zsh` style loaders resolve where they expect.
# A ZDOTDIR the user's .zshenv sets itself is remembered in LOSOS_USER_ZDOTDIR,
# otherwise zsh would continue with their .zshrc and skip ours.
#
# Trailing `:` is load-bearing — without it, a missing user .zshenv leaves $?=1,
# which propagates through the rest of init and ultimately into the first
# prompt's `%?` (rendering robbyrussell's `➜` red on a clean shell start).
{
  _losos_zdotdir="$ZDOTDIR"
  _losos_assigned="${LOSOS_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_losos_assigned"
  [ -f "$_losos_assigned/.zshenv" ] && source "$_losos_assigned/.zshenv"
  if [[ "${ZDOTDIR-}" != "$_losos_assigned" || -n "${LOSOS_USER_ZDOTDIR-}" ]]; then
    export LOSOS_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  # An interactive shell goes on to our .zprofile and .zshrc; a script or
  # `zsh -c` reads nothing else, so it keeps the user's own ZDOTDIR.
  if [[ -o interactive ]]; then
    ZDOTDIR="$_losos_zdotdir"
  elif [[ -n "${LOSOS_USER_ZDOTDIR-}" ]]; then
    ZDOTDIR="$LOSOS_USER_ZDOTDIR"
  else
    unset ZDOTDIR
  fi
  unset _losos_zdotdir _losos_assigned
}
:
