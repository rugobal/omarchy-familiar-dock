.pragma library
.import "../services/DrawerClick.js" as DrawerClick

function bounded(value) { return String(value || "").slice(0, 512) }
// The default entries' titles are named in the catalog, as Dash to Panel
// passes them through gettext; a title the user wrote shows as written.
var builtinTitles = ["Terminal", "System monitor", "Files"]
function entryTitle(title, t) { return builtinTitles.indexOf(title) >= 0 ? t("menu.entry." + title) : title }
// Keep rows serializable; compositor objects stay in the owning panel.
function appRows(item, settings, t, quitLabel) {
    var rows = []
    if (item.windows.length) rows.push({kind: "section", text: t("menu.windows"), enabled: false})
    item.windows.slice(0, 256).forEach(function(w) { rows.push({kind: "window", text: bounded(w.title || item.name), address: w.address}) })
    var hasNewWindow = item.desktopEntry && (item.desktopEntry.actions || []).some(function(a) { return a.id === "new-window" })
    if (item.desktopEntry && !hasNewWindow) rows.push({kind: "new", text: t("menu.new")})
    if (item.desktopEntry && settings["secondarymenu-contains-appmenu"]) {
        var actions = item.desktopEntry.actions || []
        for (var i = 0; i < Math.min(64, actions.length); i++) rows.push({kind: "action", text: bounded(actions[i].name), actionIndex: i})
    }
    if (item.desktopEntry) rows.push({kind: "pin", text: t((settings.favorites || []).indexOf(item.appKey) >= 0 ? "menu.unpin" : "menu.pin")})
    if (item.windows.length) rows.push({kind: "quit", text: quitLabel})
    return rows
}
function panelRows(kind, settings, restoring, t, clockVisible) {
    var rows = []
    // A click on the drawer icon that does something else keeps the drawer here.
    if (kind === "showAppsButton" && DrawerClick.plan(settings["show-apps-click"]).kind !== "drawer") rows.push({kind: "drawer", text: t("menu.drawer")})
    settings["context-menu-entries"].slice(0, 64).forEach(function(row) { rows.push({kind: "command", text: bounded(entryTitle(row.title, t)), command: row.cmd}) })
    var prefix = kind === "showAppsButton" ? "show-apps-button-context-menu-" : "panel-context-menu-"
    var commands = settings[prefix + "commands"], titles = settings[prefix + "titles"]
    commands.slice(0, 64).forEach(function(cmd, i) { if (titles[i]) rows.push({kind: "command", text: bounded(titles[i]), command: cmd}) })
    rows.push({kind: "lock", text: t(settings["taskbar-locked"] ? "menu.unlock" : "menu.lock")})
    rows.push({kind: "clock", text: t("menu.clock"), checked: !!clockVisible})
    rows.push({kind: "outline", text: t("menu.outline"), checked: !!settings["icon-contrast-outline"]})
    rows.push({kind: "settings", text: t("menu.settings")})
    rows.push({kind: "desktop", text: t(restoring ? "desktop.restore" : "desktop.show")})
    return rows
}
function nextEnabled(rows, current, delta) {
    if (!rows.length) return -1
    for (var i = 0; i < rows.length; i++) {
        current = (current + delta + rows.length) % rows.length
        if (rows[current].enabled !== false) return current
    }
    return -1
}
