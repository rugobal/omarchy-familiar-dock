import QtQuick
import qs.Commons as Commons

Item {
    id: root
    required property var panelWindow
    property bool vertical: false
    property int thickness: 45
    property date now: new Date()
    implicitWidth: vertical ? thickness : label.implicitWidth + 24
    implicitHeight: vertical ? label.implicitHeight + 16 : thickness
    Timer {
        interval: Math.max(1, 60000 - (root.now.getSeconds() * 1000 + root.now.getMilliseconds()))
        running: true
        repeat: false
        onTriggered: { root.now = new Date(); restart() }
    }
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        onClicked: function(event) { root.panelWindow.clickElement("dateMenu", event.button === Qt.RightButton ? "right" : event.button === Qt.MiddleButton ? "middle" : "left") }
    }
    Text {
        id: label
        anchors.centerIn: parent
        textFormat: Text.PlainText
        text: Qt.locale(Commons.I18n.formatLocale).toString(root.now, root.vertical ? "ddd\nMMM d\nHH:mm" : "ddd MMM d  HH:mm")
        horizontalAlignment: Text.AlignHCenter
        color: Commons.Color.bar.text
        font.family: Commons.Style.font.family
        font.pixelSize: Commons.Style.font.body
    }
}
