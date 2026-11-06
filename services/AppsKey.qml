import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "AppsKey.js" as Logic

// Points the drawer keybinding (show-apps-hotkey, Omarchy's Apps key
// Super+Alt+Space at first) at Show Apps while the plugin runs. See
// AppsKey.js: nothing is written to the user's Hyprland files.
Item {
    id: root
    required property var config
    readonly property string wanted: String(config.get("show-apps-hotkey") || "")
    property string current: "unknown"
    property string pluginKey: ""
    property string userFile: ""
    property string holder: ""
    property string failure: ""
    property bool again: false
    property bool restoreTried: false
    // Bumped by each Hyprland reload; a listing taken before one is stale.
    property int generation: 0
    // Settings is recording a key: Hyprland's own bindings are paused.
    property bool paused: false
    property int definedGeneration: -1
    readonly property var status: ({enabled: wanted.length > 0, key: wanted, state: current, pluginKey: pluginKey,
        userFile: userFile, holder: holder, paused: paused, error: failure})

    function reconcile() {
        if (probe.running || change.running) { again = true; return }
        again = false
        probe.generation = generation
        probe.chord = wanted
        probe.running = true
    }
    function settled() { if (again) reconcile() }
    function fail(message) {
        if (message && message !== failure) console.warn("familiar-dock: drawer keybinding:", message)
        failure = message
    }
    // Recording: the keys reach Settings, not Hyprland's bindings, until
    // resume(), Escape, a reload or the plugin going away.
    function pause() {
        if (paused) return
        paused = true
        var expression = Logic.pause(definedGeneration === generation)
        definedGeneration = generation
        send(expression)
    }
    function resume() {
        if (!paused) return
        paused = false
        send(Logic.resumeExpression)
    }
    // One hyprctl call at a time, in order: a resume never overtakes the
    // pause before it and leaves the submap entered behind it.
    property var queue: []
    function send(expression) {
        queue = queue.concat([expression])
        next()
    }
    function next() {
        if (submapCall.running || !queue.length) return
        submapCall.command = ["hyprctl", "eval", queue[0]]
        queue = queue.slice(1)
        submapCall.running = true
    }
    Process {
        id: submapCall
        onExited: Qt.callLater(root.next)
    }
    Process {
        id: probe
        property int generation: 0
        property string chord: ""
        property string output: ""
        command: ["bash", "-c", Logic.probeScript, "familiar-dock-apps-key"]
        stdout: StdioCollector { onStreamFinished: probe.output = text }
        onExited: function(code) {
            var text = output
            output = ""
            // Hyprland reloaded, or the key changed, while this listing ran: list again first.
            if (generation !== root.generation || chord !== root.wanted) { root.again = true; Qt.callLater(root.settled); return }
            var seen = code === 0 ? Logic.probe(text, chord) : {state: "unknown", plugin: "", userFile: "", holder: "", spellings: []}
            root.current = seen.state
            root.pluginKey = seen.plugin
            root.userFile = seen.userFile
            root.holder = seen.holder
            if (seen.plugin && seen.plugin !== chord && root.restoreTried) root.fail("a Hyprland reload did not restore the configured binding")
            var next = Logic.action(chord, seen, root.restoreTried)
            if (next === "none") { Qt.callLater(root.settled); return }
            if (next === "restore") root.restoreTried = true
            change.goal = next
            change.chord = chord
            change.command = next === "take" ? ["hyprctl", "eval", Logic.take(chord, seen.spellings)] : ["hyprctl", "reload", "config-only"]
            change.running = true
        }
    }
    Process {
        id: change
        property string goal: ""
        property string chord: ""
        property string output: ""
        stdout: StdioCollector { onStreamFinished: change.output = text }
        onExited: function(code) {
            var failed = code !== 0 || /error/i.test(output)
            root.fail(failed ? (output.trim() || "exit " + code) : "")
            if (!failed && goal === "take") { root.current = "plugin"; root.pluginKey = chord }
            output = ""
            Qt.callLater(root.settled)
        }
    }
    onWantedChanged: {
        restoreTried = false
        failure = ""
        reconcile()
    }
    Connections {
        target: Hyprland
        function onRawEvent(event) {
            if (event.name === "submap") {
                // In the recording submap with no recording (it stopped before
                // the pause arrived): leave it. Out of it: Escape, or anything
                // else, ended the recording.
                if (event.data === Logic.recordSubmap) { if (!root.paused) root.send(Logic.resumeExpression) }
                else if (root.paused) root.paused = false
                return
            }
            // A reload re-reads the Hyprland files, which rebind the key.
            if (event.name !== "configreloaded") return
            root.generation++
            // It also drops the recording submap: never leave the keys in it.
            if (root.paused) { root.paused = false; root.send(Logic.resumeExpression) }
            root.reconcile()
        }
    }
    Component.onCompleted: reconcile()
    // Going away mid-recording: the queue goes with this object, so a
    // detached call resumes, and again once a pause still on its way is in.
    Component.onDestruction: if (paused || queue.length || submapCall.running)
        Quickshell.execDetached(["bash", "-c", 'hyprctl eval "$1"; sleep 1; hyprctl eval "$1"', "familiar-dock-resume", Logic.resumeExpression])
}
