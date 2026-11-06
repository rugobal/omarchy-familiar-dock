import QtQuick
import qs.Commons as Commons
import "../services/Config.js" as Logic

Item {
    id: root
    required property var config
    required property var strings
    required property var panelWindow
    property bool vertical: false
    property int thickness: 45
    implicitWidth: vertical ? thickness : config.get("showdesktop-button-width")
    implicitHeight: vertical ? config.get("showdesktop-button-width") : thickness
    Rectangle {
        x: 0; y: 0
        width: root.vertical ? parent.width : 1
        height: root.vertical ? 1 : parent.height
        color: {
            var c = root.config.get("desktop-line-use-custom-color") ? Logic.parseColor(root.config.get("desktop-line-custom-color")) : null
            return c ? Qt.rgba(c[0], c[1], c[2], c[3]) : Qt.rgba(Commons.Color.bar.text.r, Commons.Color.bar.text.g, Commons.Color.bar.text.b, 0.2)
        }
    }
    property bool hovered: false
    function setHovered(value) {
        if (value === hovered) return
        hovered = value
        if (hovered && config.get("show-showdesktop-hover")) delay.restart()
        else { delay.stop(); panelWindow.fadeDesktop(false) }
    }
    Timer { id: delay; interval: root.config.get("show-showdesktop-delay"); onTriggered: if (root.hovered && root.config.get("show-showdesktop-hover")) root.panelWindow.fadeDesktop(true) }
    Connections {
        target: root.config
        function onSettingsChanged() { if (!root.config.get("show-showdesktop-hover")) { delay.stop(); root.panelWindow.fadeDesktop(false) } }
    }
    MouseArea {
        anchors.fill: parent; hoverEnabled: true
        onEntered: root.panelWindow.hoverTarget("desktopButton")
        onExited: if (root.hovered) root.panelWindow.unhover()
        onClicked: root.panelWindow.clickElement("desktopButton", "left")
    }
    Component.onDestruction: panelWindow.fadeDesktop(false)
    Tooltip {
        panelWindow: root.panelWindow; targetItem: root
        text: root.strings.t("desktop.show")
        edge: root.panelWindow.edge; hovered: root.hovered
    }

}
