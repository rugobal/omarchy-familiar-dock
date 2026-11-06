import QtQuick
import Quickshell
import qs.Commons as Commons
import "WindowFader.js" as Logic
import "../panel/Hover.js" as HoverLogic

Item {
    id: root
    required property var actions
    property var owners: ({})
    property var current: ({})
    property var start: ({})
    property var goal: ({})
    property var fadedWindows: []
    property string token: String(Date.now()) + "-" + Math.random()
    property bool ready: false
    property bool busy: false
    property double began: 0
    property int durationMs: 0
    property int failures: 0
    function set(owner, targets, time) {
        if (JSON.stringify(owners[owner] || {}) === JSON.stringify(targets)) return
        var next = Object.assign({}, owners)
        if (Object.keys(targets).length) next[owner] = targets
        else delete next[owner]
        owners = next
        start = current
        goal = Logic.combined(owners)
        began = Date.now()
        durationMs = Commons.Style.duration(Math.min(HoverLogic.maxMotion, Math.max(0, time)))
        failures = 0
        tick.restart()
    }
    function release(owner, time) { set(owner, {}, time) }
    function clear() { owners = ({}); start = current; goal = ({}); began = 0; durationMs = 0; tick.restart() }
    function pruneClosed() {
        var alive = actions.appModel.windows.map(function(w) { return w.address.indexOf("0x") === 0 ? w.address : "0x" + w.address })
        var next = Logic.prune(current, alive)
        if (JSON.stringify(next) === JSON.stringify(current)) return
        current = next; start = Logic.prune(start, alive); goal = Logic.prune(goal, alive)
        var nextOwners = {}
        Object.keys(owners).forEach(function(key) { nextOwners[key] = Logic.prune(root.owners[key], alive) })
        owners = nextOwners
        tick.restart()
    }
    Connections { target: root.actions.appModel; function onWindowsChanged() { root.pruneClosed() } }
    function step() {
        if (!ready || busy) return
        var progress = durationMs ? Math.min(1, (Date.now() - began) / durationMs) : 1
        var next = Logic.frame(start, goal, progress)
        current = next
        busy = true
        actions.runScript(Logic.script, [Quickshell.env("HOME"), "step", token, JSON.stringify(next), JSON.stringify(goal)], function(code, output) {
            root.busy = false
            if (!code) {
                root.failures = 0
                try { root.fadedWindows = JSON.parse(output.trim()) } catch (e) {}
            } else root.failures++
            // A failed restore keeps its journal and retries with backoff.
            if (root.failures) { tick.stop(); retry.restart() }
            else if (progress >= 1 && JSON.stringify(next) === JSON.stringify(root.goal)) tick.stop()
        })
    }
    Timer { id: tick; interval: 50; repeat: true; onTriggered: root.step() }
    Timer { id: retry; interval: 1000; onTriggered: { root.step(); tick.restart() } }
    Component.onCompleted: actions.runScript(Logic.script, [Quickshell.env("HOME"), "init", token, "{}"], function(code) {
        root.ready = code === 0
        if (!root.ready) console.warn("familiar-dock: cannot recover opacity journal; fading disabled")
        else if (Object.keys(root.owners).length) tick.restart()
    })
    Component.onDestruction: actions.cleanupFade(Logic.script, Quickshell.env("HOME"), token)
}
