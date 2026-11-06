pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io
import "SystemDefaults.js" as Logic

Item {
    id: root
    required property var appModel
    readonly property string configHome: Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config"
    readonly property var terminalPaths: Logic.listPaths(configHome, Quickshell.env("XDG_CURRENT_DESKTOP"))
    readonly property var watchPaths: [configHome + "/mimeapps.list"].concat(terminalPaths).concat(
        String(Quickshell.env("XDG_CURRENT_DESKTOP") || "").toLowerCase().split(":").filter(function(s) { return /^[a-z0-9_-]+$/.test(s) }).map(function(s) { return root.configHome + "/" + s + "-mimeapps.list" }))
    property var payload: null
    property var defaults: []
    property bool rerun: false
    function refreshSoon() { debounce.restart() }
    function resolveEntries() {
        if (payload) defaults = Logic.resolve(payload, function(id) { return root.appModel.entryForAppId(id) })
    }
    Timer {
        id: debounce; interval: 100
        onTriggered: {
            if (resolver.running) root.rerun = true
            else { resolver.output = ""; resolver.running = true }
        }
    }
    Process {
        id: resolver
        command: ["bash", "-c", Logic.resolveScript, "familiar-dock-defaults"].concat(root.terminalPaths)
        property string output: ""
        stdout: StdioCollector { onStreamFinished: resolver.output = text }
        onExited: function(code) {
            if (code === 0) {
                try { root.payload = JSON.parse(output); root.resolveEntries() }
                catch (error) { console.warn("familiar-dock: invalid system-default resolver output; keeping last result") }
            }
            if (root.rerun) { root.rerun = false; root.refreshSoon() }
        }
    }
    Instantiator {
        model: root.watchPaths
        FileView {
            id: watchedFile
            required property string modelData
            path: watchedFile.modelData; watchChanges: true; printErrors: false; preload: true
            onFileChanged: { watchedFile.reload(); root.refreshSoon() }
        }
    }
    Connections { target: root.appModel; function onEntriesChanged() { root.resolveEntries() } }
    Component.onCompleted: refreshSoon()
}
