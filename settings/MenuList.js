.pragma library

var pairs = {
    "panel-context-menu-commands": "panel-context-menu-titles",
    "show-apps-button-context-menu-commands": "show-apps-button-context-menu-titles"
}
function editorKey(key) {
    return Object.keys(pairs).filter(function(k) { return pairs[k] === key })[0] || key
}
function rows(settings, key) {
    if (key === "context-menu-entries") return settings[key].map(function(r) { return {title: r.title, cmd: r.cmd} })
    var commands = settings[key], titles = settings[pairs[key]], result = []
    for (var i = 0; i < Math.min(64, Math.max(commands.length, titles.length)); i++) {
        result.push({title: titles[i] || "", cmd: commands[i] || ""})
    }
    return result
}
function valid(rows, key) {
    var titleLimit = key === "context-menu-entries" ? 256 : 4096
    return Array.isArray(rows) && rows.length <= 64 && rows.every(function(r) {
        return r && typeof r.title === "string" && r.title.length <= titleLimit && typeof r.cmd === "string" && r.cmd.length <= 4096
    })
}
function changes(key, rows) {
    if (!valid(rows, key)) throw new Error("settings.invalidValue")
    var result = {}
    if (key === "context-menu-entries") result[key] = rows.map(function(r) { return {title:r.title, cmd:r.cmd} })
    else {
        if (!pairs[key]) throw new Error("Unknown menu list")
        result[key] = rows.map(function(r) { return r.cmd })
        result[pairs[key]] = rows.map(function(r) { return r.title })
    }
    return result
}
