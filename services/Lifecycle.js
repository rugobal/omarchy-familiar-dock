.pragma library

// The state directory can hold what the user keeps private, such as the
// settings of the clock it stashes. Only its owner may enter it, and what is
// made in it from here on is theirs alone. chmod also closes a directory an
// earlier version left open. The parents keep the user's own umask. `gone`
// runs when the directory went away between mkdir and chmod.
function privateDir(gone) { return 'mkdir -p "$state" || exit 1; chmod 700 "$state" || { [[ -e $state ]] && exit 1; ' + gone + '; }; umask 077' }
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
