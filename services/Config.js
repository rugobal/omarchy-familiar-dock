.pragma library
.import "Defaults.js" as Defaults
.import "Chord.js" as Chord
.import "DrawerClick.js" as DrawerClick

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value) }
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

// CSS alpha is last in #rrggbbaa; Qt's eight-digit hex syntax is different.
// Parse here and pass channels to Qt.rgba, never bind CSS strings as QML colors.
function parseColor(value) {
    if (typeof value !== "string" || value.length > 128) return null
    var s = value.trim(), m = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(s)
    if (m) {
        var h = m[1]
        if (h.length === 3) h = h.replace(/./g, function(c) { return c + c })
        return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255,
                parseInt(h.slice(4, 6), 16) / 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1]
    }
    m = /^(rgb|rgba)\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s)
    if (!m || (m[1].toLowerCase() === "rgba") !== (m[5] !== undefined)) return null
    var channels = [Number(m[2]), Number(m[3]), Number(m[4]), m[5] === undefined ? 1 : Number(m[5])]
    if (channels.some(function(n, i) { return !isFinite(n) || n < 0 || n > (i === 3 ? 1 : 255) })) return null
    return [channels[0] / 255, channels[1] / 255, channels[2] / 255, channels[3]]
}

var monitorDefaults = { "panel-positions": "BOTTOM", "panel-sizes": 45, "panel-lengths": 100,
                        "panel-anchors": "MIDDLE", "panel-element-positions": Defaults.elementLayout }
function layout(value) {
    if (!Array.isArray(value)) return clone(Defaults.elementLayout)
    var seen = Object.create(null), result = []
    value.slice(0, 32).forEach(function(row) {
        if (!object(row) || seen[row.element]) return
        var def = Defaults.elementLayout.filter(function(d) { return d.element === row.element })[0]
        if (!def) return
        seen[row.element] = true
        result.push({ element: row.element, visible: typeof row.visible === "boolean" ? row.visible : def.visible,
            position: ["stackedTL", "stackedBR", "centered", "centerMonitor"].indexOf(row.position) >= 0 ? row.position : def.position })
    })
    Defaults.elementLayout.forEach(function(def) { if (!seen[def.element]) result.push(clone(def)) })
    return result
}
function monitorValue(key, value) {
    var def = monitorDefaults[key]
    if (key === "panel-element-positions") return layout(value)
    if (key === "panel-sizes") return typeof value === "number" && isFinite(value) ? Math.round(clamp(value, 16, 256)) : def
    if (key === "panel-lengths") return typeof value === "number" && isFinite(value) ? (value === -1 ? -1 : clamp(value, 20, 100)) : def
    var choices = key === "panel-positions" ? ["TOP", "BOTTOM", "LEFT", "RIGHT"] : ["START", "MIDDLE", "END"]
    return choices.indexOf(value) >= 0 ? value : def
}
function perMonitor(key, value) {
    if (!object(value)) return monitorValue(key, value)
    var out = Object.create(null)
    Object.keys(value).slice(0, 64).forEach(function(name) { out[name.slice(0, 256)] = monitorValue(key, value[name]) })
    return out
}
function forMonitor(settings, key, name, primary) {
    var value = settings[key]
    if (!own(monitorDefaults, key)) return value
    if (!object(value)) return value
    if (key === "panel-element-positions" && settings["panel-element-positions-monitors-sync"]) {
        if (own(value, "*")) return value["*"]
        if (own(value, primary)) return value[primary]
    } else if (own(value, name)) return value[name]
    return own(value, "*") ? value["*"] : clone(monitorDefaults[key])
}
function numberRange(key) {
    if (/^trans-.*(?:opacity|target)$/.test(key)) return [0, 1]
    if (/opacity$/.test(key)) return [0, 100]
    if (key === "global-border-radius") return [0, 5]
    if (key === "intellihide-persisted-state") return [-1, 1]
    if (/^(tray|leftbox|status-icon)-padding$/.test(key)) return [-1, 128]
    if (/time|delay|duration/.test(key)) return [0, 60000]
    if (/font-size/.test(key)) return [6, 96]
    if (/aspect-ratio/.test(key)) return [1, 100]
    if (key === "dot-size") return [1, 16]
    if (/appicon-(margin|padding)/.test(key)) return [0, 32]
    if (/margins|padding|border-width|border-radius/.test(key)) return [0, 128]
    return [0, 2048]
}
function strings(value, max) {
    return Array.isArray(value) ? value.slice(0, max || 1024).filter(function(v) { return typeof v === "string" && v.length <= 4096 }) : []
}
function favorites(value) {
    var result = []
    strings(value).forEach(function(v) {
        var id = v.trim().replace(/\.desktop$/, "")
        if (id && id.length <= 256 && !/[\x00-\x1f]/.test(id) && result.indexOf(id) < 0) result.push(id)
    })
    return result
}
// The settings a Custom look saved, each validated as its own key would be.
function savedLook(value) {
    var out = {}
    Object.keys(value).slice(0, 64).forEach(function(key) {
        if (key === "look-custom" || key === "favorites" || !own(Defaults.values, key)) return
        var one = {}; one[key] = value[key]
        out[key] = validate(one)[key]
    })
    return out
}
function validate(raw) {
    var result = clone(Defaults.values)
    Object.keys(Defaults.inertValues).forEach(function(key) { result[key] = clone(Defaults.inertValues[key]) })
    Object.keys(result).forEach(function(key) {
        if (!own(raw, key)) return
        var v = raw[key], def = result[key]
        if (own(monitorDefaults, key)) result[key] = perMonitor(key, v)
        else if (key === "favorites") result[key] = Array.isArray(v) ? favorites(v) : null
        else if (key === "look-custom") result[key] = object(v) ? savedLook(v) : null
        else if (key === "show-apps-click") result[key] = DrawerClick.normalize(v)
        else if (own(Defaults.enums, key)) result[key] = Defaults.enums[key].indexOf(v) >= 0 ? v : def
        else if (key === "show-apps-hotkey") { var chord = Chord.canonical(v); if (chord !== null) result[key] = chord }
        else if (typeof def === "boolean") result[key] = typeof v === "boolean" ? v : def
        else if (typeof def === "number") {
            var range = numberRange(key)
            if (typeof v === "number" && isFinite(v)) result[key] = clamp(Defaults.integerKeys.indexOf(key) >= 0 ? Math.round(v) : v, range[0], range[1])
        } else if (typeof def === "string") {
            if (typeof v === "string" && v.length <= 4096 && (!/color/.test(key) || parseColor(v))) result[key] = v
        } else if (key === "context-menu-entries") {
            if (Array.isArray(v)) result[key] = v.slice(0, 64).filter(function(row) {
                return object(row) && typeof row.title === "string" && row.title.length <= 256 && typeof row.cmd === "string" && row.cmd.length <= 4096
            }).map(function(row) { return {title: row.title, cmd: row.cmd} })
        } else if (Array.isArray(def)) result[key] = Array.isArray(v) ? strings(v) : def
        else if (object(v)) {
            var dict = clone(def)
            ;["SIMPLE", "RIPPLE", "PLANK"].forEach(function(type) {
                if (typeof v[type] !== "number" || !isFinite(v[type])) return
                var range = /duration/.test(key) ? [0, 300] : /rotation/.test(key) ? [-180, 180] : [0, 10]
                dict[type] = clamp(v[type], range[0], range[1])
            })
            result[key] = dict
        }
    })
    return result
}
function parse(text) {
    if (text.length > 1024 * 1024) throw new Error("Settings exceed 1 MiB")
    var raw = JSON.parse(text)
    if (!object(raw)) throw new Error("Settings must be an object")
    return { raw: raw, settings: validate(raw) }
}
// A FileView read can briefly be empty during initialization/atomic replacement.
// Retry a bounded number of completed reads; a persistently bad file still fails.
function readResult(text, attempt) {
    try { return {status: "ok", value: parse(text)} }
    catch (error) { return {status: attempt < 2 ? "retry" : "invalid", error: String(error)} }
}
function withFavorites(raw, list) {
    var next = clone(raw)
    next.favorites = favorites(list)
    return next
}
function effectiveFavorites(settings, systemDefaults) {
    return settings.favorites === null ? favorites(systemDefaults) : favorites(settings.favorites)
}

// `removed` lists keys to drop from the file, back to their defaults. Pins
// are the user's own list and are never dropped this way.
function withSettings(raw, changes, removed) {
    var next = clone(raw), valid = validate(changes)
    Object.keys(changes).forEach(function(key) { if (own(valid, key)) next[key] = valid[key] })
    var drop = Array.isArray(removed) ? removed : []
    drop.forEach(function(key) { if (key !== "favorites" && !own(changes, key) && own(valid, key)) delete next[key] })
    return next
}
function reorderFavorites(list, id, beforeId) {
    if (id === beforeId) return favorites(list)
    var result = favorites(list).filter(function(pin) { return pin !== id })
    var index = beforeId ? result.indexOf(beforeId) : result.length
    result.splice(index < 0 ? result.length : index, 0, id)
    return favorites(result)
}
