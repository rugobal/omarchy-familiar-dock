pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Services.SystemTray
import qs.Commons as Commons
Item {
    id: root
    required property var panel
    property bool vertical: panel.vertical
    readonly property var items: SystemTray.items.values
    readonly property int count: items.length
    readonly property int iconSize: panel.config.get("tray-size") || Math.min(24, panel.innerThickness - 4)
    readonly property int padding: panel.config.get("tray-padding") < 0 ? 4 : panel.config.get("tray-padding")
    readonly property int statusPadding: panel.config.get("status-icon-padding") < 0 ? 0 : panel.config.get("status-icon-padding")
    readonly property int extent: iconSize + 2 * (padding + statusPadding)
    readonly property real naturalLength: count * extent
    readonly property bool menuOpen: popup.opened
    property var activeAnchor: null
    property var activeSlot: null
    property var stack: []
    readonly property var menuChildren: stack.length ? stack[stack.length - 1].children : opener.children
    Component { id: nestedOpener; QsMenuOpener {} }
    function clearStack() {
        var old = stack; stack = []
        for (var i = old.length - 1; i >= 0; i--) old[i].destroy()
    }
    function enter(entry) {
        var child = nestedOpener.createObject(root, {menu: entry})
        if (child) stack = stack.concat([child])
    }
    function back() {
        var old = stack[stack.length - 1]; stack = stack.slice(0,-1); if (old) old.destroy()
    }
    function close() { popup.close(); clearStack(); activeAnchor = null; activeSlot = null }
    function show(anchor, target) {
        panel.host.closePopups()
        activeAnchor = anchor; activeSlot = target; clearStack(); popup.opened = true
    }
    QsMenuOpener { id: opener; menu: root.activeAnchor ? root.activeAnchor.menu : null }
    PopupFrame {
        id: popup
        panelWindow: root.panel; targetItem: root.activeSlot
        onDismissed: { root.clearStack(); root.activeAnchor = null; root.activeSlot = null }
        implicitWidth: 280
        implicitHeight: Math.min(600, menuColumn.implicitHeight + 12)
        Flickable {
            anchors.fill: parent; anchors.margins: 6; clip: true
            contentHeight: menuColumn.implicitHeight
            Column {
                id: menuColumn
                width: parent.width
                Rectangle {
                    width: parent.width; height: root.stack.length ? 32 : 0; visible: root.stack.length > 0
                    color: root.panel.backgroundColor
                    Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: Commons.I18n.rightToLeft ? "›" : "‹"; color: root.panel.host.themeBackground.foreground }
                    MouseArea { anchors.fill: parent; onClicked: root.back() }
                }
                Repeater {
                    model: root.menuChildren
                    Rectangle {
                        id: row
                        required property var modelData
                        width: menuColumn.width; height: modelData.isSeparator ? 8 : 32
                        color: hover.containsMouse ? root.panel.host.themeBackground.foreground : root.panel.backgroundColor
                        opacity: modelData.enabled ? 1 : 0.5
                        Text {
                            textFormat: Text.PlainText; anchors.fill: parent; anchors.margins: 6
                            text: (row.modelData.checkState === Qt.Checked ? "✓ " : row.modelData.checkState === Qt.PartiallyChecked ? "− " : "") +
                                String(row.modelData.text || "").slice(0,256) + (row.modelData.hasChildren ? (Commons.I18n.rightToLeft ? " ‹" : " ›") : "")
                            elide: Text.ElideRight
                            color: hover.containsMouse ? root.panel.backgroundColor : root.panel.host.themeBackground.foreground
                        }
                        MouseArea {
                            id: hover; anchors.fill: parent; hoverEnabled: true
                            enabled: row.modelData.enabled && !row.modelData.isSeparator
                            onClicked: {
                                if (row.modelData.hasChildren) root.enter(row.modelData)
                                else { row.modelData.triggered(); root.close() }
                            }
                        }
                    }
                }
            }
        }
    }
    implicitWidth: vertical ? panel.innerThickness : naturalLength
    implicitHeight: vertical ? naturalLength : panel.innerThickness
    Repeater {
        model: root.items
        Item {
            id: slot
            required property var modelData
            required property int index
            x: root.vertical ? 0 : index * root.extent
            y: root.vertical ? index * root.extent : 0
            width: root.vertical ? root.panel.innerThickness : root.extent
            height: root.vertical ? root.extent : root.panel.innerThickness
            Image { anchors.centerIn: parent; width: root.iconSize; height: width; source: slot.modelData.icon; fillMode: Image.PreserveAspectFit }
            QsMenuAnchor {
                id: menu
                menu: slot.modelData.menu
                anchor.window: root.panel
                anchor.item: slot
                anchor.edges: root.panel.edge === "BOTTOM" ? Edges.Top : root.panel.edge === "RIGHT" ? Edges.Left : root.panel.edge === "LEFT" ? Edges.Right : Edges.Bottom
                anchor.gravity: root.panel.edge === "BOTTOM" ? Edges.Top : root.panel.edge === "RIGHT" ? Edges.Left : root.panel.edge === "LEFT" ? Edges.Right : Edges.Bottom
            }
            MouseArea {
                anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton; hoverEnabled: true
                // Passing over an icon switches an open menu to its own, but
                // never closes Settings.
                onEntered: if (!root.panel.config.get("stockgs-panelbtn-click-only") && root.panel.popupOpen && !root.panel.host.settingsOpen && slot.modelData.hasMenu) root.show(menu, slot)
                onClicked: function(event) {
                    if (event.button === Qt.MiddleButton) slot.modelData.secondaryActivate()
                    else if (slot.modelData.hasMenu && (event.button === Qt.RightButton || slot.modelData.onlyMenu)) { root.panel.host.closePopups(); root.show(menu, slot) }
                    else slot.modelData.activate()
                }
                onWheel: function(event) { slot.modelData.scroll(event.angleDelta.y, false) }
            }
        }
    }
}
