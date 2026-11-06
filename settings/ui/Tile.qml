import QtQuick
import qs.Commons as Commons
import qs.Ui as Ui
import "." as Local

// One switch as a tile: a round badge, the name over its state, then the
// switch. The accent fill is the state, read across the whole set at once;
// the whole tile is the target. After OmaControl's ui/ToggleTile.qml (MIT).
Local.NavRow {
    id: tile
    property string glyph: ""
    property string note: ""
    property bool checked: false
    signal requested(bool next)
    showBand: false
    onNavActivate: tile.requested(!tile.checked)
    implicitHeight: Math.max(badge.height, control.implicitHeight) + Commons.Style.space(18)
    Rectangle {
        anchors.fill: parent
        radius: Local.Palette.cardRadius
        color: tile.checked ? Local.Palette.accent : (mouse.containsMouse ? Local.Palette.hover : Local.Palette.card)
        border.width: tile.checked ? 0 : Commons.Style.spacing.hairline
        border.color: Local.Palette.divider
        Behavior on color { ColorAnimation { duration: Commons.Style.duration(120); easing.type: Easing.OutCubic } }
        // The cursor is a ring inside the edge, the same filled or empty.
        Rectangle {
            anchors.fill: parent
            anchors.margins: Commons.Style.spacing.hairline
            radius: parent.radius
            color: "transparent"
            border.width: Math.max(1, Commons.Style.normalBorderWidth)
            border.color: tile.checked ? Local.Palette.onAccent : Local.Palette.accent
            visible: tile.cursorHere
        }
    }
    Rectangle {
        id: badge
        anchors.left: parent.left
        anchors.leftMargin: Commons.Style.space(11)
        anchors.verticalCenter: parent.verticalCenter
        width: Commons.Style.space(28)
        height: width
        radius: width / 2
        color: tile.checked ? Local.Palette.onAccentWash(0.20) : Local.Palette.shade(0.12)
        Text {
            textFormat: Text.PlainText
            anchors.centerIn: parent
            text: tile.glyph
            color: tile.checked ? Local.Palette.onAccent : Local.Palette.foreground
            font.family: Local.Palette.fontFamily
            font.pixelSize: Commons.Style.font.body
        }
    }
    Column {
        anchors.left: badge.right
        anchors.leftMargin: Commons.Style.space(9)
        anchors.right: control.left
        anchors.rightMargin: Commons.Style.space(9)
        anchors.verticalCenter: parent.verticalCenter
        Text {
            textFormat: Text.PlainText
            width: parent.width
            text: tile.label
            elide: Text.ElideRight
            color: tile.checked ? Local.Palette.onAccent : Local.Palette.foreground
            font.family: Local.Palette.fontFamily
            font.pixelSize: Commons.Style.font.body
            font.bold: true
        }
        Text {
            textFormat: Text.PlainText
            visible: tile.note !== ""
            width: parent.width
            text: tile.note
            elide: Text.ElideRight
            color: tile.checked ? Local.Palette.onAccent : Local.Palette.muted
            opacity: tile.checked ? 0.9 : 1
            font.family: Local.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
            font.bold: true
        }
    }
    Ui.ToggleSwitch {
        id: control
        anchors.right: parent.right
        anchors.rightMargin: Commons.Style.space(11)
        anchors.verticalCenter: parent.verticalCenter
        checked: tile.checked
        // The tile owns the click, so the switch takes no cursor of its own.
        interactive: false
        foreground: tile.checked ? Local.Palette.onAccent : Local.Palette.foreground
        accent: tile.checked ? Local.Palette.onAccentWash(0.35) : Local.Palette.accent
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: tile.requested(!tile.checked)
    }
}
