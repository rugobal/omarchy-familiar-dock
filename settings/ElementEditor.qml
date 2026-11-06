pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "ElementLayout.js" as Elements
import "ui" as Kit

// The panel's elements in order, on one card: a row each with its switch,
// where it sits, and arrows to move it. Space shows or hides it, Left and
// Right change where it sits.
Column {
    id: root
    required property var value
    required property var strings
    property var nav: null
    property string groupTitle: ""
    property string fieldLabel: ""
    signal edited(var value)
    readonly property var indices: Elements.indices(value)
    readonly property var placements: Form.positions.map(function(p) { return {value:p,label:Form.safe(root.strings.t("settings.option." + p))} })
    spacing: Commons.Style.space(10)
    function update(index, property, value) {
        edited(Elements.update(root.value, index, property, value))
    }
    function moveElement(index, delta) {
        edited(Elements.move(root.value, index, delta))
    }
    Text {
        textFormat: Text.PlainText
        width: parent.width; wrapMode: Text.WordWrap
        text: root.strings.t("settings.gnomeElementsOmitted")
        color: Kit.Palette.muted
        font.family: Kit.Palette.fontFamily; font.pixelSize: Commons.Style.font.caption
    }
    Rectangle {
        width: root.width
        implicitHeight: list.implicitHeight + Commons.Style.space(16)
        height: implicitHeight
        radius: Kit.Palette.cardRadius
        color: Kit.Palette.card
        border.width: Commons.Style.spacing.hairline
        border.color: Kit.Palette.divider
        Column {
            id: list
            x: Commons.Style.space(14); y: Commons.Style.space(8)
            width: parent.width - Commons.Style.space(28)
            Repeater {
                model: root.indices.length
                Kit.NavRow {
                    id: elementRow
                    required property int index
                    readonly property int sourceIndex: root.indices[index]
                    readonly property var row: root.value[sourceIndex]
                    objectName: "element:" + row.element
                    nav: root.nav
                    label: Form.safe(root.strings.t("settings.element." + row.element))
                    description: root.fieldLabel
                    groupTitle: root.groupTitle
                    bandInset: Commons.Style.space(8)
                    navBlocking: placement.popupOpen
                    navKeys: [{key: "Space", label: "settings.key.toggle"}, {key: "←→", label: "settings.key.choose"}]
                    implicitHeight: Math.max(name.implicitHeight, placement.implicitHeight) + Commons.Style.space(12)
                    onNavActivate: root.update(sourceIndex, "visible", !row.visible)
                    onNavStep: function(delta) {
                        var at = Form.positions.indexOf(row.position), next = Math.max(0, Math.min(Form.positions.length - 1, at + delta))
                        if (next !== at) root.update(sourceIndex, "position", Form.positions[next])
                    }
                    // A rule between elements, not after the last.
                    Rectangle {
                        visible: elementRow.index > 0
                        width: parent.width; height: Commons.Style.spacing.hairline
                        color: Kit.Palette.divider
                    }
                    Ui.ToggleSwitch {
                        id: shown
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        checked: elementRow.row.visible
                        cursorRing: false
                        foreground: Kit.Palette.foreground
                        accent: Kit.Palette.accent
                        onToggled: root.update(elementRow.sourceIndex, "visible", !elementRow.row.visible)
                    }
                    Text {
                        id: name
                        textFormat: Text.PlainText
                        anchors.left: shown.right
                        anchors.leftMargin: Commons.Style.space(12)
                        anchors.right: placement.left
                        anchors.rightMargin: Commons.Style.space(10)
                        anchors.verticalCenter: parent.verticalCenter
                        text: elementRow.label
                        elide: Text.ElideRight
                        color: elementRow.row.visible ? Kit.Palette.foreground : Kit.Palette.muted
                        font.family: Kit.Palette.fontFamily
                        font.pixelSize: Commons.Style.font.body
                    }
                    Ui.Dropdown {
                        id: placement
                        anchors.right: arrows.left
                        anchors.rightMargin: Commons.Style.space(10)
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(Commons.Style.space(200), elementRow.width * 0.4)
                        showLabel: false
                        value: elementRow.row.position
                        options: root.placements
                        fontFamily: Kit.Palette.fontFamily
                        hasCursor: elementRow.cursorHere
                        onChanged: function(value) {
                            root.update(elementRow.sourceIndex, "position", value)
                            placement.value = Qt.binding(function() { return elementRow.row.position })
                        }
                        onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
                    }
                    Row {
                        id: arrows
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Commons.Style.space(4)
                        Kit.IconButton { glyph: ""; name: Form.safe(root.strings.t("settings.up")); enabled: elementRow.index > 0; onClicked: root.moveElement(elementRow.sourceIndex,-1) }
                        Kit.IconButton { glyph: ""; name: Form.safe(root.strings.t("settings.down")); enabled: elementRow.index < root.indices.length - 1; onClicked: root.moveElement(elementRow.sourceIndex,1) }
                    }
                }
            }
        }
    }
}
