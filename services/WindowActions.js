.pragma library

var DOUBLE_CLICK_DELAY_MS = 450
var MEMORY_TIME = 3000
function newWindowAction(entry) {
    return entry ? (entry.actions || []).filter(function(a) { return a.id === "new-window" })[0] || null : null
}
function address(value) {
    var text = String(value || "").replace(/^0x/, "")
    return /^[\da-f]+$/i.test(text) ? "0x" + text : ""
}
function sourceWorkspace(tags, fallback) {
    for (var i = 0; i < (tags || []).length; i++) {
        var m = /^omarchy-minimized-from-(\d+)$/.exec(tags[i])
        if (m && Number(m[1]) > 0) return Number(m[1])
    }
    return Number.isInteger(fallback) && fallback > 0 ? fallback : -1
}
// Shell.App.get_windows is MRU-ordered. Hyprland uses zero for the MRU window.
function interesting(windows) {
    return windows.slice().sort(function(a, b) { return a.focusHistory - b.focusHistory })
}
function pickWindow(windows) { return interesting(windows)[0] || null }
function hasFocus(windows, monitor) {
    return windows.some(function(w) { return w.activated && w.monitor === monitor })
}
function action(settings, button, modifiers) {
    var mods = String(modifiers || "").split(",")
    if (mods.indexOf("ctrl") >= 0) return "LAUNCH"
    return settings[(mods.indexOf("shift") >= 0 ? "shift-" : "") + (button === "middle" ? "middle-click-action" : "click-action")]
}
// Returns semantic operations; no UI or compositor calls in the decision table.
function activatePlan(settings, item, button, modifiers, panel, doubleClick, cycleAtMinimize) {
    var windows = interesting(item.windows), a = action(settings, button, modifiers)
    var shift = String(modifiers).split(",").indexOf("shift") >= 0
    var focused = hasFocus(windows, panel.monitorName)
    if (!windows.length) return {op: "launch"}
    if (a === "LAUNCH") return {op: "launch"}
    if (a === "QUIT") return {op: "close", windows: windows}
    if (!settings["group-apps"] && windows.length === 1) {
        var canMinimize = ["MINIMIZE", "TOGGLE-SHOWPREVIEW", "TOGGLE-CYCLE", "TOGGLE-SPREAD", "CYCLE-MIN"].indexOf(a) >= 0
        return {op: canMinimize && (focused || (a === "MINIMIZE" && (button === "middle" || shift))) ? "minimize" : "first", all: false}
    }
    if (a === "RAISE") return {op: "all"}
    if (a === "MINIMIZE") return {op: focused || button === "middle" || shift ? "minimize" : "all", all: (button === "left" && !modifiers) || doubleClick}
    if (a === "CYCLE") return {op: focused ? "cycle" : "first"}
    if (a === "CYCLE-MIN") return {op: focused || cycleAtMinimize ? "cycle" : "first", minimizeSlot: true}
    if (windows.length === 1) return {op: focused ? "minimize" : "first", all: false}
    if (a === "TOGGLE-CYCLE") return {op: "cycle"}
    return {op: doubleClick ? "minimize" : "preview", all: true}
}
function cycle(memory, key, monitor, windows, reversed, minimizeSlot, now) {
    var list = interesting(windows).map(function(w) { return address(w.address) })
    if (minimizeSlot) list.push("MINIMIZE")
    if (!list.length) return {memory: null, target: null}
    // Also invalidate when membership changes without a count change (closed/reopened).
    var valid = memory && now - memory.time < MEMORY_TIME && memory.key === key && memory.monitor === monitor
        && memory.list.length === list.length && memory.list.every(function(a) { return list.indexOf(a) >= 0 })
    var order = valid ? memory.list : list, index = (valid ? memory.index : 0) + (reversed ? -1 : 1)
    index = (index + order.length) % order.length
    return {memory: {key: key, monitor: monitor, list: order, index: index, time: now}, target: order[index]}
}
function minimizeCandidates(windows, workspace, all) {
    var list = interesting(windows).filter(function(w) { return !w.minimized && w.workspaceId === workspace })
    return all ? list : list.slice(0, 1)
}
function activateAllCandidates(windows) {
    var list = interesting(windows)
    if (!list.length) return []
    var first = list[0], ws = first.minimized ? sourceWorkspace(first.tags, first.workspaceId) : first.workspaceId
    return [first].concat(list.filter(function(w) { return (w.minimized ? sourceWorkspace(w.tags, w.workspaceId) : w.workspaceId) === ws }).reverse())
}
function showDesktopPlan(previous, windows, workspace) {
    if (previous && previous.length) return {op: "restore", windows: previous, remember: []}
    var list = interesting(windows).filter(function(w) { return !w.minimized && w.workspaceId === workspace }).reverse()
    return {op: "minimize", windows: list, remember: list}
}
function operations(mode, windows, workspace) {
    return windows.filter(function(w) { return address(w.address) }).map(function(w) {
        return {mode: mode, address: address(w.address), workspace: Number(workspace) > 0 ? Number(workspace) : 1}
    })
}

// Only validated addresses and integers enter generated Lua. All input is argv.
var mutationScript = [
    "set -euo pipefail",
    "clients=$(hyprctl clients -j)",
    "ops=$1",
    "batch=\"\"",
    "after=\"\"",
    "# Keep no_anim through the move, then relinquish it as the stock dock does.",
    "finish() { if [[ -n $after ]]; then sleep 0.4; hyprctl --batch \"$after\"; fi; }",
    "trap finish EXIT",
    "add() { batch+=\"dispatch $1;\"; }",
    "while IFS=$'\\t' read -r mode addr fallback; do",
    "  [[ $addr =~ ^0x[0-9a-fA-F]+$ && $fallback =~ ^[0-9]+$ ]] || continue",
    "  client=$(jq -c --arg a \"$addr\" 'first(.[] | select(.address == $a)) // empty' <<<\"$clients\")",
    "  [[ -n $client ]] || continue",
    "  target=\"window = \\\"address:$addr\\\"\"",
    "  ws=$(jq -r '.workspace.id' <<<\"$client\")",
    "  minimized=$(jq -r '.workspace.name == \"special:minimized\"' <<<\"$client\")",
    "  if [[ $mode == close ]]; then add \"hl.dsp.window.close({ $target })\"; continue; fi",
    "  if [[ $mode == minimize ]]; then",
    "    [[ $ws == \"$fallback\" && $minimized == false ]] || continue",
    "    while read -r tag; do",
    "      [[ $tag =~ ^omarchy-minimized-from-[0-9]+$ ]] && add \"hl.dsp.window.tag({ tag = \\\"-$tag\\\", $target })\"",
    "    done < <(jq -r '(.tags // [])[]' <<<\"$client\")",
    "    add \"hl.dsp.window.tag({ tag = \\\"+omarchy-minimized-from-$ws\\\", $target })\"",
    "    add \"hl.dsp.window.move({ workspace = \\\"special:minimized\\\", follow = false, $target })\"",
    "    add \"hl.dsp.focus({ workspace = \\\"$ws\\\" })\"",
    "  else",
    "    if [[ $minimized == true ]]; then",
    "      # Resolve the tag from this fresh snapshot, never from the QML cache.",
    "      from=$(jq -r '[.tags[]? | capture(\"^omarchy-minimized-from-(?<ws>[0-9]+)$\") | .ws | tonumber | select(. > 0)][0] // empty' <<<\"$client\")",
    "      [[ $from =~ ^[0-9]+$ ]] || from=$fallback",
    "      add \"hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"1\\\", $target })\"",
    "      add \"hl.dsp.window.move({ workspace = \\\"$from\\\", follow = false, $target })\"",
    "      while read -r tag; do",
    "        [[ $tag =~ ^omarchy-minimized-from-[0-9]+$ ]] && add \"hl.dsp.window.tag({ tag = \\\"-$tag\\\", $target })\"",
    "      done < <(jq -r '(.tags // [])[]' <<<\"$client\")",
    "    fi",
    "    add \"hl.dsp.focus({ $target })\"",
    "    add \"hl.dsp.window.alter_zorder({ mode = \\\"top\\\", $target })\"",
    "    if [[ $minimized == true ]]; then after+=\"dispatch hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"unset\\\", $target });\"; fi",
    "  fi",
    "done < <(jq -r '.[] | [.mode,.address,.workspace] | @tsv' <<<\"$ops\")",
    "if [[ -n $batch ]]; then",
    "  reply=$(hyprctl --batch \"$batch\")",
    "  if grep -Eiq 'invalid|error|failed' <<<\"$reply\"; then exit 1; fi",
    "fi",
    ""
].join("\n")
function desktopStateAfterFocus(state, now, guard, focusedAddress) {
    return now <= guard || !focusedAddress ? state : {}
}
function panelCycle(windows, reversed) {
    if (!windows.length) return null
    var current = windows.findIndex(function(w) { return w.activated })
    if (current < 0) return reversed ? windows[windows.length - 1] : windows[0]
    return windows[(current + (reversed ? -1 : 1) + windows.length) % windows.length]
}
function commandArgv(cmd) {
    return cmd === "TERMINALSETTINGS" ? ["xdg-terminal-exec"] : cmd ? ["uwsm-app", "--", "bash", "-c", String(cmd)] : []
}
function clickState(previous, button, now, modifiers) {
    var primary = button === "left" && String(modifiers || "").split(",").indexOf("ctrl") < 0
    return {doubleClick: primary && now - (previous || 0) < DOUBLE_CLICK_DELAY_MS, lastClick: primary ? now : previous}
}
