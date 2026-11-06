.pragma library
.import "../services/Config.js" as Config
.import "../services/Defaults.js" as Defaults

// A look sets the panel's appearance in one go: where the elements sit, the
// panel's shape and background, the hover effects and the running-app marks.
// Every look sets the same keys, so switching never leaves part of another
// look behind. Pins, the panel's edge and size, monitors, previews, menus
// and hotkeys are never a look's to change.
var keys = ["panel-element-positions", "panel-lengths", "panel-anchors",
    "global-border-radius", "panel-top-bottom-margins", "panel-side-padding",
    "trans-use-custom-bg", "trans-bg-color", "trans-use-custom-opacity", "trans-panel-opacity",
    "animate-appicon-hover", "animate-appicon-hover-animation-type", "animate-appicon-hover-macos",
    "animate-appicon-hover-animation-zoom",
    "highlight-appicon-hover", "focus-highlight", "dot-style-focused", "dot-style-unfocused", "intellihide"]

function row(element, visible, position) { return {element: element, visible: visible, position: position} }
// A key a look leaves out is at its default.
var looks = [
    // A full-width bar: Show Apps at the far left, the apps centred, the
    // clock and Show Desktop at the right, dashes under focused apps.
    {id: "windows", values: {
        "panel-element-positions": [
            row("showAppsButton", true, "stackedTL"), row("activitiesButton", false, "centered"),
            row("leftBox", true, "stackedTL"), row("taskbar", true, "centerMonitor"),
            row("centerBox", true, "centered"), row("rightBox", false, "stackedBR"),
            row("dateMenu", true, "stackedBR"), row("systemMenu", false, "stackedBR"),
            row("desktopButton", true, "stackedBR")],
        "dot-style-focused": "DASHES"
    }},
    // The macOS Dock: a rounded, floating dock that fits its icons, centred,
    // with Show Apps ahead of them, a light frosted tint, no clock or Show
    // Desktop, and a dot under each running app. The icons under the pointer
    // magnify a little (1.3x, the Dock's own way: the dock widens to fit);
    // the dock never hides.
    {id: "macos", values: {
        "panel-element-positions": [
            row("showAppsButton", true, "centerMonitor"), row("activitiesButton", false, "centered"),
            row("leftBox", true, "stackedTL"), row("taskbar", true, "centerMonitor"),
            row("centerBox", true, "centered"), row("rightBox", false, "stackedBR"),
            row("dateMenu", false, "stackedBR"), row("systemMenu", false, "stackedBR"),
            row("desktopButton", false, "stackedBR")],
        "panel-lengths": -1,
        "global-border-radius": 4,
        "panel-top-bottom-margins": 8,
        "panel-side-padding": 8,
        "trans-use-custom-bg": true,
        "trans-bg-color": "#ffffff",
        "trans-use-custom-opacity": true,
        "trans-panel-opacity": 0.15,
        "animate-appicon-hover": true,
        "animate-appicon-hover-animation-type": "PLANK",
        "animate-appicon-hover-macos": true,
        "animate-appicon-hover-animation-zoom": {"SIMPLE": 1, "RIPPLE": 1.25, "PLANK": 1.3},
        "highlight-appicon-hover": false,
        "focus-highlight": false,
        "dot-style-focused": "DOTS",
        "dot-style-unfocused": "DOTS"
    }}
]
var ids = looks.map(function(look) { return look.id })
var defaults = Config.validate({})

function find(id) { return looks.filter(function(look) { return look.id === id })[0] || null }
function monitorKey(key) { return Config.own(Config.monitorDefaults, key) }
function defaultValue(key) { return monitorKey(key) ? Config.clone(Config.monitorDefaults[key]) : Config.clone(defaults[key]) }
function valueOf(look, key) { return Config.own(look.values, key) ? Config.clone(look.values[key]) : defaultValue(key) }

// A value no one sees does not tell looks apart: the colour of a theme
// background, the opacity of a theme-set panel, the kind of an animation
// that is off.
function ignored(look, key) {
    if (key === "trans-bg-color") return !valueOf(look, "trans-use-custom-bg")
    if (key === "trans-panel-opacity") return !valueOf(look, "trans-use-custom-opacity")
    if (key === "animate-appicon-hover-animation-type" || key === "animate-appicon-hover-animation-zoom")
        return !valueOf(look, "animate-appicon-hover")
    if (key === "animate-appicon-hover-macos")
        return !valueOf(look, "animate-appicon-hover") || valueOf(look, "animate-appicon-hover-animation-type") !== "PLANK"
    return false
}
function same(key, a, b) {
    if (/color/.test(key)) return JSON.stringify(Config.parseColor(a)) === JSON.stringify(Config.parseColor(b))
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6
    if (key === "panel-element-positions") return JSON.stringify(Config.layout(a)) === JSON.stringify(Config.layout(b))
    return JSON.stringify(a) === JSON.stringify(b)
}
// The monitors a per-monitor key is read for: the connected ones, the
// primary, and every name the file holds a value for (the "*" fallback
// included), connected or not. A look writes one value for all of them, so
// a value it would drop must make the panel read as Custom, which is saved.
function names(settings, key, monitors, primary) {
    var result = (monitors || []).slice()
    if (primary) result.push(primary)
    if (Config.object(settings[key])) result = result.concat(Object.keys(settings[key]))
    result = result.filter(function(name, i) { return result.indexOf(name) === i })
    return result.length ? result : ["*"]
}
// Whether the panel shows this look on every monitor.
function matches(settings, look, monitors, primary) {
    return keys.every(function(key) {
        if (ignored(look, key)) return true
        var want = valueOf(look, key)
        // Only the zoom of the animation in use shows.
        if (key === "animate-appicon-hover-animation-zoom") {
            var type = valueOf(look, "animate-appicon-hover-animation-type")
            return same(key, Config.object(settings[key]) ? settings[key][type] : undefined, want[type])
        }
        if (!monitorKey(key)) return same(key, settings[key], want)
        return names(settings, key, monitors, primary).every(function(name) {
            return same(key, Config.forMonitor(settings, key, name, primary), want)
        })
    })
}
// The look the panel shows now, or "custom" when it matches none.
function current(settings, monitors, primary) {
    var look = looks.filter(function(l) { return matches(settings, l, monitors, primary) })[0]
    return look ? look.id : "custom"
}
function saved(settings) { return Config.object(settings["look-custom"]) }
// Custom is offered while it is what the panel shows, or once it was saved.
function choices(now, hasSaved) { return now === "custom" || hasSaved ? ids.concat(["custom"]) : ids.slice() }

// What the file holds for the look keys, as the plugin reads them; a key
// the file leaves out stays out when Custom is brought back.
function snapshot(raw) {
    var valid = Config.validate(raw), out = {}
    keys.forEach(function(key) { if (Config.own(raw, key)) out[key] = valid[key] })
    return out
}
// The write that switches to `id`: {changes, removals} for Config.setSettings,
// or null when there is nothing to do. A per-monitor key is set for every
// monitor; a key at its default is dropped from the file. Leaving Custom
// saves it first, so it can be picked again.
function plan(id, raw, settings, monitors, primary) {
    var now = current(settings, monitors, primary), changes = {}, removals = []
    if (id === now) return null
    if (id === "custom") {
        var kept = settings["look-custom"]
        if (!Config.object(kept)) return null
        keys.forEach(function(key) { if (Config.own(kept, key)) changes[key] = Config.clone(kept[key]); else removals.push(key) })
    } else {
        var look = find(id)
        if (!look) return null
        keys.forEach(function(key) {
            var value = valueOf(look, key)
            if (JSON.stringify(value) === JSON.stringify(defaultValue(key))) { removals.push(key); return }
            if (monitorKey(key)) { var all = {}; all["*"] = value; changes[key] = all }
            else changes[key] = value
        })
    }
    if (now === "custom") changes["look-custom"] = snapshot(raw)
    return {changes: changes, removals: removals}
}
