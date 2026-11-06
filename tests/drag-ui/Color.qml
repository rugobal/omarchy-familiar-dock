pragma Singleton
import QtQuick
QtObject {
    id: root
    property color accent: "#99bbff"
    property var bar: ({background: "#202020", text: "#eeeeee"})
    property var menu: ({background: "#222222", text: "#eeeeee"})
}
