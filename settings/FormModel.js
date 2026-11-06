.pragma library
.import "../services/Defaults.js" as Defaults
.import "../services/Config.js" as Config
.import "Descriptors.js" as Descriptors
.import "MenuList.js" as Menus
.import "../services/DrawerClick.js" as DrawerClick

// Overview gathers settings from the other pages; it owns none itself.
var tabs = ["Overview", "Position", "Style", "Behavior", "Action", "Fine-Tune", "About"]
var positions = ["stackedTL", "stackedBR", "centered", "centerMonitor"]
function safe(value) {
    return String(value === undefined ? "" : value).slice(0, 4096).replace(/&/g, "＆").replace(/</g, "‹").replace(/>/g, "›")
}
function helpText(strings, field) {
    if (!field.help) return ""
    var text = strings.t(field.help)
    return text && text !== field.help ? text : ""
}
function control(entry) {
    var key = entry.key, value = Config.own(Defaults.values,key) ? Defaults.values[key] : Defaults.inertValues[key], type
    if (key === "favorites") type = "Pins"
    else if (key === "panel-element-positions") type = "LayoutEditor"
    else if (key === "panel-positions" || key === "panel-anchors" || Defaults.enums[key]) type = "Dropdown"
    else if (key === "primary-monitor") type = "Monitor"
    else if (key === "show-apps-hotkey") type = "Hotkey"
    else if (key === "show-apps-click") type = "DrawerClick"
    else if (key === "panel-sizes" || key === "panel-lengths") type = "MonitorNumber"
    else if (typeof value === "boolean") type = "Toggle"
    else if (typeof value === "number") type = Defaults.integerKeys.indexOf(key) >= 0 ? "NumberField" : "PanelSlider"
    else if (typeof value === "string") type = /color/.test(key) ? "ColorField" : "TextField"
    else if (Array.isArray(value)) type = "ListEditor"
    else type = "AnimationEditor"
    var options = Defaults.enums[key] || (key === "panel-positions" ? ["TOP","BOTTOM","LEFT","RIGHT"] : key === "panel-anchors" ? ["START","MIDDLE","END"] : [])
    return Object.assign({}, entry, {type: type, options: options, editorKey: Menus.editorKey(key), perMonitor: Config.own(Config.monitorDefaults, key)})
}
var controls = Descriptors.entries.map(control)
function groups(tab) {
    var result = []
    controls.filter(function(c) { return c.tab === tab }).forEach(function(c) { if (result.indexOf(c.group) < 0) result.push(c.group) })
    return result
}
function fields(tab, group, monitorCount) {
    return controls.filter(function(c) {
        return c.tab === tab && c.group === group && c.editorKey === c.key &&
            !(monitorCount <= 1 && c.key === "panel-element-positions-monitors-sync")
    })
}
function value(settings, field, monitor, primary) {
    return field.perMonitor ? Config.forMonitor(settings, field.key, monitor, primary) : settings[field.key]
}
function range(key) { return /(?:animation-time|anim-time)$/.test(key) ? [0,300] : key === "panel-sizes" ? [16,256] : key === "panel-lengths" ? [-1,100] : Config.numberRange(key) }
// Keep the legacy scalar as a wildcard when the first monitor override is made.
function change(raw, field, value, monitor, all) {
    if (!field.perMonitor) return value
    if (all) { var wildcard = {}; wildcard["*"] = value; return wildcard }
    var old = raw[field.key], next = Config.object(old) ? Config.clone(old) : {}
    if (old !== undefined && !Config.object(old)) next["*"] = Config.clone(old)
    // Layout sync explicitly reads '*' rather than named entries.
    next[all ? "*" : monitor] = value
    return next
}
function validValue(field, value) {
    var key = field.key
    if (field.perMonitor) {
        if (key === "panel-element-positions") return Array.isArray(value) && value.length === 9 && value.every(function(row, index) {
            return Config.object(row) && Defaults.elementLayout.some(function(d) { return d.element === row.element }) &&
                typeof row.visible === "boolean" && positions.indexOf(row.position) >= 0 &&
                value.findIndex(function(r) { return r.element === row.element }) === index
        })
        if (key === "panel-lengths") return typeof value === "number" && (value === -1 || (value >= 20 && value <= 100))
        return JSON.stringify(Config.monitorValue(key, value)) === JSON.stringify(value)
    }
    if (field.type === "ColorField") return !!Config.parseColor(value)
    if (field.type === "ListEditor") {
        if (!Array.isArray(value) || value.length > 64) return false
        return key === "context-menu-entries" ? value.every(function(row) {
            return Config.object(row) && typeof row.title === "string" && row.title.length <= 256 && typeof row.cmd === "string" && row.cmd.length <= 4096
        }) : value.every(function(v) { return typeof v === "string" && v.length <= 4096 })
    }
    if (field.type === "AnimationEditor") {
        return Config.object(value) && Object.keys(value).length <= 3 && Object.keys(value).every(function(mode) {
            var n = value[mode], r = /duration/.test(key) ? [0,300] : /rotation/.test(key) ? [-180,180] : [0,10]
            return ["SIMPLE","RIPPLE","PLANK"].indexOf(mode) >= 0 && typeof n === "number" && isFinite(n) && n >= r[0] && n <= r[1]
        })
    }
    if (field.type === "DrawerClick") {
        // Through a QML signal the object comes back with its keys sorted.
        var n = DrawerClick.normalize(value)
        return Config.object(value) && Object.keys(value).length === Object.keys(n).length &&
            Object.keys(n).every(function(k) { return value[k] === n[k] })
    }
    var changes = {}; changes[key] = value
    return JSON.stringify(Config.validate(changes)[key]) === JSON.stringify(value)
}
function parseInput(field, text) {
    var value = field.type === "ListEditor" ? JSON.parse(text) : text
    if (!validValue(field, value)) throw new Error("settings.invalidValue")
    return value
}
// What a field is worth with no settings file, for the "changed" mark and
// its reset. Pins are the user's own list and are never "changed".
var defaults = Config.validate({})
function defaultValue(field, monitor, primary) {
    if (field.type === "ListEditor") return Menus.rows(defaults, field.key)
    return value(defaults, field, monitor, primary)
}
function current(settings, field, monitor, primary) {
    if (field.type === "ListEditor") return Menus.rows(settings, field.key)
    return value(settings, field, monitor, primary)
}
function changed(settings, field, monitor, primary) {
    if (field.type === "Pins") return false
    // The app, key and command kept for other actions are not what a click does.
    if (field.type === "DrawerClick") return JSON.stringify(DrawerClick.effective(current(settings, field, monitor, primary))) !==
        JSON.stringify(DrawerClick.effective(defaultValue(field, monitor, primary)))
    return JSON.stringify(current(settings, field, monitor, primary)) !== JSON.stringify(defaultValue(field, monitor, primary))
}
// The fields a monitor count shows, in page order, for counts and search.
function visibleFields(monitorCount) {
    var result = []
    tabs.forEach(function(tab) { groups(tab).forEach(function(group) { result = result.concat(fields(tab, group, monitorCount)) }) })
    return result
}
// The keys of the settings that differ from their defaults, in page order.
function changedKeys(settings, monitorCount, monitor, primary) {
    return visibleFields(monitorCount).filter(function(field) { return changed(settings, field, monitor, primary) })
        .map(function(field) { return field.key })
}
function changedCount(settings, monitorCount, monitor, primary) {
    return changedKeys(settings, monitorCount, monitor, primary).length
}
// A handful of short choices reads faster side by side than behind a list.
function choice(field, strings) {
    if (field.type !== "Dropdown" || field.options.length > 4) return false
    var length = field.options.reduce(function(total, option) { return total + String(strings.t("settings.option." + option)).length }, 0)
    return length <= 30
}
