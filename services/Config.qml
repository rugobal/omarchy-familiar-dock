import QtQuick
import Quickshell
import Quickshell.Io
import "Config.js" as Logic
import "../settings/WritePlan.js" as Writes

Item {
    id: root
    readonly property string path: Quickshell.env("HOME") + "/.config/omarchy/familiar-dock.json"
    property var settings: Logic.validate({})
    property var raw: ({})
    property bool valid: true
    property string sourceText: "{}"
    property string message: ""
    property string messageDetail: ""
    property string pendingOperation: "change"
    property var resetSnapshot: null
    property string backupPath: ""
    property string transferPath: ""
    property string transferMode: ""
    property bool warned: false
    property var pendingSettings: null
    // An import that would add shell commands waits here for the user to
    // choose: {changes, commands}. See WritePlan.importCommands.
    property var importReview: null
    // Keys the pending write drops from the file (see setSettings).
    property var pendingRemovals: []
    property int readAttempt: 0
    property var systemDefaults: []
    readonly property string favoritesSource: settings.favorites === null ? "system-defaults" : "user"
    readonly property var effectiveFavorites: Logic.effectiveFavorites(settings, systemDefaults)
    readonly property var effectiveSettings: Object.assign({}, settings, {favorites: effectiveFavorites})

    function get(key) { return key === "favorites" ? effectiveFavorites : settings[key] }
    function perMonitor(key, name, primary) { return Logic.forMonitor(settings, key, name, primary) }
    function reload() { readAttempt = 0; file.reload() }
    function warnOnce(message) {
        if (!warned) console.warn("familiar-dock: " + message)
        warned = true
    }
    function accept(text) {
        const result = Logic.readResult(text, readAttempt)
        if (result.status === "retry") {
            valid = false
            readAttempt++
            retryRead.restart()
        } else if (result.status === "ok") {
            const parsed = result.value
            sourceText = text
            raw = parsed.raw
            settings = parsed.settings
            valid = true
            warned = false
            readAttempt = 0
            commitSettings()
        } else {
            valid = false
            pendingSettings = null; pendingRemovals = []
            resetSnapshot = null; pendingOperation = "change"
            warnOnce("invalid settings; keeping last good configuration: " + result.error)
        }
    }
    // Re-read before writing so an external edit is preserved, including unknown keys.
    // Only UI action APIs write: file-change notifications never automatically save.
    function setFavorites(list) {
        setSetting("favorites", Logic.favorites(list))
    }
    function setSetting(key, value) {
        var changes = {}; changes[key] = value; setSettings(changes)
    }
    // A menu row owns its title and command together. Merge both arrays in
    // one validated atomic write, never publish mismatched lengths to disk.
    // `removals` (optional) lists keys to drop from the file, so they read as
    // their defaults again; a later change to a key wins over an earlier
    // removal of it, and the other way round.
    function setSettings(changes, removals) {
        if (!valid || resetSnapshot !== null || pendingOperation !== "change") return
        var next = Object.assign({}, pendingSettings || {}), gone = pendingRemovals.slice()
        Object.keys(changes || {}).forEach(function(key) {
            if (root.settings[key] === undefined) return
            next[key] = changes[key]
            gone = gone.filter(function(k) { return k !== key })
        })
        var drop = Array.isArray(removals) ? removals : []
        drop.forEach(function(key) {
            if (root.settings[key] === undefined || key === "favorites") return
            delete next[key]
            if (gone.indexOf(key) < 0) gone.push(key)
        })
        if (!Object.keys(next).length && !gone.length) return
        pendingSettings = next
        pendingRemovals = gone
        reload()
    }
    function status(key, detail) { message = key; messageDetail = detail || "" }
    function resetDefaults() {
        if (!valid || resetSnapshot !== null || pendingSettings !== null || importReview !== null) return
        pendingOperation = "reset"; pendingSettings = {}; reload()
    }
    function importText(text) {
        if (!valid || resetSnapshot !== null || pendingSettings !== null || importReview !== null) return
        try {
            var changes = Writes.importChanges(text)
            var commands = Writes.importCommands(changes, settings)
            if (commands.length) { importReview = {changes: changes, commands: commands}; return }
            pendingSettings = changes
            pendingOperation = "change"; reload()
        } catch (error) { status("settings.invalidImport") }
    }
    // The user's answer to importReview: "all" imports the commands too,
    // "skip" everything else, anything else nothing.
    function finishImport(choice) {
        var review = importReview
        importReview = null
        if (!review) return
        if (choice !== "all" && choice !== "skip") { status("settings.importCanceled"); return }
        if (!valid || resetSnapshot !== null || pendingSettings !== null) { status("settings.importFailed"); return }
        var changes = choice === "all" ? review.changes : Writes.withoutCommands(review.changes, review.commands)
        if (!Object.keys(changes).length) { status("settings.importOnlyCommands"); return }
        pendingSettings = changes
        pendingOperation = "change"; reload()
    }
    function transfer(mode, chosen) {
        if (!valid || resetSnapshot !== null || pendingSettings !== null || importReview !== null) return
        var target = Writes.chosenPath(chosen, Quickshell.env("HOME"), path)
        if (!target) { status("settings.invalidPath"); return }
        transferMode = mode; transferPath = target
        Qt.callLater(function() {
            if (mode === "import") transferFile.reload()
            else transferFile.setText(JSON.stringify(root.raw, null, 2) + "\n")
        })
    }
    function save(next) {
        if (JSON.stringify(next) === JSON.stringify(raw)) return
        file.setText(JSON.stringify(next, null, 2) + "\n")
        raw = next; settings = Logic.validate(next)
    }
    function commitSettings() {
        if (pendingSettings === null || !valid) return
        var operation = pendingOperation
        var changes = pendingSettings, removals = pendingRemovals
        pendingSettings = null; pendingRemovals = []; pendingOperation = "change"
        try {
            // Even resets must parse the last disk read; never recover by
            // writing defaults over malformed bytes.
            var plan = Writes.plan(sourceText, operation, changes, removals)
            if (operation === "change" && JSON.stringify(plan.next) === JSON.stringify(raw)) return
            if (operation === "reset") {
                resetSnapshot = {text: sourceText, next: plan.next, ready: false}
                backupPath = path + ".backup-" + Date.now()
                Qt.callLater(function() { if (root.resetSnapshot) backupFile.setText(root.resetSnapshot.text) })
            } else if (operation === "reset-commit") {
                if (resetSnapshot && resetSnapshot.ready && sourceText === resetSnapshot.text) {
                    save(resetSnapshot.next); status("settings.resetDone", backupPath)
                } else status("settings.resetChanged")
                resetSnapshot = null
            } else save(plan.next)
        } catch (error) { status("settings.invalidFile"); resetSnapshot = null }
    }
    FileView {
        id: backupFile
        path: root.backupPath
        printErrors: false
        atomicWrites: true
        onSaved: {
            if (!root.resetSnapshot) return
            root.resetSnapshot.ready = true
            root.pendingSettings = {}; root.pendingOperation = "reset-commit"; root.reload()
        }
        onSaveFailed: { root.resetSnapshot = null; root.status("settings.backupFailed") }
    }
    FileView {
        id: transferFile
        path: root.transferPath
        printErrors: false
        atomicWrites: true
        onLoaded: if (root.transferMode === "import") {
            root.transferMode = ""; root.importText(text())
        }
        onLoadFailed: if (root.transferMode === "import") {
            root.transferMode = ""; root.status("settings.importFailed")
        }
        onSaved: { root.transferMode = ""; root.status("settings.exportDone", root.transferPath) }
        onSaveFailed: { root.transferMode = ""; root.status("settings.exportFailed") }
    }
    Timer { id: settledRead; interval: 50; onTriggered: root.accept(file.text()) }
    Timer { id: retryRead; interval: 50; onTriggered: file.reload() }
    FileView {
        id: file
        path: root.path
        watchChanges: true
        printErrors: false
        atomicWrites: true
        preload: true
        onFileChanged: root.reload()
        // Do not read in the signal stack while FileView's wrapper is initializing.
        onLoaded: settledRead.restart()
        onLoadFailed: function(error) {
            settledRead.stop(); retryRead.stop()
            if (error === FileViewError.FileNotFound) {
                root.sourceText = "{}"
                root.raw = ({})
                root.settings = Logic.validate({})
                root.valid = true
                root.warned = false
                root.commitSettings()
            } else {
                root.valid = false
                root.pendingSettings = null; root.pendingRemovals = []
                root.resetSnapshot = null; root.pendingOperation = "change"
                root.warnOnce("cannot read settings; keeping last good configuration")
            }
        }
        onSaved: if (root.message !== "settings.resetDone") root.status("settings.saved")
        onSaveFailed: { root.status("settings.saveFailed"); root.warnOnce("could not save settings"); reload() }
    }
}
