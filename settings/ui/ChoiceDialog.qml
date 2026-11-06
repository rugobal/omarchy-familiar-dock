import QtQuick
import qs.Commons as Commons
import qs.Ui as Ui

// Omarchy's ConfirmDialog with a list under the question and any number of
// answers. Escape or a click outside the card cancels; the first answer is
// selected when it opens, so Enter alone never takes the risky one.
Item {
    id: root

    property bool opened: false
    property string message: ""
    // [{title, text}], shown in full under the message: a list longer than
    // the card scrolls, by wheel or by Up, Down, Page Up and Page Down.
    property var entries: []
    // [{text, destructive}]
    property var choices: []
    property int selectedIndex: 0
    property color background: Commons.Color.background
    property color foreground: Commons.Color.foreground
    property color muted: Commons.Util.alpha(foreground, 0.7)
    property color selectedText: Commons.Color.accent
    property string fontFamily: Commons.Style.font.family

    signal canceled()
    signal chosen(int index)

    onOpenedChanged: if (opened) { selectedIndex = 0; list.contentY = 0 }
    function scrollBy(delta) {
        list.contentY = Math.max(0, Math.min(list.contentHeight - list.height, list.contentY + delta))
    }
    function handleKey(event) {
        if (!opened) return false
        var count = Math.max(1, choices.length)
        if (event.key === Qt.Key_Escape) canceled()
        else if (event.key === Qt.Key_Right || event.key === Qt.Key_Tab) selectedIndex = (selectedIndex + 1) % count
        else if (event.key === Qt.Key_Left || event.key === Qt.Key_Backtab) selectedIndex = (selectedIndex + count - 1) % count
        else if (event.key === Qt.Key_Down) scrollBy(Commons.Style.space(40))
        else if (event.key === Qt.Key_Up) scrollBy(-Commons.Style.space(40))
        else if (event.key === Qt.Key_PageDown) scrollBy(list.height * 0.9)
        else if (event.key === Qt.Key_PageUp) scrollBy(-list.height * 0.9)
        else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) chosen(selectedIndex)
        else return false
        return true
    }

    visible: opened

    Rectangle {
        anchors.fill: parent
        color: Commons.Util.alpha(root.background, 0.7)
        MouseArea { anchors.fill: parent; onClicked: root.canceled() }

        Ui.BorderSurface {
            id: card
            readonly property real chrome: card.contentTopInset + card.contentBottomInset + Commons.Style.space(20) + Commons.Style.space(34)
            width: Math.min(parent.width - Commons.Style.space(32), Commons.Style.space(640))
            height: chrome + body.implicitHeight
            anchors.centerIn: parent
            color: root.background
            borderSpec: Commons.Border.flat(root.selectedText, Commons.Style.normalBorderWidth)
            padding: Commons.Style.space(18)
            radius: Commons.Style.cornerRadius

            MouseArea { anchors.fill: parent; onClicked: {} }

            Item {
                anchors.fill: parent
                anchors.topMargin: card.contentTopInset
                anchors.rightMargin: card.contentRightInset
                anchors.bottomMargin: card.contentBottomInset
                anchors.leftMargin: card.contentLeftInset

                Column {
                    id: body
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    spacing: Commons.Style.space(12)
                    Text {
                        id: question
                        objectName: "choice:message"
                        textFormat: Text.PlainText
                        width: parent.width
                        text: root.message
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Commons.Style.font.title
                        wrapMode: Text.WordWrap
                    }
                    Item {
                        width: parent.width
                        height: list.height
                        visible: root.entries.length > 0
                        Flickable {
                            id: list
                            objectName: "choice:list"
                            anchors.left: parent.left
                            anchors.right: parent.right
                            // The bar's gutter is always kept: wrapping must not
                            // depend on whether the bar shows.
                            anchors.rightMargin: Commons.Style.space(12)
                            // The card never grows past the screen: the rest scrolls.
                            height: Math.min(contentHeight, Math.max(Commons.Style.space(96),
                                root.height - Commons.Style.space(32) - card.chrome - question.implicitHeight - body.spacing))
                            contentHeight: rows.implicitHeight
                            clip: true
                            boundsBehavior: Flickable.StopAtBounds
                            interactive: contentHeight > height
                            Column {
                                id: rows
                                width: list.width
                                spacing: Commons.Style.space(10)
                                Repeater {
                                    model: root.entries
                                    Column {
                                        id: entry
                                        required property var modelData
                                        objectName: "choice:entry"
                                        width: rows.width
                                        spacing: Commons.Style.space(2)
                                        Text {
                                            objectName: "choice:title"
                                            textFormat: Text.PlainText
                                            width: parent.width
                                            text: String(entry.modelData.title || "")
                                            color: root.muted
                                            font.family: root.fontFamily
                                            font.pixelSize: Commons.Style.font.caption
                                            wrapMode: Text.WrapAnywhere
                                        }
                                        Text {
                                            objectName: "choice:text"
                                            textFormat: Text.PlainText
                                            width: parent.width
                                            text: String(entry.modelData.text || "")
                                            color: root.foreground
                                            font.family: "monospace"
                                            font.pixelSize: Commons.Style.font.caption
                                            wrapMode: Text.WrapAnywhere
                                        }
                                    }
                                }
                            }
                        }
                        Rectangle {
                            id: bar
                            objectName: "choice:scrollbar"
                            visible: list.contentHeight > list.height + 1
                            anchors.right: parent.right
                            width: Commons.Style.space(4)
                            radius: width / 2
                            y: list.visibleArea.yPosition * list.height
                            height: Math.max(Commons.Style.space(16), list.visibleArea.heightRatio * list.height)
                            color: Commons.Util.alpha(root.foreground, 0.38)
                        }
                    }
                }

                Row {
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    spacing: Commons.Style.space(10)

                    Repeater {
                        model: root.choices

                        Ui.BorderSurface {
                            id: choice
                            required property int index
                            required property var modelData

                            objectName: "choice:" + index
                            readonly property bool selected: root.selectedIndex === index
                            readonly property bool destructive: !!modelData.destructive

                            width: Math.max(Commons.Style.space(88), label.implicitWidth + Commons.Style.space(24))
                            height: Commons.Style.space(34)
                            color: selected
                                ? (destructive ? Commons.Util.alpha(Commons.Color.urgent, 0.22) : Commons.Util.alpha(root.foreground, 0.08))
                                : "transparent"
                            borderSpec: Commons.Border.flat(destructive
                                ? (selected ? Commons.Color.urgent : Commons.Util.alpha(Commons.Color.urgent, 0.56))
                                : (selected ? root.selectedText : Commons.Util.alpha(root.foreground, 0.38)), Commons.Style.normalBorderWidth)
                            radius: 0

                            Text {
                                id: label
                                textFormat: Text.PlainText
                                anchors.centerIn: parent
                                text: String(choice.modelData.text || "").slice(0, 64)
                                color: choice.destructive ? (choice.selected ? Commons.Color.urgent : root.foreground) : (choice.selected ? root.selectedText : root.foreground)
                                font.family: root.fontFamily
                                font.pixelSize: Commons.Style.font.caption
                            }

                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.selectedIndex = choice.index
                                onClicked: root.chosen(choice.index)
                            }
                        }
                    }
                }
            }
        }
    }
}
