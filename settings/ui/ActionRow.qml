import QtQuick
import qs.Commons as Commons
import qs.Ui as Ui
import "." as Local

// A row that does one thing: its name and what it does on the left, the
// button on the right. Enter on the row presses the button.
// After OmaControl's ui/ActionRow.qml (MIT, see NOTICE.md).
Local.NavRow {
    id: row
    property string buttonText: ""
    property bool actionEnabled: true
    property bool destructive: false
    signal triggered()
    navKeys: [{key: "↵", label: "settings.key.run"}]
    implicitHeight: Math.max(head.implicitHeight, button.implicitHeight)
    onNavActivate: if (row.actionEnabled) row.triggered()
    Column {
        id: head
        width: row.width * 0.5
        anchors.verticalCenter: parent.verticalCenter
        spacing: Commons.Style.space(2)
        Text {
            textFormat: Text.PlainText
            width: parent.width
            text: row.label
            wrapMode: Text.WordWrap
            color: Local.Palette.foreground
            font.family: Local.Palette.fontFamily
            font.pixelSize: Commons.Style.font.subtitle
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: text !== ""
            text: row.description
            wrapMode: Text.WordWrap
            color: Local.Palette.muted
            font.family: Local.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
        }
    }
    Ui.Button {
        id: button
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        enabled: row.actionEnabled
        opacity: row.actionEnabled ? 1 : 0.4
        text: row.buttonText
        bordered: true
        hasCursor: row.cursorHere
        foreground: row.destructive ? Local.Palette.urgent : Local.Palette.foreground
        accent: row.destructive ? Local.Palette.urgent : Local.Palette.accent
        fontFamily: Local.Palette.fontFamily
        onClicked: if (row.actionEnabled) row.triggered()
    }
}
