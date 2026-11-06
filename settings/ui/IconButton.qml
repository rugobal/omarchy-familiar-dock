import QtQuick
import qs.Commons as Commons
import "." as Local

// A round glyph button for row actions (move, remove). Its name is the
// tooltip-less label read by tests and screen readers.
Rectangle {
    id: button
    property string glyph: ""
    property string name: ""
    property bool destructive: false
    signal clicked()
    Accessible.role: Accessible.Button
    Accessible.name: name
    implicitWidth: Commons.Style.space(26)
    implicitHeight: Commons.Style.space(26)
    radius: width / 2
    color: mouse.containsMouse && enabled
        ? (destructive ? Qt.rgba(Local.Palette.urgent.r, Local.Palette.urgent.g, Local.Palette.urgent.b, 0.16) : Local.Palette.hover)
        : "transparent"
    opacity: enabled ? 1 : 0.3
    Text {
        textFormat: Text.PlainText
        anchors.centerIn: parent
        text: button.glyph
        color: button.destructive && mouse.containsMouse ? Local.Palette.urgent : Local.Palette.muted
        font.family: Local.Palette.fontFamily
        font.pixelSize: Commons.Style.font.body
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: button.clicked()
    }
}
