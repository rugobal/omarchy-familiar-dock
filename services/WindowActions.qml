import QtQuick
import Quickshell
import Quickshell.Io
import "WindowActions.js" as Logic

Item {
    id: root
    required property var config
    required property var appModel
    property var appLibrary: null
    property var fader: null
    property var cycleMemory: null
    property var lastClicks: ({})
    property var desktopLists: ({})
    property var queue: []
    property var completion: null
    property double desktopGuardUntil: 0
    property bool desktopBatchRunning: false
    property bool warnedLauncher: false
    signal dispatched()
    function run(argv, done, begin) {
        queue.push({argv: argv, done: done || null, begin: begin || null})
        pump()
    }
    function pump() {
        if (worker.running || !queue.length) return
        var job = queue.shift()
        completion = job.done
        if (job.begin) job.begin()
        worker.command = job.argv
        worker.running = true
    }
    function runScript(script, args, done, begin) { run(["bash", "-c", script, "familiar-dock"].concat(args), done, begin) }
    Process {
        id: worker
        property string output: ""
        stdout: StdioCollector { onStreamFinished: worker.output = text }
        onExited: function(code) {
            root.dispatched()
            var cb = root.completion
            root.completion = null
            if (cb) cb(code, output)
            output = ""
            Qt.callLater(root.pump)
        }
    }
    function mutate(mode, windows, workspace) {
        var ops = Logic.operations(mode, windows, workspace)
        if (ops.length) runScript(Logic.mutationScript, [JSON.stringify(ops)])
    }
    function launch(item, newWindow) {
        var entry = item ? item.desktopEntry : null
        var action = newWindow ? Logic.newWindowAction(entry) : null
        if (action) action.execute()
        else if (entry && appLibrary) appLibrary.launch(entry.id, entry.name)
        else if (entry) warnMissingLauncher()
        dispatched()
    }
    function warnMissingLauncher() {
        if (!warnedLauncher) {
            console.warn("familiar-dock: no app launcher available")
            warnedLauncher = true
        }
    }
    function bringForward(window, workspace) {
        if (window) mutate("restore", [window], workspace)
    }
    function closeWindow(window) { if (window) mutate("close", [window], 1) }
    function minimizeWindow(item, all, panel) { mutate("minimize", Logic.minimizeCandidates(item.windows, panel.workspaceId, all), panel.workspaceId) }
    function activateAllWindows(item, panel) { mutate("restore", Logic.activateAllCandidates(item.windows), panel.workspaceId) }
    function activateFirstWindow(item, panel) { bringForward(Logic.pickWindow(item.windows), panel.workspaceId) }
    function closeAllWindows(item) { mutate("close", item.windows, 1) }
    function cycleThroughWindows(item, reversed, minimize, panel) {
        var result = Logic.cycle(cycleMemory, item.appKey, panel.monitorName, item.windows, reversed, minimize, Date.now())
        cycleMemory = result.memory
        if (result.target === "MINIMIZE") minimizeWindow(item, true, panel)
        else bringForward(item.windows.filter(function(w) { return Logic.address(w.address) === result.target })[0], panel.workspaceId)
    }
    function activate(item, button, modifiers, panel) {
        if (!item) return
        var now = Date.now(), key = panel.monitorName + ":" + item.key
        var clicked = Logic.clickState(lastClicks[key], button, now, modifiers)
        var doubleClick = clicked.doubleClick
        lastClicks[key] = clicked.lastClick
        var atMin = cycleMemory && now - cycleMemory.time < Logic.MEMORY_TIME && cycleMemory.key === item.appKey
            && cycleMemory.monitor === panel.monitorName && cycleMemory.list[cycleMemory.index] === "MINIMIZE"
        var plan = Logic.activatePlan(config.settings, item, button, modifiers, panel, doubleClick, atMin)
        if (plan.op !== "preview") panel.closePreview(config.get("window-preview-hide-immediate-click"))
        if (plan.op === "launch") launch(item, true)
        else if (plan.op === "close") closeAllWindows(item)
        else if (plan.op === "minimize") minimizeWindow(item, plan.all, panel)
        else if (plan.op === "first") activateFirstWindow(item, panel)
        else if (plan.op === "all") activateAllWindows(item, panel)
        else if (plan.op === "cycle") cycleThroughWindows(item, false, !!plan.minimizeSlot, panel)
        else panel.openPreview(item, true)
    }
    function cyclePanel(windows, reversed, panel) {
        bringForward(Logic.panelCycle(windows, reversed), panel.workspaceId)
    }
    function showDesktop(panel) {
        if (fader) fader.clear()
        var key = panel.monitorName
        var plan = Logic.showDesktopPlan(desktopLists[key], appModel.windows.filter(function(w) { return w.monitor === key }), panel.workspaceId)
        var next = Object.assign({}, desktopLists)
        next[key] = plan.remember
        desktopLists = next
        // Ignore this batch's focus notifications, then arm after upstream's 20 ms.
        var ops = Logic.operations(plan.op, plan.windows, panel.workspaceId)
        runScript(Logic.mutationScript, [JSON.stringify(ops)], function() {
            root.desktopBatchRunning = false
            root.desktopGuardUntil = Date.now() + 20
        }, function() { root.desktopBatchRunning = true })
    }
    function noteWindowFocus(address) {
        if (!desktopBatchRunning) desktopLists = Logic.desktopStateAfterFocus(desktopLists, Date.now(), desktopGuardUntil, address)
    }
    function hasDesktopList(panel) { return !!(desktopLists[panel.monitorName] && desktopLists[panel.monitorName].length) }
    function switchWorkspace(panel, delta) {
        // m+/-1 is the installed 0.56 per-monitor relative form. Focus the panel's
        // monitor first so scrolling an unfocused panel stays on that monitor.
        var monitor = String(panel.monitorName)
        // Lua string encoding, then argv: the monitor name never enters a shell.
        run(["hyprctl", "--batch", 'dispatch hl.dsp.focus({ monitor = ' + JSON.stringify(monitor) + ' });dispatch hl.dsp.focus({ workspace = "m' + (delta > 0 ? '-1' : '+1') + '" })'])
    }
    function volume(delta) { run(["omarchy-audio-output-volume", delta > 0 ? "raise" : "lower"]) }
    function command(cmd) {
        var argv = Logic.commandArgv(cmd)
        if (argv.length) run(argv)
    }
    function settings() {
        runScript('exec omarchy-launch-config-editor "$1"', [config.path])
    }
    function desktopAction(action) { if (action) action.execute(); dispatched() }
    function cleanupFade(script, home, token) {
        Quickshell.execDetached(["bash", "-c", script, "familiar-dock-fade-cleanup", home, "cleanup", token, "{}"])
    }
}
