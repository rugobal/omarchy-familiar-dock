import QtQuick
import QtQuick.Window
import "../services"

Window {
    id: root
    width: 64; height: 64; visible: true
    property bool passed: false
    property int completed: 0
    IconColors {
        id: sampler
        sampleParent: root.contentItem
        onSampleReady: function(key) {
            var colors = sample("check", "image://icon/check", false)
            if (!colors || colors.edges.length <= 80 || colors.dominant !== "#ff0000") { Qt.quit(); return }
            root.completed++
            if (root.completed === 2) { root.passed = true; Qt.quit(); return }
            // Cache hit queues nothing, then changing theme generation resamples.
            ensure("check", "image://icon/check", false)
            if (queue.length || current) { Qt.quit(); return }
            generation++
            Qt.callLater(function() { sampler.ensure("check", "image://icon/check", false) })
        }
    }
    Component.onCompleted: sampler.ensure("check", "image://icon/check", false)
}
