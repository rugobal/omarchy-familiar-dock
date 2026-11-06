.pragma library
.import "Lifecycle.js" as Lifecycle

// Embedded before deletion of a git-installed plugin. Cleanup is the sole
// shutdown restoration owner; these bodies run with its shared clock lock held.
var lockedRestore = [
    Lifecycle.checks,
    '[[ -f "$state/dock-hidden" ]] || exit 0',
    // A pending hide may still be saved after shell.json reads "enabled": the
    // shell must hear "enable" after it, or the dock would end up off with no
    // marker left to bring it back. The shell takes requests in order, so an
    // enable it accepted is its last word.
    'owed=0; [[ $(<"$state/dock-hidden") != pending ]] || owed=1',
    'deadline=$((SECONDS + 30)); backoff=1; attempt=0',
    'while :; do',
    '  valid_config || exit 1',
    // CLI/socket failure does not imply failure to persist the new state.
    '  if (( !owed )) && ! dock_disabled; then rm -f "$state/dock-hidden"; exit 0; fi',
    '  if [[ $mode == cleanup ]] && plugin_enabled; then exit 0; fi',
    '  (( SECONDS < deadline && attempt < 12 )) || exit 1; attempt=$((attempt + 1))',
    '  if timeout 2s omarchy plugin enable omarchy.dock; then owed=0; fi',
    '  valid_config || exit 1',
    '  if (( !owed )) && ! dock_disabled; then rm -f "$state/dock-hidden"; exit 0; fi',
    '  if [[ $mode == cleanup ]] && plugin_enabled; then exit 0; fi',
    '  remaining=$((deadline - SECONDS)); (( remaining > 0 )) || exit 1',
    '  sleep "$((backoff < remaining ? backoff : remaining))"',
    '  (( backoff >= 4 )) || backoff=$((backoff * 2))',
    'done'
].join("\n")

var header = 'state="$1/.local/state/familiar-dock"; config="$1/.config/omarchy/shell.json"\n'
var hideScript = header + Lifecycle.checks + '\nvalid_config && plugin_enabled || exit 0\nmode=hide\n' + Lifecycle.lock + '\n' + [
    Lifecycle.checks,
    'valid_config || exit 1',
    'plugin_enabled || exit 0',
    'marker="$state/dock-hidden"',
    // The marker is written first and reads "pending" until shell.json shows
    // the dock disabled; the shell saves that file after the command returns.
    // A confirmed (empty) marker with the dock back on means the user enabled
    // it by hand, so it stays on. A pending one means the hide never landed,
    // so it is tried again.
    'if [[ -e $marker ]]; then',
    '  [[ $(<"$marker") == pending ]] || exit 0',
    'elif dock_disabled; then exit 0',
    'fi',
    'if ! dock_disabled; then',
    '  printf pending > "$marker.tmp" && mv -f "$marker.tmp" "$marker" || exit 1',
    // Preserve write-ahead ownership even when the shell socket is busy.
    '  timeout 2s omarchy plugin disable omarchy.dock || :',
    'fi',
    'for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do',
    '  if valid_config && dock_disabled; then : > "$marker"; exit 0; fi',
    '  sleep 0.1',
    'done'
].join("\n")

// Explicit live setting changes only, never Component.onDestruction.
var liveRestoreScript = header + 'mode=live\n' + Lifecycle.lock + '\n' + lockedRestore
