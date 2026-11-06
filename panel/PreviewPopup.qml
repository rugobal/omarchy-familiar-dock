pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons as Commons
import "PreviewLogic.js" as Logic
import "../services/Config.js" as ConfigLogic

PopupFrame {
    id: root
    required property var config
    required property var actions
    required property var appModel
    required property var strings
    property string appKey: ""
    property string itemKey: ""
    property bool clickedOpen: false
    property int hoveredCard: -1
    readonly property var item: panelWindow.items.filter(function(i) { return i.key === root.itemKey })[0] || null
    readonly property var windows: item ? item.windows : []
    readonly property var byAddress: {
        var result = {}
        windows.forEach(function(w) { result[w.address] = w })
        return result
    }
    readonly property bool showing: opened && windows.length > 0
    interactive: clickedOpen
    reserveHover: true
    animationTime: config.get("window-preview-animation-time")
    backgroundColor: {
        var c = Commons.Color.menu.background
        return Qt.rgba(c.r, c.g, c.b, config.get("preview-use-custom-opacity") ? config.get("preview-custom-opacity") / 100 : c.a)
    }
    implicitWidth: Math.min(row.width + 12, panelWindow.screen.width - 20)
    implicitHeight: Math.min(row.height + 12, panelWindow.screen.height - panelWindow.thickness - 20)
    onWindowsChanged: { if (!windows.length) close(); else if (hoveredCard >= windows.length) hoverCard(-1) }
    onContainsMouseChanged: { if (containsMouse) leave.stop(); else scheduleClose() }
    onOpenedChanged: if (!opened) { hoveredCard = -1; peek.stop(); panelWindow.releasePeek() }
    function show(app, target, clicked) {
        if (itemKey !== app.key) { hoveredCard = -1; peek.stop(); panelWindow.releasePeek() }
        appKey = app.appKey; itemKey = app.key; targetItem = target; clickedOpen = !!clicked
        immediate = false; opened = true; leave.stop()
    }
    function scheduleClose() { if (!containsMouse && !panelWindow.hoveredButton && hoveredCard < 0) leave.restart() }
    function dismiss(immediately) { immediate = !!immediately; close() }
    function hoverCard(index) {
        index = opened && Number.isInteger(index) && index >= 0 && index < windows.length ? index : -1
        if (hoveredCard === index) return
        peek.stop(); panelWindow.releasePeek()
        hoveredCard = index
        if (index >= 0 && windows[index] && config.get("peek-mode")) peek.restart()
        if (index >= 0) leave.stop(); else scheduleClose()
    }
    function activateCard(index, button) {
        var w = windows[index]
        if (!w) return
        if (button === "middle") {
            if (config.get("preview-middle-click-close")) actions.closeWindow(w)
        } else {
            actions.bringForward(w, panelWindow.workspaceId)
            dismiss(config.get("window-preview-hide-immediate-click"))
        }
    }
    Timer { id: leave; interval: root.config.get("leave-timeout"); onTriggered: if (!root.containsMouse && !root.panelWindow.hoveredButton && root.hoveredCard < 0) root.close() }
    Timer { id: peek; interval: root.config.get("enter-peek-mode-timeout"); onTriggered: if (root.windows[root.hoveredCard]) root.panelWindow.peek(root.windows[root.hoveredCard]) }
    Flickable {
        id: scroller
        anchors.fill: parent; anchors.margins: 6; clip: true
        contentWidth: row.width; contentHeight: row.height
        flickableDirection: Flickable.HorizontalFlick
        boundsBehavior: Flickable.StopAtBounds
        WheelHandler { target: scroller; property: "contentX" }
        Row {
            id: row; spacing: root.config.get("window-preview-padding")
            Repeater {
                model: ScriptModel { values: root.windows.map(function(w) { return w.address }) }
                Rectangle {
                    id: card
                    required property string modelData
                    required property int index
                    readonly property var windowData: root.byAddress[modelData] || null
                    readonly property var dims: Logic.dimensions(root.config.settings, root.panelWindow.vertical, capture.sourceSize.width, capture.sourceSize.height)
                    readonly property int padding: root.config.get("window-preview-padding")
                    readonly property int header: root.config.get("window-preview-show-title") ? Math.max(30, headerIcon.height + 8) : 0
                    width: Math.min(root.panelWindow.screen.width - 40, dims.width + padding * 2)
                    height: dims.height + header + padding * 2
                    color: root.hoveredCard === index ? Qt.rgba(Commons.Color.menu.text.r, Commons.Color.menu.text.g, Commons.Color.menu.text.b, 0.1) : "transparent"
                    radius: 4
                    Item {
                        id: imageFrame
                        x: card.padding
                        y: card.padding + (root.config.get("window-preview-title-position") === "TOP" ? card.header : 0)
                        width: parent.width - card.padding * 2; height: card.dims.height
                        ScreencopyView {
                            id: capture
                            anchors.fill: parent
                            captureSource: root.visible && card.windowData ? card.windowData.toplevel : null
                            live: true
                            constraintSize: Qt.size(Math.round(width * 2), Math.round(height * 2))
                        }
                        Image {
                            anchors.centerIn: parent; width: 48; height: 48
                            visible: !capture.hasContent
                            source: root.item ? root.appModel.iconFor(root.item, "NORMAL") : ""
                            fillMode: Image.PreserveAspectFit
                        }
                    }
                    Item {
                        x: card.padding
                        y: root.config.get("window-preview-title-position") === "TOP" ? card.padding : imageFrame.y + imageFrame.height
                        width: parent.width - card.padding * 2; height: card.header
                        visible: height > 0
                        Image {
                            id: headerIcon
                            x: 0; anchors.verticalCenter: parent.verticalCenter
                            width: root.config.get("window-preview-use-custom-icon-size") ? root.config.get("window-preview-custom-icon-size") : 16
                            height: width
                            source: root.item ? root.appModel.iconFor(root.item, "NORMAL") : ""
                            fillMode: Image.PreserveAspectFit
                        }
                        Text {
                            textFormat: Text.PlainText
                            x: headerIcon.width + 6; width: Math.max(0, parent.width - x - 30)
                            anchors.verticalCenter: parent.verticalCenter; elide: Text.ElideRight
                            text: card.windowData ? String(card.windowData.title).slice(0, 512) : ""
                            color: {
                                var c = root.config.get("window-preview-manual-styling") ? ConfigLogic.parseColor(root.config.get("window-preview-title-font-color")) : null
                                return c ? Qt.rgba(c[0], c[1], c[2], c[3]) : Commons.Color.menu.text
                            }
                            font.family: Commons.Style.font.family
                            font.pixelSize: root.config.get("window-preview-manual-styling") ? root.config.get("window-preview-title-font-size") : Commons.Style.font.body
                            font.weight: root.config.get("window-preview-manual-styling") ? ({inherit: Font.Normal, normal: Font.Normal, lighter: Font.Light, bold: Font.Bold, bolder: Font.ExtraBold})[root.config.get("window-preview-title-font-weight")] : Font.Normal
                        }
                    }
                    MouseArea {
                        anchors.fill: parent; hoverEnabled: true
                        acceptedButtons: Qt.LeftButton | Qt.MiddleButton
                        onEntered: root.hoverCard(card.index)
                        onExited: if (root.hoveredCard === card.index) root.hoverCard(-1)
                        onClicked: function(event) { root.activateCard(card.index, event.button === Qt.MiddleButton ? "middle" : "left") }
                    }
                    Rectangle {
                        anchors.right: parent.right; anchors.top: parent.top
                        width: 28; height: 28; radius: 4
                        color: closeMouse.containsMouse ? Commons.Color.menu.selectedBackground : "transparent"
                        Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: "×"; color: Commons.Color.menu.text; font.pixelSize: 20 }
                        MouseArea { id: closeMouse; anchors.fill: parent; hoverEnabled: true; onClicked: root.actions.closeWindow(card.windowData) }
                    }
                }
            }
        }
    }
    Component.onDestruction: panelWindow.releasePeek()
}
