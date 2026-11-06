import QtQuick
import Quickshell
import "DockLifecycle.js" as Logic

Item {
    id: root
    required property var config
    function reconcile() {
        var script = config.get("hide-omarchy-dock") ? Logic.hideScript : Logic.liveRestoreScript
        Quickshell.execDetached(["bash", "-c", script, "familiar-dock-dock", Quickshell.env("HOME")])
    }
    Connections {
        target: root.config
        function onSettingsChanged() { if (!startup.running) root.reconcile() }
    }
    Timer {
        id: startup
        interval: 3500
        running: true
        onTriggered: root.reconcile()
    }
}
