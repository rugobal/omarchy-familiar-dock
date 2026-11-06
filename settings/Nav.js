.pragma library
.import "FormModel.js" as Form

// The sidebar: an unheaded block of the everyday pages, then quiet headed
// blocks. Every page has an icon, a Font Awesome glyph from the theme's
// Nerd Font. Block titles are catalog keys.
var blocks = [
    {title: "", items: [
        {tab: "Overview", icon: ""},
        {tab: "Position", icon: ""},
        {tab: "Style", icon: ""},
        {tab: "Behavior", icon: ""},
        {tab: "Action", icon: ""}
    ]},
    {title: "settings.block.advanced", items: [{tab: "Fine-Tune", icon: ""}]},
    {title: "settings.block.plugin", items: [{tab: "About", icon: ""}]}
]
var order = blocks.reduce(function(list, block) { return list.concat(block.items.map(function(item) { return item.tab })) }, [])

// The switches flipped most often, as tiles across the top of Overview,
// and the panel's shape under them. The same fields as on their own pages.
var tiles = [
    {key: "intellihide", icon: ""},
    {key: "group-apps", icon: ""},
    {key: "show-window-previews", icon: ""},
    {key: "animate-appicon-hover", icon: ""},
    {key: "show-favorites", icon: ""},
    {key: "show-running-apps", icon: ""},
    {key: "isolate-workspaces", icon: ""},
    {key: "taskbar-locked", icon: ""}
]
var overviewKeys = ["panel-positions", "panel-sizes", "panel-anchors", "panel-lengths", "theme-bg-color",
    "trans-use-custom-opacity", "trans-panel-opacity"]
var overviewDrawerKeys = ["show-apps-click", "show-apps-hotkey"]
function field(key) { return Form.controls.filter(function(c) { return c.key === key })[0] }
// About's rows as SettingsAbout shows them: name, description, heading.
var aboutEntries = [
    {label: "settings.openFile", text: "~/.config/omarchy/familiar-dock.json", group: "settings.about.file"},
    {label: "settings.about.path", description: "settings.pathHint", group: "settings.transfer"},
    {label: "settings.export", description: "settings.about.exportHelp", group: "settings.transfer"},
    {label: "settings.import", description: "settings.about.importShort", group: "settings.transfer"},
    {label: "settings.reset", description: "settings.about.resetHelp", group: "settings.about.start"}
]

function term(query) { return String(query || "").trim().toLowerCase() }
// The heading a setting sits under and the page it is on count as its
// names too: "intellihide" finds every row under Intellihide.
function matches(search, label, description, group, page) {
    if (!search) return true
    return (String(label || "") + " " + String(description || "") + " " + String(group || "") + " " + String(page || ""))
        .toLowerCase().indexOf(search) >= 0
}
function fieldEntry(strings, f) {
    return {label: strings.t(f.label), description: Form.helpText(strings, f), group: strings.t("settings.group." + f.group), key: f.key}
}
// Everything a page shows a search, as {label, description, group}, with
// the setting's key for a row that is one setting.
function entries(tab, strings, monitorCount) {
    if (tab === "Overview") {
        var group = strings.t("settings.overview.panel")
        return [{label: strings.t("settings.label.look"), description: strings.t("settings.help.look"), group: ""}].concat(tiles.map(function(t) { return {label: strings.t("settings.tile." + t.key), description: strings.t(field(t.key).label), group: "", key: t.key} })
            .concat(overviewKeys.map(function(key) { var e = fieldEntry(strings, field(key)); e.group = group; return e }))
            .concat(overviewDrawerKeys.map(function(key) { var e = fieldEntry(strings, field(key)); e.group = strings.t("settings.overview.drawer"); return e })))
    }
    if (tab === "About") return aboutEntries.map(function(e) {
        return {label: strings.t(e.label), description: e.text || strings.t(e.description), group: strings.t(e.group)}
    })
    var result = []
    // Position's monitor rows, while there is a second monitor to choose.
    if (tab === "Position" && monitorCount > 1) {
        var monitors = strings.t("settings.group.monitors")
        result.push({label: strings.t("settings.monitor"), description: "", group: monitors})
        result.push({label: strings.t("settings.allMonitors"), description: strings.t("settings.allMonitorsHelp"), group: monitors})
    }
    Form.groups(tab).forEach(function(g) {
        Form.fields(tab, g, monitorCount).forEach(function(f) { result.push(fieldEntry(strings, f)) })
    })
    return result
}
// How many rows a page shows a search, or, given `shown` ({key: true}), the
// changed view: only settings in it count, the look and monitor rows do not.
function matchCount(tab, strings, monitorCount, search, shown) {
    if (!search && !shown) return 0
    var page = strings.t("settings.tab." + tab)
    return entries(tab, strings, monitorCount).filter(function(e) {
        return (!shown || (!!e.key && shown[e.key] === true)) && matches(search, e.label, e.description, e.group, page)
    }).length
}
// The changed view: a row shows while any setting it edits is in `shown`,
// which only grows while the view is open, so a row reset there stays put.
function shows(shown, keys) {
    return (keys || []).some(function(k) { return shown[k] === true })
}
function grown(shown, keys) {
    var next = null
    keys.forEach(function(k) { if (shown[k] !== true) { if (!next) next = Object.assign({}, shown); next[k] = true } })
    return next || shown
}

// One cap per key: a pair of arrows is two keys, a name ("Space") is one.
function caps(entry) {
    if (entry.keys !== undefined) return entry
    var key = String(entry.key || "")
    if (key.length > 1 && /^[←-↓]+$/.test(key)) return {keys: key.split(""), label: entry.label}
    return {keys: [key], label: entry.label}
}
// What the keys do here: the row under the cursor's own keys, a reset when
// it has something to hand back, then the keys that always apply.
function legend(row, state) {
    var keys = []
    if (state.searchFocused) return [{keys: ["↵"], label: "settings.key.toSettings"}, {keys: ["esc"], label: "settings.key.clear"}]
    if (state.typing) return [{keys: ["↵"], label: "settings.key.done"}, {keys: ["esc"], label: "settings.key.leave"}]
    var own = row && row.navKeys ? row.navKeys : []
    for (var i = 0; i < own.length; i++) keys.push(caps(own[i]))
    if (row && row.changed === true) keys.push({keys: ["⌫"], label: "settings.key.reset"})
    if (state.blocked) return keys
    keys.push({keys: ["↑", "↓"], label: "settings.key.move"})
    keys.push({keys: ["alt", "↑", "↓"], label: "settings.key.page"})
    keys.push({keys: ["/"], label: "settings.key.search"})
    // The changed view: c goes in, Escape comes back out.
    if (state.changedOnly) keys.push({keys: ["esc"], label: "settings.key.showAll"})
    else {
        if (state.changed) keys.push({keys: ["c"], label: "settings.key.changed"})
        keys.push({keys: ["esc"], label: "settings.key.close"})
    }
    return keys
}
