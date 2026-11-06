pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons as Commons
import "FormModel.js" as Form
import "ui" as Kit

// One page of settings: a band per group, each a heading and its rows. The
// group that shares the page's name is the page's own and goes untitled,
// straight under the page title.
Column {
    id: root
    required property string tab
    required property var config
    required property var strings
    required property var monitors
    required property string monitor
    required property string primary
    required property bool allMonitors
    property var nav: null
    spacing: Commons.Style.space(26)
    Repeater {
        model: Form.groups(root.tab)
        Kit.Group {
            id: group
            required property string modelData
            objectName: "settings-group:" + modelData
            readonly property string name: Form.safe(root.strings.t("settings.group." + modelData))
            title: modelData === root.tab ? "" : name
            note: modelData === "Intellihide" ? root.strings.t("settings.dwellNote")
                : modelData === "Hotkeys" ? root.strings.t("settings.hotkeyNote") : ""
            Repeater {
                model: Form.fields(root.tab, group.modelData, root.monitors.length)
                SettingField {
                    required property var modelData
                    field: modelData
                    nav: root.nav
                    groupTitle: group.name
                    config: root.config; strings: root.strings; monitors: root.monitors
                    monitor: root.monitor; primary: root.primary; allMonitors: root.allMonitors
                }
            }
        }
    }
}
