pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "MenuList.js" as Menus
import "../services/Config.js" as ConfigLogic
import "ui" as Kit

// One setting: its name and what it does on the left, the control on the
// right. Editors too wide for that (layout, menus, animation, pins) sit
// under the name across the row, and their parts are rows of their own.
Kit.NavRow {
    id: root
    objectName: "setting:" + field.key
    required property var field
    required property var config
    required property var strings
    required property var monitors
    required property string monitor
    required property string primary
    required property bool allMonitors
    readonly property string target: allMonitors ? "*" : monitor
    readonly property var current: Form.value(config.settings, field, target, primary)
    property string errorKey: ""
    property var pending: null
    property bool dirty: false
    property var pendingTarget: ({})
    readonly property bool layoutBlocked: field.key === "panel-element-positions" && !allMonitors && config.get("panel-element-positions-monitors-sync")
    readonly property var limits: Form.range(field.key)
    readonly property bool choice: Form.choice(field, strings)
    readonly property bool stacked: ["LayoutEditor", "ListEditor", "AnimationEditor", "Pins", "DrawerClick"].indexOf(field.type) >= 0
    readonly property bool listed: field.type === "Dropdown" || field.type === "Monitor"
    readonly property var options: field.type === "Monitor" ? monitorOptions()
        : field.options.map(function(v) { return {value: v, label: Form.safe(strings.t("settings.option." + v))} })
    label: Form.safe(strings.t(field.label))
    description: Form.helpText(strings, field)
    changed: Form.changed(config.settings, field, target, primary)
    changeKeys: [field.key]
    navigable: !stacked
    navBlocking: !!control.item && control.item.popupOpen === true
    navKeys: {
        switch (field.type) {
        case "Toggle": return [{key: "Space", label: "settings.key.toggle"}]
        case "Dropdown": case "Monitor":
            return choice ? [{key: "←→", label: "settings.key.choose"}]
                : [{key: "Space", label: "settings.key.open"}, {key: "←→", label: "settings.key.choose"}]
        case "NumberField": case "MonitorNumber": return [{key: "←→", label: "settings.key.adjust"}, {key: "↵", label: "settings.key.type"}]
        case "PanelSlider": return [{key: "←→", label: "settings.key.adjust"}]
        case "Hotkey": return [{key: "↵", label: "settings.key.record"}]
        default: return [{key: "↵", label: "settings.key.edit"}]
        }
    }
    enabled: config.valid && config.resetSnapshot === null && config.pendingOperation === "change"
    implicitHeight: stacked ? head.implicitHeight + Commons.Style.space(10) + holder.implicitHeight
        : Math.max(head.implicitHeight, holder.implicitHeight)
    onNavActivate: activate()
    onNavStep: function(delta) { step(delta) }
    onResetRequested: reset()

    // An edit still waiting for its debounce belongs to the monitor it was
    // made for: changing the target writes it there first, so the next edit
    // starts from the new monitor's own value.
    onTargetChanged: flush()
    function commit(value, debounce) {
        // A synchronized layout is not this monitor's to change.
        if (layoutBlocked) return
        if (dirty && (pendingTarget.monitor !== monitor || pendingTarget.all !== allMonitors)) flush()
        // QML var signals can wrap arrays as QVariantList. Restore plain data
        // at this boundary before applying the same strict value validation.
        value = ConfigLogic.clone(value)
        if (!Form.validValue(field, value)) { errorKey = "settings.invalidValue"; dirty = false; return }
        errorKey = ""; pending = value; dirty = true
        pendingTarget = {monitor: monitor, all: allMonitors}
        if (debounce) delay.restart()
        else flush()
    }
    function flush() {
        delay.stop()
        if (!dirty || !enabled) return
        dirty = false
        if (field.type === "ListEditor") config.setSettings(Menus.changes(field.key, pending))
        else config.setSetting(field.key, Form.change(config.raw, field, pending, pendingTarget.monitor, pendingTarget.all))
    }
    function commitRows(rows) {
        rows = ConfigLogic.clone(rows)
        if (!Menus.valid(rows, field.key)) { errorKey = "settings.invalidValue"; dirty = false; delay.stop(); return }
        errorKey = ""; pending = rows; dirty = true; delay.restart()
    }
    // Closing a tab/window still applies a valid final keystroke. Opening never
    // sets dirty, so binding updates and external edits cannot create writes.
    Component.onDestruction: flush()
    Timer { id: delay; interval: 200; onTriggered: root.flush() }
    function edit(text) {
        try { commit(Form.parseInput(field, text), true) }
        catch (error) { errorKey = "settings.invalidValue"; dirty = false; delay.stop() }
    }
    // Back to what the field is worth with no settings file.
    function reset() {
        if (!enabled || layoutBlocked) return
        var value = Form.defaultValue(field, target, primary)
        delay.stop(); dirty = false; errorKey = ""
        if (field.type === "ListEditor") config.setSettings(Menus.changes(field.key, value))
        else commit(value, false)
    }
    function monitorOptions() {
        var names = monitors.slice()
        if (current && names.indexOf(current) < 0) names.push(current)
        return [{value: "", label: Form.safe(strings.t("settings.automatic"))}].concat(names.map(function(name) { return {value: name, label: Form.safe(name)} }))
    }
    // Space or Enter does what a click on the control would.
    function activate() {
        if (!enabled) return
        switch (field.type) {
        case "Toggle": commit(!current, false); break
        case "Dropdown": case "Monitor":
            if (choice) {
                var at = options.findIndex(function(o) { return String(o.value) === String(current) })
                commit(options[(at + 1) % options.length].value, false)
            } else if (control.item) control.item.open()
            break
        case "NumberField": case "MonitorNumber": case "TextField": case "ColorField":
            if (control.item) control.item.focusInput()
            break
        case "Hotkey":
            if (control.item) control.item.record()
            break
        }
    }
    // Left and Right walk a value: the next choice, a step of a number.
    function step(delta) {
        if (!enabled) return
        var value = dirty ? pending : current
        switch (field.type) {
        case "Dropdown": case "Monitor":
            var at = options.findIndex(function(o) { return String(o.value) === String(value) })
            var next = Math.max(0, Math.min(options.length - 1, at + delta))
            if (next !== at) commit(options[next].value, false)
            break
        case "NumberField": case "MonitorNumber":
            var n = Number(value), size = limits[1] - limits[0] >= 500 ? 10 : 1
            var wanted = Math.max(limits[0], Math.min(limits[1], n + delta * size))
            // Length is -1 (dynamic) or 20-100: step across the gap.
            if (field.key === "panel-lengths") wanted = delta > 0 ? (n < 20 ? 20 : wanted) : (n <= 20 ? -1 : wanted)
            if (wanted !== n) commit(wanted, true)
            break
        case "PanelSlider":
            var s = Math.round(Math.max(limits[0], Math.min(limits[1], Number(value) + delta * 0.05)) * 100) / 100
            if (s !== Number(value)) commit(s, true)
            break
        }
    }

    Column {
        id: head
        width: root.stacked ? root.width : root.width * 0.5
        y: root.stacked ? 0 : Math.max(0, (root.height - height) / 2)
        spacing: Commons.Style.space(2)
        // A changed setting says so on its own title line: the mark ahead
        // of the name, the way back after it.
        Row {
            width: parent.width
            spacing: Commons.Style.space(6)
            Text {
                id: mark
                textFormat: Text.PlainText
                anchors.baseline: title.baseline
                visible: root.changed
                text: "●"
                color: Kit.Palette.accent
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.caption
            }
            Text {
                id: title
                textFormat: Text.PlainText
                width: Math.min(implicitWidth, parent.width - (root.changed ? mark.width + resetLink.width + parent.spacing * 2 : 0))
                text: root.label
                wrapMode: Text.WordWrap
                color: Kit.Palette.foreground
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.subtitle
            }
            Text {
                id: resetLink
                objectName: "reset:" + root.field.key
                textFormat: Text.PlainText
                anchors.baseline: title.baseline
                visible: root.changed && !root.layoutBlocked
                text: root.strings.t("settings.resetOne")
                color: resetMouse.containsMouse ? Kit.Palette.accent : Kit.Palette.muted
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.caption
                font.underline: resetMouse.containsMouse
                MouseArea {
                    id: resetMouse
                    anchors.fill: parent
                    anchors.margins: -Commons.Style.space(4)
                    enabled: root.enabled
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.reset()
                }
            }
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: text.length > 0
            text: root.layoutBlocked ? root.strings.t("settings.layoutSyncNote") : root.description
            wrapMode: Text.WordWrap
            color: Kit.Palette.muted
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
        }
        Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: root.errorKey.length > 0
            text: root.errorKey ? root.strings.t(root.errorKey) : ""
            wrapMode: Text.WordWrap
            color: Kit.Palette.urgent
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
        }
    }
    Item {
        id: holder
        x: root.stacked ? 0 : root.width - width
        y: root.stacked ? head.height + Commons.Style.space(10) : Math.max(0, (root.height - height) / 2)
        width: root.stacked ? root.width : root.width * 0.46
        implicitHeight: control.implicitHeight
        height: implicitHeight
        // Sized by what it loads, so a switch keeps its width at the right
        // edge while a list or a field takes the holder's.
        Loader {
            id: control
            x: holder.width - width
            enabled: !root.layoutBlocked
            sourceComponent: {
                switch (root.field.type) {
                case "Toggle": return toggle
                case "Dropdown": case "Monitor": return root.choice ? segments : dropdown
                case "NumberField": case "MonitorNumber": return number
                case "PanelSlider": return slider
                case "LayoutEditor": return layout
                case "ListEditor": return menuList
                case "AnimationEditor": return animation
                case "Pins": return pins
                case "Hotkey": return hotkey
                case "DrawerClick": return drawerClick
                default: return textInput
                }
            }
        }
    }
    Component {
        id: toggle
        Ui.ToggleSwitch {
            checked: !!root.current
            cursorRing: false
            interactive: root.enabled
            foreground: Kit.Palette.foreground
            accent: Kit.Palette.accent
            onToggled: root.commit(!root.current, false)
        }
    }
    Component {
        id: segments
        Ui.ButtonGroup {
            options: root.options
            value: String(root.current)
            focusable: false
            foreground: Kit.Palette.foreground
            background: Kit.Palette.background
            accent: Kit.Palette.accent
            fontFamily: Kit.Palette.fontFamily
            fontSize: Commons.Style.font.caption
            onChanged: function(value) { root.commit(value, false) }
        }
    }
    Component {
        id: dropdown
        Ui.Dropdown {
            id: selection
            width: holder.width
            showLabel: false
            value: String(root.current)
            options: root.options
            fontFamily: Kit.Palette.fontFamily
            hasCursor: root.cursorHere
            // Dropdown assigns its own value on selection. Restore the live
            // binding so subsequent file edits/monitor changes still appear.
            onChanged: function(value) {
                root.commit(value, false)
                selection.value = Qt.binding(function() { return String(root.current) })
            }
            // A closed list hands the keys back to the cursor.
            onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
        }
    }
    Component {
        id: number
        Ui.NumberField {
            id: spin
            value: Number(root.dirty ? root.pending : root.current)
            from: root.limits[0]; to: root.limits[1]
            fieldWidth: Math.min(holder.width, Commons.Style.space(140))
            hasCursor: root.cursorHere
            field.locale: Qt.locale(Commons.I18n.formatLocale)
            foreground: Kit.Palette.foreground
            accent: Kit.Palette.accent
            fontFamily: Kit.Palette.fontFamily
            onModified: function(value) { root.commit(value, true) }
            function focusInput() { spin.field.forceActiveFocus(); if (spin.field.contentItem.selectAll) spin.field.contentItem.selectAll() }
        }
    }
    Component {
        id: slider
        Row {
            width: holder.width
            spacing: Commons.Style.space(10)
            Ui.PanelSlider {
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - readout.width - parent.spacing
                minimum: root.limits[0]; maximum: root.limits[1]
                step: 0.01; value: Number(root.dirty ? root.pending : root.current)
                trackColor: Kit.Palette.shade(0.16)
                fillColor: Kit.Palette.accent; knobColor: Kit.Palette.foreground
                onMoved: function(value) { root.commit(value, true) }
            }
            Text {
                id: readout
                textFormat: Text.PlainText
                anchors.verticalCenter: parent.verticalCenter
                width: Commons.Style.space(44)
                horizontalAlignment: Text.AlignRight
                text: Commons.I18n.formatNumber(root.dirty ? root.pending : Number(root.current), 2)
                color: Kit.Palette.muted
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.caption
            }
        }
    }
    Component {
        id: textInput
        Row {
            width: holder.width
            spacing: Commons.Style.space(8)
            function focusInput() { input.forceActiveFocus(); input.selectAll() }
            Ui.TextField {
                id: input
                width: parent.width - (swatch.visible ? swatch.width + parent.spacing : 0)
                text: String(root.current)
                maximumLength: 4096
                selectByMouse: true
                foreground: Kit.Palette.foreground
                accent: Kit.Palette.accent
                font.family: Kit.Palette.fontFamily
                hasCursor: root.cursorHere
                onTextEdited: root.edit(text)
                onEditingFinished: root.flush()
            }
            Rectangle {
                id: swatch
                visible: root.field.type === "ColorField"
                anchors.verticalCenter: parent.verticalCenter
                width: Commons.Style.space(26); height: width
                radius: width / 2
                border.width: Commons.Style.spacing.hairline
                border.color: Kit.Palette.hairline
                color: {
                    var c = ConfigLogic.parseColor(input.text)
                    return c ? Qt.rgba(c[0],c[1],c[2],c[3]) : "transparent"
                }
            }
        }
    }
    Component {
        id: hotkey
        HotkeyField {
            objectName: "hotkey:" + root.field.key
            width: holder.width
            strings: root.strings
            value: String(root.current)
            defaultValue: String(Form.defaultValue(root.field, root.target, root.primary))
            service: root.nav && root.nav.host ? root.nav.host.appsKeyService || null : null
            interactive: root.enabled
            onPicked: function(chord) { root.commit(chord, false) }
            // The keys go back to the window's cursor.
            onFinished: if (root.nav) root.nav.navTakeFocus()
        }
    }
    Component {
        id: drawerClick
        DrawerClickField {
            objectName: "drawer-click:" + root.field.key
            width: holder.width
            nav: root.nav
            groupTitle: root.groupTitle
            fieldLabel: root.label
            strings: root.strings
            value: root.dirty ? root.pending : root.current
            service: root.nav && root.nav.host ? root.nav.host.drawerClickService || null : null
            appLibrary: root.nav && root.nav.host ? root.nav.host.appLibrary || null : null
            interactive: root.enabled
            onEdited: function(value, debounce) { root.commit(value, debounce) }
            onFinished: root.flush()
        }
    }
    Component {
        id: menuList
        MenuListEditor {
            objectName: "menu-editor:" + root.field.key
            width: holder.width
            nav: root.nav
            groupTitle: root.groupTitle
            fieldLabel: root.label
            value: Menus.rows(root.config.settings, root.field.key)
            titleMaximumLength: root.field.key === "context-menu-entries" ? 256 : 4096
            strings: root.strings
            acceptReloads: root.config.pendingSettings === null
            onEdited: function(rows) { root.commitRows(rows) }
        }
    }
    Component {
        id: layout
        ElementEditor {
            objectName: "element-editor"
            width: holder.width
            nav: root.nav
            groupTitle: root.groupTitle
            fieldLabel: root.label
            value: root.current
            strings: root.strings
            onEdited: function(value) { root.commit(value, false) }
        }
    }
    Component {
        id: animation
        Column {
            width: holder.width
            spacing: Commons.Style.space(8)
            Repeater {
                model: ["SIMPLE", "RIPPLE", "PLANK"]
                Kit.NavRow {
                    id: mode
                    required property string modelData
                    objectName: "animation:" + root.field.key + ":" + modelData
                    nav: root.nav
                    label: Form.safe(root.strings.t("settings.option." + modelData))
                    description: root.label
                    groupTitle: root.groupTitle
                    enabled: root.enabled
                    navKeys: [{key: "←→", label: "settings.key.adjust"}, {key: "↵", label: "settings.key.type"}]
                    implicitHeight: Math.max(modeName.implicitHeight, amount.implicitHeight)
                    // Percent units preserve fractional animation tuning with
                    // Omarchy's integer NumberField (duration/rotation use 1).
                    readonly property int factor: /duration|rotation/.test(root.field.key) ? 1 : 100
                    readonly property var values: root.dirty ? root.pending : root.current
                    function set(value) {
                        var next = Object.assign({}, mode.values)
                        next[mode.modelData] = value / mode.factor
                        root.commit(next, true)
                    }
                    onNavStep: function(delta) {
                        var n = Math.round(Number(mode.values[mode.modelData] || 0) * mode.factor) + delta * (/duration/.test(root.field.key) ? 10 : 1)
                        mode.set(Math.max(amount.from, Math.min(amount.to, n)))
                    }
                    onNavActivate: amount.field.forceActiveFocus()
                    Text {
                        id: modeName
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        text: mode.label
                        color: Kit.Palette.foreground
                        font.family: Kit.Palette.fontFamily
                        font.pixelSize: Commons.Style.font.body
                    }
                    Ui.NumberField {
                        id: amount
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        from: /rotation/.test(root.field.key) ? -180 : 0
                        to: /duration/.test(root.field.key) ? 300 : /rotation/.test(root.field.key) ? 180 : 1000
                        value: Math.round(Number(mode.values[mode.modelData] || 0) * mode.factor)
                        fieldWidth: Math.min(root.width * 0.46, Commons.Style.space(140))
                        field.locale: Qt.locale(Commons.I18n.formatLocale)
                        foreground: Kit.Palette.foreground
                        accent: Kit.Palette.accent
                        fontFamily: Kit.Palette.fontFamily
                        onModified: function(value) { mode.set(value) }
                    }
                }
            }
            Text {
                textFormat: Text.PlainText
                width: parent.width; wrapMode: Text.WordWrap
                text: root.strings.t("settings.animationUnits")
                color: Kit.Palette.muted
                font.family: Kit.Palette.fontFamily; font.pixelSize: Commons.Style.font.caption
            }
        }
    }
    Component {
        id: pins
        Flow {
            width: holder.width
            spacing: Commons.Style.space(6)
            Repeater {
                model: root.config.get("favorites").slice(0, 64)
                Rectangle {
                    required property var modelData
                    implicitWidth: pinName.implicitWidth + Commons.Style.space(18)
                    implicitHeight: Commons.Style.space(22)
                    width: Math.min(implicitWidth, holder.width)
                    height: implicitHeight
                    radius: Kit.Palette.pillRadius
                    color: Kit.Palette.shade(0.08)
                    Text {
                        id: pinName
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        width: Math.min(implicitWidth, holder.width - Commons.Style.space(18))
                        elide: Text.ElideMiddle
                        text: String(parent.modelData).slice(0, 256)
                        color: Kit.Palette.foreground
                        font.family: Kit.Palette.fontFamily
                        font.pixelSize: Commons.Style.font.caption
                    }
                }
            }
        }
    }
}
