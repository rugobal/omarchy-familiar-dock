import QtQuick
import Quickshell.Io
import qs.Commons as Commons
import "IconColors.js" as Logic

Item {
    id: root
    required property var config
    required property var iconColors
    // Only installed pins and the Show Apps source: never running windows.
    property var icons: []
    property var palette: ({})
    property int generation: 0
    property var selection: null
    property var scores: []
    readonly property string foreground: Logic.hex([Commons.Color.bar.text.r, Commons.Color.bar.text.g, Commons.Color.bar.text.b])
    readonly property string barColor: Logic.hex([Commons.Color.bar.background.r, Commons.Color.bar.background.g, Commons.Color.bar.background.b])
    readonly property var candidates: Object.assign({}, palette, {bar: barColor})
    readonly property string role: config.get("theme-bg-color") === "auto" ? (selection ? selection.role : "bar") : config.get("theme-bg-color")
    readonly property string color: config.get("theme-bg-color") === "auto" ? (selection ? selection.color : barColor) : (candidates[role] || barColor)
    function refresh() { themeFile.reload() }
    function readTheme() {
        var parsed = Logic.palette(themeFile.text())
        if (!parsed.background || !parsed.foreground) return // Keep the last good palette during atomic replacement.
        var next = {}
        ;["background", "dark_background", "darker_background", "lighter_background"].forEach(function(role) {
            if (parsed[role]) next[role] = parsed[role]
        })
        palette = next
        generation++
        Qt.callLater(requestSamples)
    }
    function requestSamples() {
        icons.forEach(function(icon) { if (!icon.dots) iconColors.ensure(icon.id, icon.source, icon.grayscale) })
        scoring.restart()
    }
    function score() {
        var samples = []
        for (var i = 0; i < icons.length; i++) {
            var icon = icons[i]
            var sample = icon.dots ? Logic.dots(foreground) : iconColors.sample(icon.id, icon.source, icon.grayscale)
            if (!sample) return // Pending or failed readback leaves the previous successful choice intact.
            samples.push(sample)
        }
        var dark = Logic.luminance(Logic.rgb(foreground)) > Logic.luminance(Logic.rgb(palette.background || barColor))
        var result = Logic.choose(candidates, foreground, samples, dark)
        scores = result.scores
        if (result.best) selection = result.best
    }
    onIconsChanged: requestSamples()
    onForegroundChanged: refreshDelay.restart()
    onBarColorChanged: refreshDelay.restart()
    Connections {
        target: Commons.Color
        function onShellValuesChanged() { refreshDelay.restart() }
    }
    Connections {
        target: root.iconColors
        function onSampleReady(key) {
            if (root.icons.some(function(icon) { return !icon.dots && root.iconColors.key(icon.id, icon.source, icon.grayscale) === key })) scoring.restart()
        }
    }
    FileView {
        id: themeFile
        path: Commons.Color.currentThemePath + "/colors.toml"
        watchChanges: true
        preload: true
        printErrors: false
        onFileChanged: refreshDelay.restart()
        onLoaded: settledRead.restart()
    }
    Timer { id: refreshDelay; interval: 150; onTriggered: root.refresh() }
    Timer { id: settledRead; interval: 50; onTriggered: root.readTheme() }
    Timer { id: scoring; interval: 100; onTriggered: root.score() }
}
