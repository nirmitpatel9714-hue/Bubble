# losos-shell-integration (zprofile)
#
# See zshenv.zsh for how ZDOTDIR is handled and the rationale on the trailing `:`.
{
  _losos_zdotdir="$ZDOTDIR"
  _losos_user_zdotdir="${LOSOS_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_losos_user_zdotdir"
  [ -f "$_losos_user_zdotdir/.zprofile" ] && source "$_losos_user_zdotdir/.zprofile"
  if [[ "${ZDOTDIR-}" != "$_losos_user_zdotdir" || -n "${LOSOS_USER_ZDOTDIR-}" ]]; then
    export LOSOS_USER_ZDOTDIR="${ZDOTDIR:-$HOME}"
  fi
  ZDOTDIR="$_losos_zdotdir"
  unset _losos_zdotdir _losos_user_zdotdir
}
:
