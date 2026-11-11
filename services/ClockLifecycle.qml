import QtQuick
import Quickshell
import Quickshell.Io
import "ClockLogic.js" as Logic

Item {
    id: root
    required property var actions
    required property bool shown
    readonly property string stateHome: Quickshell.env("HOME")
    property var stash: null
    readonly property bool hidden: stash !== null
    property bool started: false
    function reconcile() {
        actions.runScript(Logic.script, [stateHome, shown ? "show" : "hide"], function() { marker.reload() })
    }
    // Settings can hold what the user keeps private, so they go to the clock
    // script in its environment, never on its command line. updateSettings
    // takes the whole entry, for the stash; setBarSettings only the changed
    // settings, for the clock on the bar.
    function updateSettings(entry) {
        actions.runScript(Logic.script, [stateHome, "update"], function() { marker.reload() }, null, {FAMILIAR_DOCK_CLOCK_ENTRY: JSON.stringify(entry)})
    }
    function setBarSettings(changed) {
        actions.runScript(Logic.script, [stateHome, "set"], function() { marker.reload() }, null, {FAMILIAR_DOCK_CLOCK_ENTRY: JSON.stringify(changed)})
    }
    onShownChanged: if (started) debounce.restart()
    Timer { id: debounce; interval: 100; onTriggered: root.reconcile() }
    Timer { interval: 3500; running: true; onTriggered: { root.started = true; root.reconcile() } }
    FileView {
        id: marker
        path: root.stateHome + "/.local/state/familiar-dock/clock-hidden"
        preload: true; watchChanges: true; printErrors: false
        onFileChanged: reload()
        onLoaded: Qt.callLater(function() {
            try { const value = JSON.parse(marker.text()); root.stash = value.entry ? value : null }
            catch (error) { console.warn("familiar-dock: invalid clock stash; leaving it for recovery") }
        })
        onLoadFailed: function(error) { if (error === FileViewError.FileNotFound) root.stash = null }
    }
}
