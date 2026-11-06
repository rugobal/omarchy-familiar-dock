pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons as Commons
import "Indicator.js" as Logic
import "../services/Config.js" as ConfigLogic

Item {
    id: root
    required property var config
    property color dominant: Commons.Color.bar.text
    property int count: 0
    property bool focused: false
    property bool ungrouped: false
    readonly property bool shown: count > 0 && (!ungrouped || focused || config.get("group-apps-underline-unfocused"))

    // Keep both styles alive so switching focus crossfades their actual shapes,
    // rather than replacing a DASHES delegate with a METRO delegate mid-frame.
    component IndicatorLayer: Item {
        id: indicatorLayer
        required property bool focusedLayer
        readonly property string style: root.config.get(focusedLayer ? "dot-style-focused" : "dot-style-unfocused")
        readonly property string colorKey: Logic.colorKey(root.count, focusedLayer, root.config.get("dot-color-override"), root.config.get("dot-color-unfocused-different"))
        readonly property color ink: {
            var c = colorKey ? ConfigLogic.parseColor(root.config.get(colorKey)) : null
            return c ? Qt.rgba(c[0], c[1], c[2], c[3]) : root.dominant
        }
        readonly property var marks: Logic.marks(style, root.count, width, height, root.config.get("dot-position"), root.config.get("dot-size"), focusedLayer)
        opacity: root.shown && root.focused === focusedLayer ? 1 : 0
        Behavior on opacity {
            enabled: root.config.get("animate-app-switch")
            NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic }
        }
        Repeater {
            model: indicatorLayer.marks
            Rectangle {
                required property var modelData
                x: modelData.x; y: modelData.y
                width: modelData.width; height: modelData.height
                radius: modelData.radius
                color: Qt.rgba(indicatorLayer.ink.r * modelData.shade, indicatorLayer.ink.g * modelData.shade, indicatorLayer.ink.b * modelData.shade, indicatorLayer.ink.a)
                Behavior on color {
                    enabled: root.config.get("animate-app-switch")
                    ColorAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic }
                }
            }
        }
    }
    IndicatorLayer { anchors.fill: parent; focusedLayer: true }
    IndicatorLayer { anchors.fill: parent; focusedLayer: false }
}
