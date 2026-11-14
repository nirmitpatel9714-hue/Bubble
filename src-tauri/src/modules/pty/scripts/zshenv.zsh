# bubble-shell-integration (zshenv)
#
# Bubble points ZDOTDIR at its integration directory so zsh reads these wrappers
# first. The user's files are sourced with ZDOTDIR switched back to their own
# directory, so `$ZDOTDIR/conf.d/*.zsh` style loaders resolve where they expect.
# A ZDOTDIR the user's .zshenv sets itself is remembered in BUBBLE_USER_ZDOTDIR,
# otherwise zsh would continue with their .zshrc and skip ours.
#
# Trailing `:` is load-bearing — without it, a missing user .zshenv leaves $?=1,
# which propagates through the rest of init and ultimately into the first
# prompt's `%?` (rendering robbyrussell's `➜` red on a clean shell start).
{
  _bubble_zdotdir="$ZDOTDIR"
  _bubble_assigned="${BUBBLE_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_bubble_assigned"
  [ -f "$_bubble_assigned/.zshenv" ] && source "$_bubble_assigned/.zshenv"
  if [[ "${ZDOTDIR-}" != "$_bubble_assigned" || -n "${BUBBLE_USER_ZDOTDIR-}" ]]; then
    export BUBBLE_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  # An interactive shell goes on to our .zprofile and .zshrc; a script or
  # `zsh -c` reads nothing else, so it keeps the user's own ZDOTDIR.
  if [[ -o interactive ]]; then
    ZDOTDIR="$_bubble_zdotdir"
  elif [[ -n "${BUBBLE_USER_ZDOTDIR-}" ]]; then
    ZDOTDIR="$BUBBLE_USER_ZDOTDIR"
  else
    unset ZDOTDIR
  fi
  unset _bubble_zdotdir _bubble_assigned
}
:
