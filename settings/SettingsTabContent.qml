pragma ComponentBehavior: Bound
import QtQuick

Loader {
    id: root
    required property bool opened
    required property string tab
    required property var host
    required property var config
    required property var strings
    required property var monitors
    required property string monitor
    required property string primary
    required property bool allMonitors
    property var nav: null
    signal resetRequested()
    active: opened
    // An inactive Loader retains its last height. One loader prevents an old
    // tab's empty space from pushing About below the viewport.
    height: item ? item.implicitHeight : 0
    sourceComponent: tab === "About" ? about : tab === "Overview" ? overview : form
    Component {
        id: about
        SettingsAbout {
            host: root.host; config: root.config; strings: root.strings
            nav: root.nav
            onResetRequested: root.resetRequested()
        }
    }
    Component {
        id: overview
        SettingsOverview {
            config: root.config; strings: root.strings
            monitors: root.monitors; monitor: root.monitor
            primary: root.primary; allMonitors: root.allMonitors
            nav: root.nav
        }
    }
    Component {
        id: form
        SettingsTab {
            tab: root.tab
            config: root.config; strings: root.strings
            monitors: root.monitors; monitor: root.monitor
            primary: root.primary; allMonitors: root.allMonitors
            nav: root.nav
        }
    }
}
