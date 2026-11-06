import QtQuick
import qs.Commons as Commons
import "." as Local

// A band of the page: a bold heading, a rule, an optional muted note, then
// rows. Unframed by default; `framed` puts the rows on a card, for a group
// that is one thing (a list, a reading). After OmaControl's ui/SettingGroup.qml.
Column {
    id: group
    property string title: ""
    property string note: ""
    property bool framed: false
    property real rowSpacing: Commons.Style.space(18)
    default property alias content: body.data
    // Rows inside a card run their cursor band to the card's inside edge.
    readonly property real pad: framed ? Commons.Style.space(14) : 0
    width: parent ? parent.width : 0
    spacing: Commons.Style.space(6)
    // A group whose rows the search took away goes too, heading and all.
    // Asked of each row's own verdict and implicit height, never `visible`,
    // which depends on this very answer.
    readonly property bool searchEmpty: {
        var kids = body.children, any = false
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].searchHidden === undefined) { if (kids[i].implicitHeight > 0) return false; continue }
            any = true
            if (kids[i].searchHidden !== true) return false
        }
        return any
    }
    visible: !searchEmpty
    Text {
        textFormat: Text.PlainText
        visible: group.title !== ""
        topPadding: Commons.Style.space(8)
        text: group.title
        color: Local.Palette.foreground
        font.family: Local.Palette.fontFamily
        font.pixelSize: Commons.Style.font.heading
        font.bold: true
    }
    Rectangle {
        visible: group.title !== ""
        width: group.width
        height: Commons.Style.spacing.hairline
        color: Local.Palette.divider
    }
    Text {
        textFormat: Text.PlainText
        visible: group.note !== ""
        width: group.width
        text: group.note
        wrapMode: Text.WordWrap
        color: Local.Palette.muted
        font.family: Local.Palette.fontFamily
        font.pixelSize: Commons.Style.font.caption
        bottomPadding: Commons.Style.space(4)
    }
    Item {
        visible: group.title !== "" && group.note === ""
        width: group.width
        height: Commons.Style.space(6)
    }
    Rectangle {
        width: group.width
        implicitHeight: body.implicitHeight + group.pad * 2
        height: implicitHeight
        radius: group.framed ? Local.Palette.cardRadius : 0
        color: group.framed ? Local.Palette.card : "transparent"
        border.width: group.framed ? Commons.Style.spacing.hairline : 0
        border.color: Local.Palette.divider
        Column {
            id: body
            x: group.pad
            y: group.pad
            width: group.width - group.pad * 2
            spacing: group.rowSpacing
        }
    }
}
