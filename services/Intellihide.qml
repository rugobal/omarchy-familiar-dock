import QtQuick
import Quickshell
import Quickshell.Io
import "Intellihide.js" as Logic
import "Proximity.js" as Proximity

Item {
    id: root
    required property var panel
    readonly property var config: panel.config
    property var hideState: Logic.initial(Date.now())
    property bool held: false
    property bool edgeHovered: false
    property bool edgeReady: false
    property bool panelHovered: false
    property double revealUntil: 0
    property double urgentUntil: 0
    property bool hadUrgent: false
    readonly property int persistMode: config.get("intellihide-persisted-state")
    property bool savePending: false
    readonly property bool hideActive: config.get("intellihide") && !(panel.isPrimary && config.get("intellihide-only-secondary"))
    readonly property bool shown: hideState.shown
    readonly property var context: ({monitor: panel.monitorName, workspaces: panel.visibleWorkspaces})
    readonly property bool overlap: Proximity.near(panel.appModel.windows, config.get("intellihide-hide-from-windows") ? panel.panelRect : panel.monitorRect, context,
        config.get("intellihide-behaviour"), 0, config.get("intellihide-hide-from-monitor-windows"))
    readonly property bool near: config.get("trans-use-dynamic-opacity") && Proximity.near(panel.appModel.windows,
        panel.panelRect, context, config.get("trans-dynamic-behavior"), config.get("trans-dynamic-distance"), true)
    readonly property string statePath: Quickshell.env("HOME") + "/.local/state/familiar-dock/intellihide-" + encodeURIComponent(panel.monitorName) + ".json"
    function update() {
        var urgent = panel.appModel.windows.some(function(w) { return w.urgent && w.monitor === panel.monitorName })
        if (urgent && !hadUrgent && config.get("intellihide-show-on-notification")) urgentUntil = Date.now() + 2500
        hadUrgent = urgent
        hideState = Logic.step(hideState, {primary: panel.isPrimary, fullscreen: panel.underFullscreen,
            popup: panel.host.popupOpen, held: held, notification: Date.now() < urgentUntil,
            reveal: Date.now() < revealUntil || edgeReady,
            hover: panelHovered || (!config.get("intellihide-revealed-hover-limit-size") && edgeHovered), overlap: overlap}, config.settings, Date.now())
    }
    function reveal(ms) { revealUntil = Date.now() + Math.max(ms, config.get("intellihide-close-delay")); update() }
    function toggle() {
        if (!hideActive) return
        held = !held
        if (persistMode >= 0) { savePending = true; saveDelay.restart() }
        update()
    }
    function saveHold() {
        if (persistMode < 0) { savePending = false; return }
        if (!save.running && savePending) { savePending = false; save.running = true }
    }
    onPersistModeChanged: { held = persistMode === 1; if (persistMode >= 0) persisted.reload(); update() }
    onEdgeHoveredChanged: { edgeReady = false; if (edgeHovered) dwell.restart(); else dwell.stop(); update() }
    onHideActiveChanged: { hideState = Logic.initial(Date.now()); update() }
    onOverlapChanged: update()
    onPanelHoveredChanged: update()
    Timer { id: dwell; interval: 1; onTriggered: { root.edgeReady = true; root.update() } }
    Timer { id: saveDelay; interval: 50; onTriggered: root.saveHold() }
    Timer { interval: 50; repeat: true; running: root.hideActive; onTriggered: root.update() }
    Connections { target: root.config; function onSettingsChanged() { root.update() } }
    Connections { target: root.panel; function onUnderFullscreenChanged() { root.update() } }
    FileView {
        id: persisted
        path: root.statePath
        preload: root.config.get("intellihide-persisted-state") >= 0
        printErrors: false
        onLoaded: {
            if (root.config.get("intellihide-persisted-state") < 0) return
            try { root.held = JSON.parse(text()).held === true } catch (error) { root.held = root.config.get("intellihide-persisted-state") === 1 }
            root.update()
        }
    }
    Process {
        id: save
        command: ["bash", "-c", 'set -e; mkdir -p "$(dirname "$1")"; printf "%s\\n" "$2" > "$1.tmp"; mv -f "$1.tmp" "$1"', "familiar-dock", root.statePath, JSON.stringify({held: root.held})]
        onExited: if (root.savePending) saveDelay.restart()
    }
    Component.onCompleted: { held = config.get("intellihide-persisted-state") === 1; update() }
}
