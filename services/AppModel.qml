import QtQuick
import Quickshell
import Quickshell.Hyprland
import "AppModel.js" as Logic
import "Proximity.js" as Proximity

Item {
    id: root
    required property var config
    property var appLibrary: null
    readonly property var entries: DesktopEntries.applications.values
    readonly property var entriesById: {
        var out = Object.create(null)
        for (var i = 0; i < entries.length; i++) out[entries[i].id] = entries[i]
        return out
    }
    function entryForAppId(id) {
        return Logic.matchEntry(id, entries, function(key) { return DesktopEntries.byId(key) },
                                function(key) { return DesktopEntries.heuristicLookup(key) })
    }
    readonly property var windows: {
        var revision = root.entries
        var values = Hyprland.toplevels.values, out = []
        for (var i = 0; i < values.length; i++) {
            var hypr = values[i], wl = hypr.wayland
            if (!wl || wl.parent || !wl.appId) continue
            var entry = root.entryForAppId(wl.appId)
            var ws = hypr.workspace, monitor = hypr.monitor, ipc = hypr.lastIpcObject || {}
            out.push({appKey: entry ? entry.id : wl.appId, address: hypr.address,
                title: String(wl.title || "").slice(0, 1024), workspace: ws ? ws.name : "", workspaceId: ws ? ws.id : -1,
                monitor: monitor ? monitor.name : "", minimized: !!ws && ws.name === "special:minimized",
                activated: wl.activated, urgent: !!(hypr.urgent || wl.urgent), tags: ipc.tags || [],
                rect: {x: (ipc.at || [0,0])[0], y: (ipc.at || [0,0])[1], width: (ipc.size || [0,0])[0], height: (ipc.size || [0,0])[1]},
                fullscreen: !!ipc.fullscreen, maximized: Proximity.maximized(ipc, monitor ? monitor.lastIpcObject || {} : {}),
                focusHistory: ipc.focusHistoryID === undefined ? 99999 : ipc.focusHistoryID,
                toplevel: wl, hyprlandToplevel: hypr})
        }
        return out
    }
    // lastIpcObject carries tags and MRU ordering and needs an explicit refresh.
    function refreshSoon() { refreshTimer.restart() }
    Timer {
        id: refreshTimer
        interval: 100
        onTriggered: { Hyprland.refreshToplevels(); Hyprland.refreshWorkspaces() }
    }
    // Geometry changes during interactive moves do not always emit socket events.
    Timer { interval: 250; repeat: true; running: root.config.get("intellihide") || root.config.get("trans-use-dynamic-opacity"); triggeredOnStart: true; onTriggered: Hyprland.refreshToplevels() }
    Connections {
        target: Hyprland
        function onRawEvent(event) {
            if (["openwindow", "closewindow", "movewindow", "movewindowv2", "activewindow", "activewindowv2", "windowtitle", "windowtitlev2", "changefloatingmode", "fullscreen", "urgent"].indexOf(event.name) >= 0) root.refreshSoon()
        }
    }
    property var order: []
    onWindowsChanged: order = Logic.updateOrder(order, windows)
    Component.onCompleted: order = Logic.updateOrder(order, windows)
    // A running app dragged among the others keeps its new place until the
    // shell restarts, like Dash to Panel's in-memory window order.
    function moveRunning(key, before) { order = Logic.moveBefore(order, key, before) }

    function itemsFor(monitor, workspaceId, primary, panelCount) {
        return Logic.buildItems(config.get("favorites"), windows, order, config.settings,
            {monitor: monitor, workspaceId: workspaceId, primary: primary, panelCount: panelCount}, entriesById)
    }
    function iconFor(item, style) {
        if (!item) return ""
        var icon = item.icon
        if (style === "SYMBOLIC" && icon && icon.indexOf("/") < 0 && !/-symbolic$/.test(icon)) {
            var symbolic = Quickshell.iconPath(icon + "-symbolic", true)
            if (symbolic) return symbolic
        }
        return appLibrary ? appLibrary.iconSource(icon) : Quickshell.iconPath(icon, true)
    }
}
