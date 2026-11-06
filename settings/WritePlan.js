.pragma library
.import "../services/Config.js" as Config
.import "../services/Defaults.js" as Defaults
.import "FormModel.js" as Form

// The FileView adapter and private-HOME tests share these write decisions.
// Parse the current disk bytes before considering ANY write, including reset.
function plan(text, operation, changes, removed) {
    var raw = Config.parse(text).raw
    if (operation === "reset") {
        var next = Config.clone(raw)
        Object.keys(Defaults.values).concat(Object.keys(Defaults.inertValues)).forEach(function(key) {
            if (key !== "favorites") delete next[key]
        })
        return {raw: raw, next: next, backup: text}
    }
    return {raw: raw, next: Config.withSettings(raw, changes, removed), backup: null}
}
function importChanges(text) {
    var raw = Config.parse(text).raw, changes = {}
    Object.keys(raw).forEach(function(key) {
        if (!Config.own(Defaults.values, key) && !Form.controls.some(function(c) { return c.key === key })) return
        if (key === "favorites") {
            if (raw[key] !== null && (!Array.isArray(raw[key]) || raw[key].some(function(v) { return typeof v !== "string" || v.length > 256 }))) throw new Error("settings.invalidImport")
        } else {
            var field = Form.controls.filter(function(c) { return c.key === key })[0]
            if (field) {
                if (field.perMonitor && Config.object(raw[key]) && (Object.keys(raw[key]).length > 64 || Object.keys(raw[key]).some(function(name) { return name.length > 256 }))) throw new Error("settings.invalidImport")
                var values = field.perMonitor && Config.object(raw[key]) ? Object.keys(raw[key]).map(function(k) { return raw[key][k] }) : [raw[key]]
                if (!values.every(function(v) { return Form.validValue(field, v) })) throw new Error("settings.invalidImport")
            } else if (JSON.stringify(Config.validate(raw)[key]) !== JSON.stringify(raw[key])) throw new Error("settings.invalidImport")
        }
        changes[key] = raw[key]
    })
    return changes
}
// Settings that hold shell commands, each with the keys that travel with it.
// An import must not change one unseen: a menu entry could keep its title
// and run something else.
var commandGroups = {
    "context-menu-entries": ["context-menu-entries"],
    "panel-context-menu-commands": ["panel-context-menu-commands", "panel-context-menu-titles"],
    "show-apps-button-context-menu-commands": ["show-apps-button-context-menu-commands", "show-apps-button-context-menu-titles"],
    "show-apps-click": ["show-apps-click"]
}
// Every command a group's setting holds, as [{title, command, live}], in
// validated settings. `live` says a click can run it now, as MenuModel and
// DrawerClick decide: a menu shows its first 64 entries, a command with no
// title is not shown, and the drawer runs only the command its action names.
var menuLimit = 64
function commandsOf(key, settings) {
    var value = settings[key]
    if (key === "show-apps-click") return Config.object(value) && value.command ? [{title: "", command: String(value.command), live: value.action === "command"}] : []
    if (!Array.isArray(value)) return []
    if (key === "context-menu-entries") return value.map(function(row, i) {
        return {title: String(Config.object(row) && row.title || ""), command: String(Config.object(row) && row.cmd || ""), live: i < menuLimit}
    })
    var titles = settings[key.replace(/commands$/, "titles")]
    return value.map(function(cmd, i) {
        var title = String(Array.isArray(titles) && titles[i] || "")
        return {title: title, command: String(cmd || ""), live: i < menuLimit && !!title}
    })
}
// The commands an import would add, as [{key, title, command}]. One that
// would run is asked about unless it runs now (or is a default); one that
// would not run yet is asked about unless the settings hold it already.
// Turning on a command that was kept but never ran counts as adding it.
function importCommands(changes, current) {
    var trusted = commandsOf("context-menu-entries", Defaults.values).map(function(c) { return c.command })
    var after = Config.validate(Object.assign({}, current, changes))
    var found = []
    Object.keys(commandGroups).forEach(function(key) {
        if (!commandGroups[key].some(function(k) { return Config.own(changes, k) })) return
        var now = commandsOf(key, current)
        var running = trusted.concat(now.filter(function(c) { return c.live }).map(function(c) { return c.command }))
        var held = trusted.concat(now.map(function(c) { return c.command }))
        commandsOf(key, after).forEach(function(c) {
            if (c.command.trim() && (c.live ? running : held).indexOf(c.command) < 0) found.push({key: key, title: c.title, command: c.command})
        })
    })
    return found
}
// Text made safe to read: everything is shown, and nothing can hide or
// reorder what follows it. Line breaks and tabs show as marks, a long run of
// spaces as its length, and control, zero-width and direction characters as
// their code points.
function visible(text) {
    return String(text)
        .replace(/\r\n|[\r\n\u2028\u2029]/g, " \u23ce ")
        .replace(/\t/g, "\u21e5")
        .replace(/ {4,}/g, function(run) { return " \u2423\u00d7" + run.length + " " })
        .replace(/[\x00-\x1f\x7f-\x9f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g, function(ch) {
            return "\u27e8U+" + ("000" + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4) + "\u27e9"
        })
}
// One entry per command for the review, [{title, text}]: the whole command,
// never cut short, so what is imported is what was read.
function reviewEntries(commands, t) {
    return commands.map(function(c) {
        var title = c.key === "show-apps-click" ? t("settings.importCommands.drawer") : visible(c.title.trim())
        if (title.length > 512) title = title.slice(0, 512) + "\u2026"
        return {title: title || t("settings.importCommands.untitled"), text: visible(c.command)}
    })
}
// The import without the groups that brought new commands: those menus and
// the drawer click stay as they are.
function withoutCommands(changes, commands) {
    var kept = Object.assign({}, changes)
    commands.forEach(function(c) { (commandGroups[c.key] || []).forEach(function(k) { delete kept[k] }) })
    return kept
}
function chosenPath(value, home, settingsPath) {
    var path = String(value || "").trim()
    if (path.indexOf("~/") === 0) path = home + path.slice(1)
    path = path.replace(/\/+/g, "/")
    if (path[0] !== "/" || path.length > 4096 || /[\x00-\x1f]/.test(path) || path === settingsPath.replace(/\/+/g, "/") || /(?:^|\/)\.\.?(?:\/|$)/.test(path)) return ""
    return path
}
