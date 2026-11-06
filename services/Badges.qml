import QtQuick
import Quickshell.Io
import "Badges.js" as Logic
Item {
    id: root
    required property var host
    property var entries: ({})
    property string block: ""
    property int backoff: 1000
    property bool stopping: false
    function line(data) {
        if (data.indexOf("signal ") === 0) block = ""
        block = (block + data + "\n").slice(-65537)
        if (data.trim() === "]") {
            var update = Logic.parse(block)
            if (update) { entries = Logic.merge(entries, update); backoff = 1000 }
            block = ""
        }
    }
    Process {
        id: monitor
        command: ["bash", "-c", "command -v dbus-monitor >/dev/null || exit 127; exec dbus-monitor --session \"type='signal',interface='com.canonical.Unity.LauncherEntry'\""]
        stdout: SplitParser { onRead: data => root.line(data) }
        onExited: function(exitCode) {
            root.entries = ({})
            if (exitCode === 127) {
                if (!root.host.warnedBadgeMissing) console.warn("familiar-dock: dbus-monitor missing; badges unavailable")
                root.host.warnedBadgeMissing = true
            } else if (!root.stopping) { restart.interval = root.backoff; restart.start(); root.backoff = Math.min(30000, root.backoff * 2) }
        }
    }
    Timer { id: restart; onTriggered: monitor.running = true }
    Component.onCompleted: monitor.running = true
    Component.onDestruction: { stopping = true; restart.stop(); monitor.running = false }
}
