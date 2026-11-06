.pragma library
.import "ClockLogic.js" as Clock
.import "DockLifecycle.js" as Dock
.import "WindowFader.js" as Fader
.import "Lifecycle.js" as Lifecycle
.import "AppsKey.js" as AppsKey
.import "DrawerClick.js" as DrawerClick
function quote(text) { return "'" + text.replace(/'/g, "'\\''") + "'" }
// Everything is embedded in argv before the plugin directory can disappear.
// Keep recovery evidence whenever a restore fails. An active fixture transaction
// also keeps its exact backup even when the plugin has been removed.
var script = [
    'set -euo pipefail',
    'home=$1; state="$home/.local/state/familiar-dock"; config="$home/.config/omarchy/shell.json"; mode=cleanup',
    'sleep 3',
    'disabled() { jq -e \'type == "object" and ((.plugins // []) | type == "array") and ((any(.plugins[]?; .id == "rugobal.familiar-dock") | not) or ((.disabledPlugins // [] | index("rugobal.familiar-dock")) != null))\' "$config" >/dev/null; }',
    // The Super+Alt+Space binding lives in the compositor, not in the state
    // directory, so it is restored even when that directory never existed.
    'if disabled; then bash -c ' + quote(AppsKey.restoreScript) + ' familiar-dock-apps-key || :; fi',
    // A drawer click cut short can leave the functions it kept in a global.
    'if disabled; then timeout 5s hyprctl eval ' + quote(DrawerClick.forget) + ' >/dev/null 2>&1 || :; fi',
    '[[ -d $state ]] || exit 0',
    'disabled || exit 0',
    Lifecycle.lock,
    'disabled || exit 0',
    'failed=0',
    'bash -c ' + quote(Clock.lockedScript) + ' familiar-dock-clock "$home" cleanup || failed=1',
    'bash -c ' + quote(Dock.header + 'mode=cleanup\n' + Dock.lockedRestore) + ' familiar-dock-dock "$home" || failed=1',
    'if [[ -s $state/faded.json ]]; then bash -c ' + quote(Fader.script) + ' familiar-dock-fade "$home" removal cleanup \'{}\' || failed=1; fi',
    'disabled || exit 0',
    'if (( failed )) || [[ -e $state/clock-hidden || -e $state/dock-hidden || -e $state/faded.json ]]; then echo "familiar-dock: restoration incomplete; preserving recovery state" >&2; exit 1; fi',
    'exec 8>"$state/settings-test.lock"; flock -x 8',
    'rm -f -- "$state"/intellihide-*.json "$state"/intellihide-*.json.tmp "$state/clock.lock" "$state/fader.lock" "$state/fader-owner" "$state/fader-owner.tmp" "$state/clock-hidden.tmp" "$state/faded.json.tmp"',
    '[[ ! -e $state/settings-test-active ]] || exit 0',
    'rm -f -- "$state/settings-under-test.bak" "$state/settings-under-test.bak.tmp" "$state/settings-test-missing" "$state/settings-test.lock"',
    'rmdir -- "$state"'
].join("\n")
