import QtQuick
import qs.Commons as Commons
import "." as Local

// One key, drawn as the key: small, flat and low-contrast, so a row of them
// reads as one band of chrome (after OmaControl's ui/KeyCap.qml, MIT).
Rectangle {
    id: cap
    property string key: ""
    implicitWidth: Math.max(Commons.Style.space(18), label.implicitWidth + Commons.Style.space(10))
    implicitHeight: Commons.Style.space(18)
    radius: Local.Palette.chipRadius
    color: Local.Palette.shade(0.11)
    Text {
        id: label
        textFormat: Text.PlainText
        anchors.centerIn: parent
        text: cap.key
        color: Local.Palette.shade(0.8)
        font.family: Local.Palette.fontFamily
        font.pixelSize: Commons.Style.font.caption
        font.bold: true
    }
}
