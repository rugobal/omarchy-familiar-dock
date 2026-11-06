pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons as Commons
import "FormModel.js" as Form
import "Nav.js" as Nav
import "ui" as Kit

// The page the window opens on: the look, then the switches flipped most,
// as tiles, then the panel's shape and the drawer icon. Each
// switch and row is the same setting as on its own page.
Column {
    id: root
    required property var config
    required property var strings
    required property var monitors
    required property string monitor
    required property string primary
    required property bool allMonitors
    property var nav: null
    readonly property bool editable: config.valid && config.resetSnapshot === null && config.pendingOperation === "change"
    spacing: Commons.Style.space(26)
    Kit.Group {
        LookField {
            nav: root.nav
            config: root.config; strings: root.strings
            monitors: root.monitors; primary: root.primary
            onPicking: {
                for (var i = 0; i < panelFields.count; i++)
                    if (panelFields.itemAt(i)) panelFields.itemAt(i).flush()
            }
        }
    }
    Kit.Group {
        Grid {
            id: grid
            width: parent.width
            columns: width >= Commons.Style.space(760) ? 4 : 2
            spacing: Commons.Style.space(10)
            Repeater {
                model: Nav.tiles
                Kit.Tile {
                    id: tile
                    required property var modelData
                    readonly property var field: Nav.field(modelData.key)
                    objectName: "tile:" + modelData.key
                    width: (grid.width - (grid.columns - 1) * grid.spacing) / grid.columns
                    nav: root.nav
                    glyph: modelData.icon
                    label: Form.safe(root.strings.t("settings.tile." + modelData.key))
                    description: Form.safe(root.strings.t(field.label))
                    note: root.strings.t(checked ? "settings.on" : "settings.off")
                    checked: !!root.config.settings[modelData.key]
                    changed: Form.changed(root.config.settings, field, "*", root.primary)
                    changeKeys: [modelData.key]
                    enabled: root.editable
                    navKeys: [{key: "Space", label: "settings.key.toggle"}]
                    onRequested: function(next) { if (root.editable) root.config.setSetting(tile.modelData.key, next) }
                    onResetRequested: if (root.editable) root.config.setSetting(tile.modelData.key, Form.defaultValue(tile.field, "*", root.primary))
                }
            }
        }
    }
    Kit.Group {
        id: panel
        objectName: "settings-group:Overview"
        title: Form.safe(root.strings.t("settings.overview.panel"))
        note: root.strings.t("settings.overview.panelNote")
        Repeater {
            id: panelFields
            model: Nav.overviewKeys.map(Nav.field)
            SettingField {
                required property var modelData
                field: modelData
                nav: root.nav
                groupTitle: panel.title
                config: root.config; strings: root.strings; monitors: root.monitors
                monitor: root.monitor; primary: root.primary; allMonitors: root.allMonitors
            }
        }
    }
    // The drawer: what its icon does, and the key that opens it.
    Kit.Group {
        id: drawer
        objectName: "settings-group:Overview-drawer"
        title: Form.safe(root.strings.t("settings.overview.drawer"))
        Repeater {
            model: Nav.overviewDrawerKeys.map(Nav.field)
            SettingField {
                required property var modelData
                field: modelData
                nav: root.nav
                groupTitle: drawer.title
                config: root.config; strings: root.strings; monitors: root.monitors
                monitor: root.monitor; primary: root.primary; allMonitors: root.allMonitors
            }
        }
    }
}
