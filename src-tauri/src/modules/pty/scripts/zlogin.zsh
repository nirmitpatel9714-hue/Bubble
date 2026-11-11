# losos-shell-integration (zlogin)
#
# zshrc.zsh normally hands ZDOTDIR back to the user, so zsh reads their own
# .zlogin directly and this file is not used. It stays for shells that reach it
# with the integration directory still in place.
#
# It is the LAST init file zsh runs before entering the prompt loop, so its
# exit status becomes `$?` for the very first prompt. Without the trailing `:`,
# users without a personal ~/.zlogin (the common case) hit a non-zero $? on
# first render — themes that condition prompt color on `%?` (robbyrussell etc.)
# show a red error indicator on a clean shell start.
{
  _losos_zdotdir="$ZDOTDIR"
  _losos_user_zdotdir="${LOSOS_USER_ZDOTDIR:-$HOME}"
  ZDOTDIR="$_losos_user_zdotdir"
  [ -f "$_losos_user_zdotdir/.zlogin" ] && source "$_losos_user_zdotdir/.zlogin"
  ZDOTDIR="$_losos_zdotdir"
  unset _losos_zdotdir _losos_user_zdotdir
}
:
