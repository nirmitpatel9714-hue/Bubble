# losos-shell-integration (fish)
# Emits OSC 7 (cwd) + OSC 133 A/B/C/D so the host tracks cwd and prompt
# boundaries without re-parsing the prompt. fish 4.0+ writes its own OSC 133
# A/B (the `mark-prompt` feature); LosOS disables it at spawn via
# fish_features=no-mark-prompt so these markers aren't emitted twice.

# Installed into conf.d, which every fish session sources; only LosOS-spawned
# shells (LOSOS_TERMINAL=1) may get their prompt wrapped.
if not set -q LOSOS_TERMINAL
    exit 0
end
if set -q __LOSOS_HOOKS_LOADED
    exit 0
end
set -g __LOSOS_HOOKS_LOADED 1

if set -q LOSOS_CLI; and test -x "$LOSOS_CLI"
    function losos
        command "$LOSOS_CLI" $argv
    end
end

# LosOS is a clean terminal; drop fish's default startup greeting. A user who
# sets their own in config.fish (sourced after this) keeps it.
function fish_greeting
end

set -g __LOSOS_HOST (uname -n 2>/dev/null; or echo localhost)

# URL-encode a path keeping `/` intact so it stays valid inside file://.
function __losos_urlencode_path
    set -l parts (string split '/' -- $argv[1])
    set -l out
    for p in $parts
        if test -n "$p"
            set out $out (string escape --style=url -- $p)
        else
            set out $out ""
        end
    end
    string join '/' $out
end

function __losos_restore_status
    return $argv[1]
end

function __losos_capture_user_prompt
    if not functions -q fish_prompt
        return
    end
    if functions fish_prompt | string match -q '*__losos_user_prompt*'
        return
    end
    functions -e __losos_user_prompt 2>/dev/null
    functions -c fish_prompt __losos_user_prompt
end

# Wrapped so `fish -C __losos_install_prompt` can re-run it AFTER config.fish,
# where a framework prompt (starship etc.) would otherwise override fish_prompt
# and drop our markers.
function __losos_install_prompt
    # ponytail: cover Conda's named wrapper; generalize if another prompt
    # framework preserves LosOS indirectly.
    if not set -q LOSOS_BLOCKS
        and functions -q __fish_prompt_orig
        and functions fish_prompt | string match -q '*__fish_prompt_orig*'
        and functions __fish_prompt_orig | string match -q '*__losos_user_prompt*'
        return
    end
    __losos_capture_user_prompt
    if set -q LOSOS_BLOCKS
        function fish_right_prompt
        end
        function fish_greeting
        end
    end
    function fish_prompt
        set -l __losos_status $status
        printf '\e]133;D;%d\e\\' $__losos_status
        printf '\e]7;file://%s%s\e\\' "$__LOSOS_HOST" (__losos_urlencode_path "$PWD")
        printf '\e]133;A\e\\'
        # Block mode: host renders its own input bar, so suppress the shell prompt
        # (B marker only) and reserve header/gap rows, mirroring zsh.
        if set -q LOSOS_BLOCKS
            if set -q __losos_block_seen
                printf '\n\n'
            else
                printf '\n'
            end
            printf '\e]133;B\e\\'
            return
        end
        __losos_restore_status $__losos_status
        if functions -q __losos_user_prompt
            __losos_user_prompt
        else
            printf '%s > ' (prompt_pwd)
        end
        printf '\e]133;B\e\\'
    end
end
__losos_install_prompt

function __losos_preexec --on-event fish_preexec
    set -g __losos_block_seen 1
    set -l cmd (string replace -ra '[\x00-\x1f\x7f]' ' ' -- "$argv")
    printf '\e]133;C;%s\e\\' (string sub -l 256 -- "$cmd")
end
