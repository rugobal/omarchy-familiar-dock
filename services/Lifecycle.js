.pragma library

// The state directory can hold what the user keeps private, such as the
// birth year and life expectancy stashed with the clock. Parents keep the
// user's own umask. The directory itself is created mode 0700, so it is never
// briefly world-traversable, and chmod closes one an earlier version left
// open. Files already in it are closed to 0600 without following a symlink
// out of the directory. umask 077 then stays in effect, so a file written
// afterwards is owner-only from the moment it is created. chmod after the
// write would leave a window. `gone` runs when the directory went away
// between mkdir and chmod; the caller's umask is put back first so a retry
// still makes the parents the user's way.
function privateDir(gone) {
    return [
        '__umask=$(umask)',
        'mkdir -p -- "$(dirname -- "$state")" || exit 1',
        'umask 077',
        'mkdir -p -m 700 -- "$state" || exit 1',
        'chmod 700 -- "$state" || { umask "$__umask"; [[ -e $state ]] && exit 1; ' + gone + '; }',
        'for __f in "$state"/* "$state"/.[!.]* "$state"/..?*; do',
        '  [[ -f "$__f" && ! -L "$__f" ]] || continue',
        '  chmod 600 -- "$__f" || { [[ -e "$__f" ]] && exit 1; }',
        'done'
    ].join('\n')
}
var privateState = privateDir('exit 1')

// All clock/dock mutations and final cleanup share this lock. Cleanup removes
// the directory: a waiter must reject an unlinked lock inode before proceeding,
// and one whose directory was removed under it starts over.
var lock = [
    'while :; do',
    '  [[ ${mode:-} != cleanup || -d $state ]] || exit 0',
    '  ' + privateDir('continue'),
    '  exec 9>"$state/clock.lock" || continue',
    '  flock -x 9 || exit 1',
    '  [[ "$state/clock.lock" -ef /proc/$$/fd/9 ]] && break',
    '  flock -u 9; exec 9>&-',
    'done'
].join("\n")

var checks = [
    'valid_config() { jq -e \'type == "object" and ((.plugins // []) | type == "array") and ((.disabledPlugins // []) | type == "array")\' "$config" >/dev/null 2>&1; }',
    'plugin_enabled() { jq -e \'any(.plugins[]?; .id == "rugobal.familiar-dock") and ((.disabledPlugins // [] | index("rugobal.familiar-dock")) == null)\' "$config" >/dev/null 2>&1; }',
    'dock_disabled() { jq -e \'(.disabledPlugins // [] | index("omarchy.dock")) != null\' "$config" >/dev/null 2>&1; }'
].join("\n")
