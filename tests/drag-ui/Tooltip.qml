// Stand-in: the real tooltip is a Quickshell PopupWindow.
import QtQuick
Item {
    property var panelWindow
    property Item targetItem
    property string text: ""
    property string edge: "BOTTOM"
    property bool hovered: false
}
