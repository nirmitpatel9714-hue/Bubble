# bubble-shell-integration (zprofile)
#
# See zshenv.zsh for how ZDOTDIR is handled and the rationale on the trailing `:`.
{
  _bubble_zdotdir="$ZDOTDIR"
  _bubble_user_zdotdir="${BUBBLE_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_bubble_user_zdotdir"
  [ -f "$_bubble_user_zdotdir/.zprofile" ] && source "$_bubble_user_zdotdir/.zprofile"
  if [[ "${ZDOTDIR-}" != "$_bubble_user_zdotdir" || -n "${BUBBLE_USER_ZDOTDIR-}" ]]; then
    export BUBBLE_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  ZDOTDIR="$_bubble_zdotdir"
  unset _bubble_zdotdir _bubble_user_zdotdir
}
:
