pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "Looks.js" as Looks
import "../services/Config.js" as ConfigLogic
import "ui" as Kit

// The look: one choice that sets the panel's whole appearance (Looks.js).
// The chosen look is read from the settings, not stored, so a change on any
// page that leaves every look shows Custom here. Leaving Custom saves it, so
// picking Custom again brings it back.
Kit.NavRow {
    id: root
    objectName: "setting:look"
    required property var config
    required property var strings
    required property var monitors
    required property string primary
    readonly property string current: Looks.current(config.settings, monitors, primary)
    readonly property var options: Looks.choices(current, Looks.saved(config.settings)).map(function(id) {
        return {value: id, label: Form.safe(strings.t("settings.look." + id))}
    })
    label: Form.safe(strings.t("settings.label.look"))
    description: Form.safe(strings.t("settings.help.look"))
    navKeys: [{key: "←→", label: "settings.key.choose"}]
    // In the changed view, with any setting a look sets.
    changeKeys: Looks.keys
    enabled: config.valid && config.resetSnapshot === null && config.pendingOperation === "change"
    implicitHeight: Math.max(head.implicitHeight, group.implicitHeight)
    // Emitted before a pick, so an edit still waiting for its debounce
    // lands first instead of after (and over) the look.
    signal picking()
    function pick(id) {
        if (!enabled) return
        picking()
        // Plan against the file as it will be once queued writes land: a
        // switch made before the last one was read back still sees it.
        var removals = config.pendingRemovals || []
        var raw = config.pendingSettings !== null || removals.length
            ? ConfigLogic.withSettings(config.raw, config.pendingSettings || {}, removals) : config.raw
        var plan = Looks.plan(id, raw, ConfigLogic.validate(raw), monitors, primary)
        if (plan) config.setSettings(plan.changes, plan.removals)
    }
    function at() { return options.findIndex(function(o) { return o.value === root.current }) }
    onNavStep: function(delta) {
        var next = Math.max(0, Math.min(options.length - 1, at() + delta))
        if (next !== at()) pick(options[next].value)
    }
    onNavActivate: pick(options[(at() + 1) % options.length].value)

    Column {
        id: head
        width: Math.max(root.width * 0.3, root.width - group.width - Commons.Style.space(16))
        y: Math.max(0, (root.height - height) / 2)
        spacing: Commons.Style.space(2)
        Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.label
            wrapMode: Text.WordWrap
            color: Kit.Palette.foreground
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.subtitle
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: text.length > 0
            text: root.description
            wrapMode: Text.WordWrap
            color: Kit.Palette.muted
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
        }
    }
    Ui.ButtonGroup {
        id: group
        objectName: "look-choices"
        x: root.width - width
        y: Math.max(0, (root.height - height) / 2)
        options: root.options
        value: root.current
        focusable: false
        foreground: Kit.Palette.foreground
        background: Kit.Palette.background
        accent: Kit.Palette.accent
        fontFamily: Kit.Palette.fontFamily
        fontSize: Commons.Style.font.caption
        onChanged: function(value) { root.pick(value) }
    }
}
