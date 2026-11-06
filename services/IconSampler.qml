import QtQuick
import "IconColors.js" as Logic

// Provider-independent readback: render the same Image the panel uses, then
// retain its grab URL while Canvas reads it. Tested with image://icon/ sources.
Item {
    id: root
    width: 48; height: 48
    property url source
    property bool grayscale: false
    property var grab: null
    property bool capturing: false
    signal sampled(var colors)
    signal failed()
    function capture() {
        if (capturing || image.status !== Image.Ready || !canvas.available) return
        capturing = true
        if (!image.grabToImage(function(result) {
            root.grab = result
            canvas.loadImage(result.url)
            Qt.callLater(canvas.readPixels)
        }, Qt.size(48, 48))) failed()
    }
    Image {
        id: image
        anchors.fill: parent
        source: root.source
        sourceSize: Qt.size(48, 48)
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        onStatusChanged: {
            if (status === Image.Ready) Qt.callLater(root.capture)
            else if (status === Image.Error) root.failed()
        }
    }
    Canvas {
        id: canvas
        width: 48; height: 48; opacity: 0
        onAvailableChanged: if (available) Qt.callLater(root.capture)
        onImageLoaded: readPixels()
        function readPixels() {
            if (!root.grab || !isImageLoaded(root.grab.url)) return
            // No context yet (the canvas has nowhere to render): the image
            // load or the queued call tries again, and IconColors times out.
            var ctx = getContext("2d")
            if (!ctx) return
            ctx.clearRect(0, 0, 48, 48)
            ctx.drawImage(root.grab.url, 0, 0, 48, 48)
            try {
                let pixels = ctx.getImageData(0, 0, 48, 48).data
                if (root.grayscale) pixels = Logic.grayscale(pixels)
                root.sampled(Logic.analyze(pixels, 48, 48))
            }
            catch (error) { root.failed() }
            unloadImage(root.grab.url)
            root.grab = null
        }
    }
}
