pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons as Commons
import "MenuModel.js" as Logic

PopupFrame {
    id: root
    focusTarget: list
    property var rows: []
    property int selected: -1
    signal activated(var row)
    implicitWidth: Math.min(360, panelWindow.screen.width - 16)
    implicitHeight: Math.min(rows.length * 34 + 12, panelWindow.screen.height - panelWindow.thickness - 24)
    function show(model, target) {
        rows = model; targetItem = target; selected = Logic.nextEnabled(rows, -1, 1); opened = true
    }
    function activate(index) {
        var row = rows[index]
        if (!row || row.enabled === false) return
        close(); activated(row)
    }
    Flickable {
        id: list
        anchors.fill: parent; anchors.margins: 6
        contentHeight: column.height; clip: true
        boundsBehavior: Flickable.StopAtBounds
        function move(delta) {
            root.selected = Logic.nextEnabled(root.rows, root.selected, delta)
            contentY = Math.max(0, Math.min(contentHeight - height, root.selected * 34 - height / 2))
        }
        Keys.onUpPressed: move(-1)
        Keys.onDownPressed: move(1)
        Keys.onReturnPressed: root.activate(root.selected)
        Keys.onEnterPressed: root.activate(root.selected)
        focus: root.opened
        Column {
            id: column; width: parent.width
            Repeater {
                model: root.rows
                Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    width: column.width; height: 34; radius: 4
                    color: index === root.selected ? Commons.Color.menu.selectedBackground : "transparent"
                    Text {
                        textFormat: Text.PlainText
                        anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 10
                        verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
                        text: (row.modelData.checked === undefined ? "" : row.modelData.checked ? "✓  " : "    ") + row.modelData.text
                        color: row.index === root.selected ? Commons.Color.menu.selectedText : Commons.Color.menu.text
                        opacity: row.modelData.enabled === false ? 0.6 : 1
                        font.family: Commons.Style.font.family; font.pixelSize: Commons.Style.font.body
                    }
                    MouseArea {
                        anchors.fill: parent; hoverEnabled: true
                        enabled: row.modelData.enabled !== false
                        onEntered: root.selected = row.index
                        onClicked: root.activate(row.index)
                    }
                }
            }
        }
        WheelHandler { target: list; property: "contentY" }
    }
}
