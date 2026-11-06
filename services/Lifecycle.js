.pragma library

// All clock/dock mutations and final cleanup share this lock. Cleanup removes
// the directory: a waiter must reject an unlinked lock inode before proceeding.
var lock = [
    'while :; do',
    '  [[ ${mode:-} != cleanup || -d $state ]] || exit 0',
    '  mkdir -p "$state" || exit 1',
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
