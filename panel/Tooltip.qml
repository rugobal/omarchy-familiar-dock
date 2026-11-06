import QtQuick
import Quickshell
import qs.Commons as Commons
import "PopupGeometry.js" as Geometry

PopupWindow {
    id: root
    required property var panelWindow
    required property Item targetItem
    property string text: ""
    property string edge: "BOTTOM"
    property bool hovered: false
    property bool enabled: true
    property bool ready: false
    readonly property real hoverClearance: targetItem && "popupClearance" in targetItem ? targetItem.popupClearance : 0
    onHoverClearanceChanged: anchor.updateAnchor()
    visible: enabled && hovered && ready && text.length > 0 && !panelWindow.underFullscreen && !panelWindow.host.popupOpen
    color: "transparent"
    implicitWidth: Math.min(400, label.implicitWidth + 20)
    implicitHeight: label.implicitHeight + 14
    onHoveredChanged: { ready = false; if (hovered) delay.restart(); else delay.stop() }
    Timer { id: delay; interval: 500; onTriggered: root.ready = true }
    anchor {
        window: root.panelWindow
        adjustment: PopupAdjustment.Slide
        edges: Edges.Top | Edges.Left
        gravity: Edges.Bottom | Edges.Right
        rect.width: 1; rect.height: 1
        onAnchoring: {
            var target = root.targetItem
            var offset = Geometry.position(root.edge, target.width, target.height, root.implicitWidth, root.implicitHeight, 6 + root.hoverClearance)
            var point = root.panelWindow.contentItem.mapFromItem(target, offset.x, offset.y)
            root.anchor.rect.x = Math.round(point.x)
            root.anchor.rect.y = Math.round(point.y)
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: Commons.Style.cornerRadius
        color: Commons.Color.tooltip.background
        border.width: 1
        border.color: Commons.Color.tooltip.border
        Text {
            id: label
            textFormat: Text.PlainText
            text: root.text.slice(0, 512)
            anchors.centerIn: parent
            width: Math.min(380, implicitWidth)
            elide: Text.ElideRight
            color: Commons.Color.tooltip.text
            font.family: Commons.Style.font.family
            font.pixelSize: Commons.Style.font.body
        }
    }
}
