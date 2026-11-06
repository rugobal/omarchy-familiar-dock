pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "ui" as Kit

// Which monitor the Position page edits, and whether edits go to all of
// them. With one monitor there is nothing to choose, and the group says so.
Kit.Group {
    id: root
    required property var strings
    required property var monitors
    required property string monitor
    required property bool allMonitors
    property var nav: null
    signal monitorSelected(string value)
    signal allMonitorsSelected(bool value)
    readonly property string groupName: Form.safe(strings.t("settings.group.monitors"))
    title: groupName
    Text {
        objectName: "monitor:single-note"
        textFormat: Text.PlainText
        width: parent.width
        wrapMode: Text.WordWrap
        visible: root.monitors.length <= 1
        // Counted as a row by the group, so a search or the changed view
        // empties it too.
        readonly property bool searchHidden: !visible || (!!root.nav && (root.nav.searching === true || root.nav.changedOnly === true))
        text: root.strings.t("settings.singleMonitorNote")
        color: Kit.Palette.muted
        font.family: Kit.Palette.fontFamily
        font.pixelSize: Commons.Style.font.caption
    }
    Kit.NavRow {
        id: pickerRow
        nav: root.nav
        visible: root.monitors.length > 1 && !searchHidden
        enabled: !root.allMonitors
        label: Form.safe(root.strings.t("settings.monitor"))
        groupTitle: root.groupName
        navBlocking: monitorPicker.popupOpen
        navKeys: [{key: "Space", label: "settings.key.open"}, {key: "←→", label: "settings.key.choose"}]
        implicitHeight: Math.max(pickerName.implicitHeight, monitorPicker.implicitHeight)
        onNavActivate: monitorPicker.open()
        onNavStep: function(delta) {
            var at = root.monitors.indexOf(root.monitor), next = Math.max(0, Math.min(root.monitors.length - 1, at + delta))
            if (next !== at) root.monitorSelected(root.monitors[next])
        }
        Text {
            id: pickerName
            textFormat: Text.PlainText
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * 0.5
            text: pickerRow.label
            color: Kit.Palette.foreground
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.subtitle
        }
        Ui.Dropdown {
            id: monitorPicker
            objectName: "monitor:selector"
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * 0.46
            showLabel: false
            label: pickerRow.label
            value: root.monitor
            options: root.monitors.map(function(m) { return {value:m,label:Form.safe(m)} })
            fontFamily: Kit.Palette.fontFamily
            hasCursor: pickerRow.cursorHere
            onChanged: function(value) {
                root.monitorSelected(value)
                monitorPicker.value = Qt.binding(function() { return root.monitor })
            }
            onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
        }
    }
    Kit.NavRow {
        id: allRow
        objectName: "monitor:apply-all"
        nav: root.nav
        visible: root.monitors.length > 1 && !searchHidden
        label: Form.safe(root.strings.t("settings.allMonitors"))
        description: Form.safe(root.strings.t("settings.allMonitorsHelp"))
        groupTitle: root.groupName
        navKeys: [{key: "Space", label: "settings.key.toggle"}]
        implicitHeight: Math.max(allText.implicitHeight, allSwitch.implicitHeight)
        onNavActivate: root.allMonitorsSelected(!root.allMonitors)
        Column {
            id: allText
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * 0.5
            spacing: Commons.Style.space(2)
            Text {
                textFormat: Text.PlainText
                width: parent.width; wrapMode: Text.WordWrap
                text: allRow.label
                color: Kit.Palette.foreground
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.subtitle
            }
            Text {
                textFormat: Text.PlainText
                width: parent.width; wrapMode: Text.WordWrap
                text: allRow.description
                color: Kit.Palette.muted
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.caption
            }
        }
        Ui.ToggleSwitch {
            id: allSwitch
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            checked: root.allMonitors
            cursorRing: false
            foreground: Kit.Palette.foreground
            accent: Kit.Palette.accent
            onToggled: root.allMonitorsSelected(!root.allMonitors)
        }
    }
}
