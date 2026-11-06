import QtQuick
import qs.Commons as Commons
import "." as Local

// An outlined pill that acts the moment it is clicked: the lightest thing
// that can still be pressed (after OmaControl's ui/Chip.qml, MIT).
Rectangle {
    id: chip
    property string text: ""
    property bool on: false
    signal clicked()
    implicitWidth: label.implicitWidth + Commons.Style.space(22)
    implicitHeight: Commons.Style.space(22)
    radius: Local.Palette.pillRadius
    color: chip.on ? Local.Palette.accent : (mouse.containsMouse ? Local.Palette.tint(0.14) : "transparent")
    border.width: chip.on ? 0 : Commons.Style.spacing.hairline
    border.color: mouse.containsMouse ? Local.Palette.tint(0.5) : Local.Palette.shade(0.28)
    opacity: enabled ? 1 : 0.45
    Text {
        id: label
        textFormat: Text.PlainText
        anchors.centerIn: parent
        text: chip.text
        color: chip.on ? Local.Palette.onAccent : Local.Palette.foreground
        font.family: Local.Palette.fontFamily
        font.pixelSize: Commons.Style.font.caption
        font.bold: true
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: chip.clicked()
    }
}
