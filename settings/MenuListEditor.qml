pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "ui" as Kit

// Title/command pairs, one framed card per entry: the two fields, then the
// controls that move or remove it. Each field is a row of its own for the
// keyboard cursor.
Column {
    id: root
    required property var value
    required property var strings
    property var nav: null
    property string groupTitle: ""
    property string fieldLabel: ""
    property int titleMaximumLength: 256
    property bool acceptReloads: true
    signal edited(var rows)
    spacing: Commons.Style.space(10)
    function entries() {
        var result = []
        for (var i = 0; i < rows.count; i++) result.push({title:rows.get(i).entryTitle, cmd:rows.get(i).entryCommand})
        return result
    }
    // Keep delegates alive while typing, after a save, and when reordering.
    // Reloads update the model but never emit edited().
    function sync() {
        if (!acceptReloads || !rows || !value || JSON.stringify(entries()) === JSON.stringify(value)) return
        while (rows.count > value.length) rows.remove(rows.count - 1)
        value.forEach(function(r, i) {
            if (i >= rows.count) rows.append({entryTitle:r.title, entryCommand:r.cmd})
            else { rows.setProperty(i,"entryTitle",r.title); rows.setProperty(i,"entryCommand",r.cmd) }
        })
    }
    function editRow(index, role, value) { rows.setProperty(index, role, value); edited(entries()) }
    function addRow() { if (rows.count < 64) { rows.append({entryTitle:"",entryCommand:""}); edited(entries()) } }
    function removeRow(index) { rows.remove(index); edited(entries()) }
    function moveRow(index, delta) {
        var target = index + delta
        if (target < 0 || target >= rows.count) return
        rows.move(index,target,1); edited(entries())
    }
    onValueChanged: sync()
    // The writer publishes the last disk read before committing its pending
    // change. Skip that intermediate snapshot, then reconcile after the save.
    onAcceptReloadsChanged: if (acceptReloads && reloadRows) reloadRows.restart()
    Timer { id: reloadRows; interval: 0; onTriggered: root.sync() }
    Component.onCompleted: sync()
    ListModel { id: rows }
    Repeater {
        model: rows
        Rectangle {
            id: entry
            required property int index
            required property string entryTitle
            required property string entryCommand
            width: root.width
            implicitHeight: body.implicitHeight + Commons.Style.space(24)
            height: implicitHeight
            radius: Kit.Palette.cardRadius
            color: Kit.Palette.card
            border.width: Commons.Style.spacing.hairline
            border.color: Kit.Palette.divider
            visible: !(titleRow.searchHidden && commandRow.searchHidden)
            Column {
                id: body
                x: Commons.Style.space(12); y: Commons.Style.space(12)
                width: parent.width - Commons.Style.space(24)
                spacing: Commons.Style.space(10)
                Repeater {
                    model: [{role: "entryTitle", name: "settings.list.title", id: "menu-title:"},
                            {role: "entryCommand", name: "settings.list.command", id: "menu-command:"}]
                    Kit.NavRow {
                        id: part
                        required property var modelData
                        required property int index
                        nav: root.nav
                        label: Form.safe(root.strings.t(modelData.name)) + " " + (entry.index + 1)
                        description: root.fieldLabel + " " + (modelData.role === "entryTitle" ? entry.entryTitle : entry.entryCommand)
                        groupTitle: root.groupTitle
                        bandInset: Commons.Style.space(6)
                        navKeys: [{key: "↵", label: "settings.key.edit"}]
                        implicitHeight: input.implicitHeight
                        onNavActivate: { input.forceActiveFocus(); input.selectAll() }
                        Component.onCompleted: if (index === 0) titleRow.row = part; else commandRow.row = part
                        Text {
                            textFormat: Text.PlainText
                            anchors.verticalCenter: parent.verticalCenter
                            width: Commons.Style.space(90)
                            text: Form.safe(root.strings.t(part.modelData.name))
                            color: Kit.Palette.muted
                            font.family: Kit.Palette.fontFamily
                            font.pixelSize: Commons.Style.font.caption
                            font.bold: true
                        }
                        Ui.TextField {
                            id: input
                            objectName: part.modelData.id + entry.index
                            x: Commons.Style.space(90)
                            width: parent.width - x
                            text: part.modelData.role === "entryTitle" ? entry.entryTitle : entry.entryCommand
                            maximumLength: part.modelData.role === "entryTitle" ? root.titleMaximumLength : 4096
                            selectByMouse: true
                            hasCursor: part.cursorHere
                            foreground: Kit.Palette.foreground
                            accent: Kit.Palette.accent
                            font.family: Kit.Palette.fontFamily
                            onTextEdited: root.editRow(entry.index, part.modelData.role, text)
                        }
                    }
                }
                Row {
                    anchors.right: parent.right
                    spacing: Commons.Style.space(6)
                    Kit.IconButton { glyph: ""; name: Form.safe(root.strings.t("settings.up")); enabled: entry.index > 0; onClicked: root.moveRow(entry.index,-1) }
                    Kit.IconButton { glyph: ""; name: Form.safe(root.strings.t("settings.down")); enabled: entry.index < rows.count - 1; onClicked: root.moveRow(entry.index,1) }
                    Kit.IconButton { glyph: ""; name: Form.safe(root.strings.t("settings.list.remove")); destructive: true; onClicked: root.removeRow(entry.index) }
                }
            }
            // The two field rows, for the card's own search verdict.
            QtObject { id: titleRow; property var row: null; readonly property bool searchHidden: !!row && row.searchHidden }
            QtObject { id: commandRow; property var row: null; readonly property bool searchHidden: !!row && row.searchHidden }
        }
    }
    Kit.ActionRow {
        objectName: "menu-add"
        nav: root.nav
        label: Form.safe(root.strings.t("settings.list.add"))
        description: root.fieldLabel
        groupTitle: root.groupTitle
        buttonText: "+ " + Form.safe(root.strings.t("settings.list.add"))
        actionEnabled: rows.count < 64
        onTriggered: root.addRow()
    }
}
