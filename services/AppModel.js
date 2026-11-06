.pragma library

function normalizeId(id) { return String(id || "").replace(/\.desktop$/, "") }

// Omarchy dock convention: --app-id claims first, then org.omarchy.<terminal program>.
function claimingEntryId(appId, entries) {
    for (var i = 0; i < entries.length; i++) {
        var words = String(entries[i].execString || "").split(/\s+/)
        if (words.indexOf("--app-id=" + appId) >= 0) return entries[i].id
    }
    if (appId.indexOf("org.omarchy.") !== 0) return ""
    var command = appId.slice(12)
    for (var j = 0; j < entries.length; j++) {
        var program = String((entries[j].command || [])[0] || "").split("/").pop()
        if (entries[j].runInTerminal && program === command) return entries[j].id
    }
    return ""
}
function chromiumId(appId) {
    var match = /^(?:crx_|chrome-)([a-p]{32})(?:-Default)?$/.exec(appId)
    return match ? "chrome-" + match[1] + "-Default" : ""
}
function webKey(appId) {
    var m = /^(?:chrome|chromium|brave|msedge|vivaldi|helium|opera)-([^_]+?_.*)-(?:Default|Profile_\d+)$/i.exec(appId)
    return m ? m[1].toLowerCase() : ""
}
function urlKey(exec) {
    var url = /https?:\/\/[^\s"'<>]+/i.exec(String(exec || ""))
    var m = url && /^https?:\/\/(?:[^\/?#@]*@)?([^\/?#:]+)(?::\d*)?([^?#]*)/i.exec(url[0])
    return m ? (m[1] + "_" + (m[2] || "/")).replace(/\//g, "_").toLowerCase() : ""
}
function matchEntry(appId, entries, byId, heuristic) {
    var entry = byId(normalizeId(appId))
    if (entry) return entry
    var chromium = chromiumId(appId)
    if (chromium && (entry = byId(chromium))) return entry
    var lower = appId.toLowerCase()
    for (var i = 0; i < entries.length; i++) {
        if (String(entries[i].startupClass || "").toLowerCase() === lower) return entries[i]
    }
    var claimed = claimingEntryId(appId, entries)
    if (claimed && (entry = byId(claimed))) return entry
    // Exact URL path match prevents two apps on the same host claiming one another.
    var key = webKey(appId)
    if (key) {
        var host = key.split("_")[0] + "_", candidates = []
        for (var j = 0; j < entries.length; j++) {
            var ek = urlKey(entries[j].execString)
            if (ek === key) return entries[j]
            if (ek.indexOf(host) === 0) candidates.push(entries[j])
        }
        if (candidates.length === 1) return candidates[0]
        return null
    }
    return heuristic(appId) || null
}
function sourceWorkspace(window) {
    var tags = window.tags || []
    for (var i = 0; i < tags.length; i++) {
        var m = /^omarchy-minimized-from-(\d+)$/.exec(tags[i])
        if (m) return Number(m[1])
    }
    return window.workspaceId
}
// Hyprland special workspaces are scratchpads (Omarchy's scratchpad and its
// drop-down console among them), except the one windows are minimized to.
function onScratchpad(window) {
    var name = String(window.workspace || "")
    return (name === "special" || name.indexOf("special:") === 0) && name !== "special:minimized"
}
function updateOrder(order, windows) {
    var keys = []
    windows.forEach(function(w) { if (keys.indexOf(w.appKey) < 0) keys.push(w.appKey) })
    return order.filter(function(key) { return keys.indexOf(key) >= 0 }).concat(keys.filter(function(key) { return order.indexOf(key) < 0 }))
}
// The running order with `key` moved ahead of `before`, or to the end. Apps
// another panel or workspace hides keep their places relative to the rest.
function moveBefore(order, key, before) {
    var out = order.filter(function(k) { return k !== key })
    var at = before ? out.indexOf(before) : -1
    out.splice(at < 0 ? out.length : at, 0, key)
    return out
}
function buildItems(favorites, windows, order, settings, context, entries) {
    var byApp = Object.create(null), pins = [], items = []
    var showPins = settings["show-favorites"] && (settings["show-favorites-all-monitors"] || context.primary)
    if (showPins) favorites.forEach(function(id) { if (entries[id] && pins.indexOf(id) < 0) pins.push(id) })
    var monitorFilter = settings["isolate-monitors"] && (context.panelCount > 1 || settings["isolate-monitors-with-single-panel"])
    windows.forEach(function(w) {
        var scratchpad = onScratchpad(w)
        if (scratchpad && !settings["show-scratchpad-windows"]) return
        if (monitorFilter && w.monitor !== context.monitor) return
        // A scratchpad opens over whichever workspace is active, so it belongs to none.
        if (settings["isolate-workspaces"] && !scratchpad && sourceWorkspace(w) !== context.workspaceId) return
        if (!byApp[w.appKey]) byApp[w.appKey] = []
        byApp[w.appKey].push(w)
    })
    function item(key, appKey, list, favorite) {
        var entry = entries[appKey] || null
        items.push({key: key, appKey: appKey, desktopEntry: entry,
            name: entry ? entry.name : appKey, icon: entry && entry.icon ? entry.icon : appKey,
            title: list.length === 1 ? list[0].title : "", windows: list,
            isFavorite: favorite, focused: list.some(function(w) { return w.activated && w.monitor === context.monitor })})
    }
    function addApp(key, favorite) {
        var list = byApp[key] || []
        if (settings["group-apps"]) item("app:" + key, key, list, favorite)
        else if (favorite && settings["group-apps-use-launchers"]) item("pin:" + key, key, [], true)
        else if (list.length === 0 && favorite) item("pin:" + key, key, [], true)
        if (!settings["group-apps"]) list.forEach(function(w) { item("window:" + w.address, key, [w], favorite) })
    }
    pins.forEach(function(key) { addApp(key, true) })
    if (settings["show-running-apps"]) order.forEach(function(key) {
        if (pins.indexOf(key) < 0 && (byApp[key] || []).length) addApp(key, false)
    })
    return items
}
function syncModel(model, keys) {
    for (var i = 0; i < keys.length; i++) {
        if (i < model.count && model.get(i).key === keys[i]) continue
        var found = -1
        for (var j = i + 1; j < model.count; j++) if (model.get(j).key === keys[i]) { found = j; break }
        if (found >= 0) model.move(found, i, 1)
        else model.insert(i, {key: keys[i]})
    }
    if (model.count > keys.length) model.remove(keys.length, model.count - keys.length)
}
