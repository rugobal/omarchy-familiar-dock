.pragma library
.import "Config.js" as Config
.import "Lifecycle.js" as Lifecycle

// The bar takes an entry as an object or as its bare id; a bare one has no
// settings of its own.
function findEntry(layout) {
    var sections = ["left", "centerBegin", "center", "centerEnd", "right", "tray"]
    for (var s = 0; s < sections.length; s++) {
        var rows = layout && layout[sections[s]]
        if (!Array.isArray(rows)) continue
        for (var i = 0; i < rows.length; i++) {
            if (rows[i] === "omarchy.clock") return {section: sections[s], index: i, entry: {id: "omarchy.clock"}}
            if (Config.object(rows[i]) && rows[i].id === "omarchy.clock") return {section: sections[s], index: i, entry: rows[i]}
        }
    }
    return null
}
function source(ready, visible) { return visible === false ? "hidden" : (ready ? "omarchy" : "fallback") }
function decision(shown, disabled, marker, pluginEnabled) {
    if (marker && (!shown || !pluginEnabled)) return "restore"
    if (shown && pluginEnabled && !disabled && !marker) return "hide"
    return "nothing"
}
function visibleLayout(settings, monitor, primary, visible) {
    var key = settings["panel-element-positions-monitors-sync"] ? "*" : monitor
    var layout = settings["panel-element-positions"]
    var result = Config.object(layout) ? Config.clone(layout) : (Array.isArray(layout) ? {"*": Config.clone(layout)} : {})
    result[key] = Config.forMonitor(settings, "panel-element-positions", monitor, primary).map(function(row) {
        return {element: row.element, visible: row.element === "dateMenu" ? !!visible : row.visible, position: row.position}
    })
    return result
}
// Runtime-only scripts. These are never executed against the real desktop by tests.
// The installed registry removes bar entries on disable, so the marker IS the
// write-ahead stash of settings and placement until restoration completes.
var lockedScript = [
    'set -euo pipefail',
    'state="$1/.local/state/familiar-dock"; mode=$2; supplied=${3:-null}',
    'config="$1/.config/omarchy/shell.json"',
    'marker="$state/clock-hidden"',
    'if [[ $mode == update ]]; then',
    '  [[ -s $marker ]] || exit 1',
    // While a clock may still be on the bar (a hide not yet seen to land, or a
    // restore not finished), it may hold the settings the stash had before:
    // those are kept with it, so that clock is still known as this stash's.
    '  jq --argjson entry "$supplied" \'if (.pending == true or .placed == true) and .entry != $entry then .prior = ((.prior // []) + [.entry]) else . end | .entry = $entry\' "$marker" > "$marker.tmp"; mv -f "$marker.tmp" "$marker"; exit 0',
    'fi',
    'jq -e \'type == "object" and ((.plugins // []) | type == "array")\' "$config" >/dev/null || exit 1',
    'if [[ $mode != cleanup ]] && ! jq -e \'any(.plugins[]?; .id == "rugobal.familiar-dock") and ((.disabledPlugins // [] | index("rugobal.familiar-dock")) == null)\' "$config" >/dev/null; then exit 0; fi',
    'if [[ $mode == cleanup ]] && jq -e \'any(.plugins[]?; .id == "rugobal.familiar-dock") and ((.disabledPlugins // [] | index("rugobal.familiar-dock")) == null)\' "$config" >/dev/null; then exit 0; fi',
    // The shell's config as it holds it now. shell.json is saved after a
    // change, so it can lag behind; the shell answers requests in order, so
    // this shows what every request sent before it did. No answer: exit.
    'live() { timeout 5s omarchy-shell shell listShellConfig | jq -ce \'select(type == "object" and (.bar.layout | type) == "object")\'; }',
    // Every omarchy.clock in a config on stdin, as [{section, index, entry}];
    // a bare id stays a string.
    'clocks() { jq -c \'[.bar.layout | to_entries[] | .key as $s | (.value | if type == "array" then . else [] end) | to_entries[] | select(.value == "omarchy.clock" or ((.value | type) == "object" and .value.id == "omarchy.clock")) | {section:$s,index:.key,entry:.value}]\'; }',
    // Whether the one clock in $found is an entry holding only what the stash
    // holds, now or before a settings change: one a restore put back and may
    // not have finished setting, or the one a hide that never landed left. One
    // holding anything else, or a bare id that takes no settings, is the user's.
    'stashed() { jq -e --slurpfile stash "$marker" \'$stash[0] as $s | length == 1 and (.[0].entry | type == "object" and all(to_entries[]; .key as $k | .value as $v | $k == "id" or $v == $s.entry[$k] or any(($s.prior // [])[] | objects; .[$k] == $v)))\' <<<"$found" >/dev/null; }',
    'save() { mv -f "$marker.tmp" "$marker"; }',
    'if [[ $mode == show ]]; then',
    // A confirmed stash stays as it is, and so does a clock on the bar now:
    // the user put it back. The stash keeps the settings to put back. A
    // pending one means the hide never landed, and a placed one that a
    // restore was cut short: either is tried again.
    '  if [[ -f $marker ]]; then jq -e \'.pending == true or .placed == true\' "$marker" >/dev/null || exit 0; fi',
    '  now=$(live); found=$(clocks <<<"$now")',
    '  jq -e \'(.disabledPlugins // [] | index("omarchy.clock")) == null\' <<<"$now" >/dev/null || exit 0',
    '  case $(jq length <<<"$found") in',
    '    0) if [[ -f $marker ]]; then jq -c \'del(.pending, .placed, .prior)\' "$marker" > "$marker.tmp"; save; fi; exit 0 ;;',
    '    1) ;;',
    // Two clocks only come from a hand-edited shell.json, and the CLI cannot
    // put a second one back: leave them all where they are.
    '    *) exit 0 ;;',
    '  esac',
    // A clock this stash put back, whole or in part, goes away again with the
    // stash as it was. A placed one the user has changed since is theirs.
    '  if [[ -f $marker ]] && stashed; then',
    '    jq -c \'del(.placed) + {pending: true}\' "$marker" > "$marker.tmp"; save',
    '  elif [[ -f $marker ]] && ! jq -e \'.pending == true\' "$marker" >/dev/null; then exit 0',
    '  else',
    // Written first, pending until the shell shows the clock gone.
    '    jq -c \'.[0] | .entry |= (if type == "string" then {id: .} else . end) | . + {pending: true}\' <<<"$found" > "$marker.tmp"; save',
    '  fi',
    '  timeout 2s omarchy plugin disable omarchy.clock || :',
    '  if [[ $(live | clocks | jq length) == 0 ]]; then jq -c \'del(.pending, .prior)\' "$marker" > "$marker.tmp"; save; fi',
    '  exit 0',
    'fi',
    '[[ -s $marker ]] || exit 0',
    'section=$(jq -er \'.section | select(. == "left" or . == "centerBegin" or . == "center" or . == "centerEnd" or . == "right" or . == "tray")\' "$marker")',
    'index=$(jq -er \'.index | select(type == "number" and . >= 0 and . == floor)\' "$marker")',
    'now=$(live); found=$(clocks <<<"$now")',
    'case $(jq length <<<"$found") in',
    '  0) ;;',
    '  1) stashed || { rm -f "$marker"; exit 0; } ;;',
    '  *) rm -f "$marker"; exit 0 ;;',
    'esac',
    // From here a clock on the bar is this stash's until the settings are on
    // it: a show before then takes it away again.
    // With no clock on the bar, the settings an earlier clock may have held
    // say nothing about the one put now.
    'if [[ $(jq length <<<"$found") == 0 ]]; then jq -c \'del(.prior) + {placed: true}\' "$marker" > "$marker.tmp"; save',
    'elif ! jq -e \'.placed == true\' "$marker" >/dev/null; then jq -c \'. + {placed: true}\' "$marker" > "$marker.tmp"; save; fi',
    // `put` adds a clock only where none is, and returns 0 even when the shell
    // never answers.
    'if [[ $(jq length <<<"$found") == 0 ]]; then',
    '  omarchy bar put omarchy.clock --section "$section" --index "$index"',
    '  now=$(live); found=$(clocks <<<"$now")',
    '  stashed || exit 1',
    'fi',
    // Its settings go to the clock in its section: the shell puts it earlier
    // than the stash says when that section has shrunk.
    'at=$(jq -r \'.[0].section\' <<<"$found")',
    'while IFS= read -r key; do',
    '  value=$(jq -c --arg key "$key" \'.entry[$key]\' "$marker")',
    '  omarchy bar set omarchy.clock "$key" "$value" --json --from-section "$at"',
    'done < <(jq -r --slurpfile stash "$marker" \'.[0].entry as $e | $stash[0].entry | to_entries[] | select(.key != "id" and $e[.key] != .value) | .key\' <<<"$found")',
    // The stash goes only once the shell shows the clock with all of it.
    'now=$(live); found=$(clocks <<<"$now")',
    'jq -e --slurpfile stash "$marker" \'length == 1 and (.[0].entry | type == "object") and (.[0].entry as $e | all($stash[0].entry | to_entries[]; $e[.key] == .value))\' <<<"$found" >/dev/null || exit 1',
    'rm -f "$marker"'
].join("\n")
var script = 'state="$1/.local/state/familiar-dock"; mode=$2\n' +
    'config="$1/.config/omarchy/shell.json"\n' + Lifecycle.checks + '\n' +
    'if [[ $mode == cleanup ]]; then sleep 3; else valid_config && plugin_enabled || exit 0; fi\n' +
    Lifecycle.lock + '\n' + lockedScript
