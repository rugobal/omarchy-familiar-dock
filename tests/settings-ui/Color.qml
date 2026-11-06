pragma Singleton
import QtQuick
QtObject {
    id: root
    property color foreground: "#eeeeee"
    property color background: "#222222"
    property color accent: "#99bbff"
    property color urgent: "#ff5555"
    property var shellValues: ({})
    property var menu: ({background:root.background, text:root.foreground, border:root.foreground})
    property var popups: menu
    property var tooltip: menu
}
