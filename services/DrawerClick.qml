import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "DrawerClick.js" as Logic
import "AppsKey.js" as Keys
import "Chord.js" as Chord

// Does what a click on the drawer icon is set to do (show-apps-click; see
// DrawerClick.js). A keybinding is followed at each click: the key's live
// bindings are listed then, and the functions Hyprland runs for that key are
// run in its own Lua state (`hyprctl eval`), so the icon does what the key
// does now, however the key is configured.
Item {
    id: root
    required property var config
    // WindowActions: launch(item) and command(text).
    required property var actions
    readonly property var value: Logic.normalize(config.get("show-apps-click"))
    readonly property var plan: Logic.plan(value)
    // The keybindings a click can follow, for Settings: [{value, label, description}].
    property var choices: []
    // A listing has come back since the plugin started, and what it listed.
    property bool listed: false
    property var records: []
    // Why the last click that ran a keybinding failed, or "".
    property string failure: ""
    // What a click does, for the icon's tooltip: "" while it opens the drawer.
    readonly property string label: {
        if (plan.kind === "app") { var entry = root.entry(plan.target); return entry ? String(entry.name || plan.target) : "" }
        // A key bound to nothing now gets no word: a click opens the drawer.
        if (plan.kind === "keybinding") return Logic.naming(choices, plan.target)
            || (listed && !runs(plan.target) ? "" : Chord.caps(plan.target).join("+"))
        if (plan.kind === "command") return plan.target.slice(0, 256)
        return ""
    }
    readonly property var status: ({action: value.action, plan: plan.kind, target: plan.target, label: label,
        choices: choices.length, listed: listed, error: failure})
    // A click with nothing to run, or whose app or key is gone, opens the drawer.
    signal drawerWanted()

    function entry(id) {
        var ids = id ? Logic.appIds(id) : []
        for (var i = 0; i < ids.length; i++) { var found = DesktopEntries.byId(ids[i]); if (found) return found }
        return null
    }
    // Whether a click on this key would run something, as last listed.
    function runs(chord) { return !!Logic.slots(Logic.presses(records, chord)) }
    function fail(message) {
        if (message && message !== failure) console.warn("familiar-dock: drawer icon click:", message)
        failure = message
    }
    function click() {
        var next = plan
        if (next.kind === "app") {
            var app = entry(next.target)
            if (app) actions.launch({desktopEntry: app})
            else drawerWanted()
        } else if (next.kind === "command") actions.command(next.target)
        else if (next.kind === "keybinding") {
            // One click at a time: a second one while the first runs is the same
            // click. A release still running would clear what the next click keeps.
            if (clickList.running || run.running || release.running) return
            clickList.chord = next.target
            clickList.running = true
        } else drawerWanted()
    }
    // The choices again, for Settings and after a reload.
    function refresh() {
        if (list.running) { list.again = true; return }
        list.running = true
    }
    function take(text) {
        var parsed = Keys.parse(text)
        choices = Logic.choices(parsed)
        records = parsed
        listed = true
        return parsed
    }
    Process {
        id: list
        property bool again: false
        property string output: ""
        command: ["hyprctl", "binds"]
        stdout: StdioCollector { onStreamFinished: list.output = text }
        onExited: function(code) {
            if (code === 0) root.take(output)
            output = ""
            if (again) { again = false; Qt.callLater(root.refresh) }
        }
    }
    Process {
        id: clickList
        property string chord: ""
        property string output: ""
        // The bindings and, in the same request, the functions they name.
        command: ["hyprctl", "--batch", Logic.listing]
        stdout: StdioCollector { onStreamFinished: clickList.output = text }
        onExited: function(code) {
            var text = output
            output = ""
            if (code !== 0 || !Logic.kept(text)) {
                // The functions may have been kept even so: let them go.
                release.running = true
                root.fail("listing the bindings failed: " + (text.trim().split("\n").pop() || "exit " + code)); return
            }
            var slots = Logic.slots(Logic.presses(root.take(text), chord))
            // Nothing to run: the drawer, and the kept functions let go.
            run.command = ["hyprctl", "eval", slots ? Logic.expression(slots) : Logic.forget]
            run.running = true
            if (!slots) root.drawerWanted()
        }
    }
    Process { id: release; command: ["hyprctl", "eval", Logic.forget] }
    Process {
        id: run
        property string output: ""
        stdout: StdioCollector { onStreamFinished: run.output = text }
        onExited: function(code) {
            var text = output.trim()
            output = ""
            root.fail(code !== 0 || /^error/i.test(text) ? text || "exit " + code : "")
        }
    }
    Connections {
        target: Hyprland
        // A reload renumbers the bindings and may change what each key does.
        function onRawEvent(event) { if (event.name === "configreloaded") root.refresh() }
    }
    Component.onCompleted: refresh()
}
