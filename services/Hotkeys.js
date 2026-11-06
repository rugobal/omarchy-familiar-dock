.pragma library
function activation(settings, n, modifier) {
    if (!settings["hot-keys"]) return null
    var value = String(modifier || "").toLowerCase(), source = "row"
    if (value.indexOf("kp:") === 0) { source = "kp"; value = value.slice(3) }
    if (value.indexOf("row:") === 0) value = value.slice(4)
    var mode = settings["shortcut-num-keys"]
    if ((source === "kp" && mode === "NUM_ROW") || (source === "row" && mode === "NUM_KEYPAD")) return null
    n = Number(n)
    if (!isFinite(n) || n < 1 || n > 10 || Math.floor(n) !== n || ["", "shift", "ctrl"].indexOf(value) < 0) return null
    return {index: n - 1, modifier: value}
}
function overlay(settings, primary, temporary) {
    return !!settings["hot-keys"] && (primary || settings["shortcut-overlay-on-secondary"]) &&
        (settings["hotkeys-overlay-combo"] === "ALWAYS" || (settings["hotkeys-overlay-combo"] === "TEMPORARILY" && temporary))
}
