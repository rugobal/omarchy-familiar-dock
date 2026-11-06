pragma ComponentBehavior: Bound
import QtQuick

// One serial sampler for every panel. Reparent into an existing panel window;
// a service Item alone has no scene from which grabToImage can read pixels.
Item {
    id: root
    property var sampleParent: null
    property int generation: 0
    property var samples: ({})
    property var queue: []
    property var current: null
    property var failedKeys: ({})
    signal sampleReady(string key)
    function key(id, source, grayscale) { return JSON.stringify([generation, id, String(source), !!grayscale]) }
    function sample(id, source, grayscale) { return samples[key(id, source, grayscale)] || null }
    function ensure(id, source, grayscale) {
        if (!source) return
        var k = key(id, source, grayscale)
        if (samples[k] || failedKeys[k] || (current && current.key === k) || queue.some(function(row) { return row.key === k })) return
        if (queue.length >= 256) return
        queue = queue.concat([{key: k, source: source, grayscale: !!grayscale}])
        Qt.callLater(pump)
    }
    function pump() {
        if (current || !sampleParent || !queue.length) return
        current = queue[0]; queue = queue.slice(1)
        sampler.active = true
        timeout.restart()
    }
    function finish(colors, expectedKey) {
        if (!current || (expectedKey && current.key !== expectedKey)) return
        var k = current.key
        if (colors) { const next = Object.assign({}, samples); next[k] = colors; samples = next }
        else { const failures = Object.assign({}, failedKeys); failures[k] = true; failedKeys = failures }
        timeout.stop(); sampler.active = false; current = null
        sampleReady(k)
        Qt.callLater(pump)
    }
    onSampleParentChanged: Qt.callLater(pump)
    onGenerationChanged: {
        timeout.stop(); sampler.active = false; current = null; queue = []; failedKeys = ({}); samples = ({})
    }
    Loader {
        id: sampler
        parent: root.sampleParent || root
        active: false
        opacity: 0
        width: 48; height: 48
        sourceComponent: IconSampler {
            source: root.current ? root.current.source : ""
            grayscale: !!root.current && root.current.grayscale
            onSampled: function(colors) {
                const key = root.current ? root.current.key : "stale"
                Qt.callLater(function() { root.finish(colors, key) })
            }
            onFailed: {
                const key = root.current ? root.current.key : "stale"
                Qt.callLater(function() { root.finish(null, key) })
            }
        }
    }
    Timer { id: timeout; interval: 3000; onTriggered: root.finish(null) }
}
