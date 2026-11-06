pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Effects
import qs.Commons as Commons
import "Layout.js" as Geometry
import "Hover.js" as HoverLogic

Item {
    id: root
    required property var config
    required property var actions
    required property var strings
    required property var panelWindow
    property bool vertical: false
    property int thickness: 45
    readonly property real iconSize: Geometry.iconGeometry(thickness, 0, config.get("appicon-padding")).icon
    readonly property real span: iconSize + config.get("show-apps-icon-side-padding") * 2
    readonly property string iconSource: config.get("show-apps-icon-file")
    readonly property real outlineAlpha: iconSource ? panelWindow.host.outlineAlpha("__show-apps", iconSource, false, panelWindow.backgroundHex) : 0
    implicitWidth: vertical ? thickness : span
    implicitHeight: vertical ? span : thickness
    // Next to the taskbar in a macOS-style row, Show Apps magnifies and
    // moves with the app icons: the panel sets its level and its shift (the
    // shift already glides; the zoom glides here, as an app icon's does).
    property real dockLevel: 0
    property real dockShift: 0
    readonly property var motion: HoverLogic.transform(config.settings, dockLevel, thickness, 1)
    property real zoom: Math.max(0.95, motion.zoom)
    property real lift: motion.travel + iconSize * Math.max(0, zoom - 1) / 2
    readonly property real growth: iconSize * (zoom - 1)
    Behavior on zoom { NumberAnimation { duration: Commons.Style.duration(root.motion.duration); easing.type: Easing.OutCubic } }
    Behavior on lift { NumberAnimation { duration: Commons.Style.duration(root.motion.duration); easing.type: Easing.OutCubic } }
    transform: Translate { x: root.vertical ? 0 : root.dockShift; y: root.vertical ? root.dockShift : 0 }
    Item {
        id: face
        anchors.fill: parent
        scale: root.zoom
        transform: Translate {
            x: root.vertical ? (root.panelWindow.edge === "LEFT" ? root.lift : -root.lift) : 0
            y: root.vertical ? 0 : (root.panelWindow.edge === "TOP" ? root.lift : -root.lift)
        }
        Image {
            anchors.centerIn: parent
            width: root.iconSize; height: width
            source: root.iconSource
            sourceSize: Qt.size(48, 48)
            visible: source.toString().length > 0
            fillMode: Image.PreserveAspectFit
            layer.enabled: root.outlineAlpha > 0
            layer.effect: MultiEffect {
                shadowEnabled: true
                shadowColor: Commons.Color.bar.text; shadowOpacity: root.outlineAlpha
                shadowHorizontalOffset: 0; shadowVerticalOffset: 0
                shadowScale: 1 + 2 / Math.max(1, root.iconSize); shadowBlur: 0.05
            }
        }
        Grid {
            anchors.centerIn: parent
            columns: 3
            spacing: root.iconSize * 0.12
            visible: !root.config.get("show-apps-icon-file")
            Repeater {
                model: 9
                Rectangle {
                    width: Math.max(2, Math.floor(root.iconSize * 0.16))
                    height: width; radius: width / 2
                    color: Commons.Color.bar.text
                }
            }
        }
    }
    MouseArea {
        id: mouse
        // Its grown box, which the app icons' boxes meet edge to edge.
        x: root.vertical ? 0 : -root.growth / 2
        y: root.vertical ? -root.growth / 2 : 0
        width: root.vertical ? root.width : Math.max(0, root.width + root.growth)
        height: root.vertical ? Math.max(0, root.height + root.growth) : root.height
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function(event) { root.panelWindow.clickElement("showAppsButton", event.button === Qt.RightButton ? "right" : "left") }
    }
    Tooltip {
        panelWindow: root.panelWindow; targetItem: root
        // What a click does, when it is not the drawer.
        text: root.panelWindow.host && root.panelWindow.host.drawerClickService && root.panelWindow.host.drawerClickService.label
            || root.strings.t("apps.show")
        edge: root.panelWindow.edge
        hovered: mouse.containsMouse
    }
}
