pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "../services/DrawerClick.js" as Logic
import "../services/Chord.js" as Chord
import "FormModel.js" as Form
import "ui" as Kit

// What a click on the drawer icon does: the action, then the app, the
// keybinding or the command it uses, each a row of its own for the keyboard
// cursor, and a line saying what a click does now.
Column {
    id: root
    required property var strings
    property var nav: null
    property string groupTitle: ""
    property string fieldLabel: ""
    property var value: Logic.defaults
    // services/DrawerClick.qml and the shell's app library, or null (tests).
    property var service: null
    property var appLibrary: null
    property bool interactive: true
    signal edited(var value, bool debounce)
    signal finished()
    readonly property var current: Logic.normalize(value)
    spacing: Commons.Style.space(8)

    function set(field, next, debounce) {
        var changed = Object.assign({}, current)
        changed[field] = next
        edited(Logic.normalize(changed), !!debounce)
    }
    function t(key) { return root.strings.t(key) }
    readonly property var actionOptions: Logic.actions.map(function(a) { return {value: a, label: Form.safe(root.t("settings.drawerClick." + a))} })
    property var appOptions: []
    function loadApps() {
        var rows = appLibrary && appLibrary.sortedEntries ? appLibrary.sortedEntries("") : []
        appOptions = rows.slice(0, 2048).map(function(row) {
            var entry = row.entry || row
            return {value: String(entry.id), label: Form.safe(entry.name || entry.id)}
        })
    }
    readonly property var keyOptions: service ? service.choices.map(function(c) { return {value: c.value, label: Form.safe(c.label), description: Form.safe(c.description)} }) : []
    function appName(id) {
        var ids = Logic.appIds(id)
        var found = appOptions.filter(function(o) { return ids.indexOf(o.value) >= 0 })[0]
        return found ? found.label : ""
    }
    Component.onCompleted: { loadApps(); if (service) service.refresh() }

    // What a click does now, and whether that is not what was asked.
    readonly property var report: {
        var c = current, plan = Logic.plan(c), keys = Chord.caps(c.keybinding).join("+")
        if (c.action === "drawer") return {key: "", warning: false}
        if (plan.unset) return {key: "settings.drawerClick.unset." + c.action, warning: false}
        if (c.action === "app") {
            var name = appName(c.app)
            if (name) return {key: "settings.drawerClick.opensApp", text: root.t("settings.drawerClick.opensApp").replace("%1", name), warning: false}
            return {key: appOptions.length ? "settings.drawerClick.appGone" : "", warning: true}
        }
        if (c.action === "keybinding") {
            if (!service) return {key: "", warning: false}
            if (service.failure) return {key: "settings.drawerClick.failed", text: root.t("settings.drawerClick.failed").replace("%1", service.failure), warning: true}
            if (!service.listed) return {key: "", warning: false}
            var does = Logic.naming(service.choices, c.keybinding)
            if (does) return {key: "settings.drawerClick.follows", text: root.t("settings.drawerClick.follows").replace("%1", keys).replace("%2", does), warning: false}
            // Bound, but with no description to name it by.
            if (service.runs && service.runs(c.keybinding)) return {key: "settings.drawerClick.followsUnnamed", text: root.t("settings.drawerClick.followsUnnamed").replace("%1", keys), warning: false}
            return {key: "settings.drawerClick.nothing", text: root.t("settings.drawerClick.nothing").replace("%1", keys), warning: true}
        }
        return {key: "settings.drawerClick.runs", warning: false}
    }

    // The rows' names on the left, as SettingField's own sub-rows have them.
    component Name: Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        color: Kit.Palette.foreground
        font.family: Kit.Palette.fontFamily
        font.pixelSize: Commons.Style.font.body
    }

    Kit.NavRow {
        id: actionRow
        objectName: "drawer-click:action"
        nav: root.nav
        label: Form.safe(root.t("settings.drawerClick.does"))
        description: root.fieldLabel
        groupTitle: root.groupTitle
        enabled: root.interactive
        navKeys: [{key: "Space", label: "settings.key.open"}, {key: "←→", label: "settings.key.choose"}]
        navBlocking: actionList.popupOpen
        implicitHeight: Math.max(actionName.implicitHeight, actionList.implicitHeight)
        onNavActivate: actionList.open()
        onNavStep: function(delta) {
            var at = Logic.actions.indexOf(root.current.action)
            var next = Math.max(0, Math.min(Logic.actions.length - 1, at + delta))
            if (next !== at) root.set("action", Logic.actions[next])
        }
        Name { id: actionName; text: actionRow.label }
        Ui.Dropdown {
            id: actionList
            objectName: "drawer-click:actions"
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: root.width * 0.46
            showLabel: false
            value: root.current.action
            options: root.actionOptions
            fontFamily: Kit.Palette.fontFamily
            hasCursor: actionRow.cursorHere
            onChanged: function(next) {
                root.set("action", next)
                actionList.value = Qt.binding(function() { return root.current.action })
            }
            onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
        }
    }
    // Only the row the action uses exists, so the cursor never lands on another.
    Loader {
        width: root.width
        active: root.current.action !== "drawer"
        sourceComponent: root.current.action === "app" ? appRow : root.current.action === "keybinding" ? keyRow : commandRow
    }
    Text {
        objectName: "drawer-click:status"
        textFormat: Text.PlainText
        width: root.width
        visible: text.length > 0
        horizontalAlignment: Text.AlignRight
        text: Form.safe(root.report.text || (root.report.key ? root.t(root.report.key) : ""))
        wrapMode: Text.WordWrap
        color: root.report.warning ? Kit.Palette.urgent : Kit.Palette.muted
        font.family: Kit.Palette.fontFamily
        font.pixelSize: Commons.Style.font.caption
    }

    Component {
        id: appRow
        Kit.NavRow {
            id: row
            objectName: "drawer-click:app"
            nav: root.nav
            label: Form.safe(root.t("settings.drawerClick.appRow"))
            description: root.fieldLabel
            groupTitle: root.groupTitle
            enabled: root.interactive
            navKeys: [{key: "↵", label: "settings.key.open"}]
            navBlocking: apps.popupOpen
            implicitHeight: Math.max(appName.implicitHeight, apps.implicitHeight)
            onNavActivate: { root.loadApps(); apps.open() }
            Name { id: appName; text: row.label }
            Ui.SearchableDropdown {
                id: apps
                objectName: "drawer-click:apps"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: root.width * 0.46
                showLabel: false
                value: root.current.app
                options: root.appOptions
                triggerLabel: root.t("settings.drawerClick.pickApp")
                fontFamily: Kit.Palette.fontFamily
                hasCursor: row.cursorHere
                onChanged: function(next) {
                    root.set("app", next)
                    apps.value = Qt.binding(function() { return root.current.app })
                }
                onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
            }
        }
    }
    Component {
        id: keyRow
        Kit.NavRow {
            id: row
            objectName: "drawer-click:keybinding"
            nav: root.nav
            label: Form.safe(root.t("settings.drawerClick.keybindingRow"))
            description: root.fieldLabel
            groupTitle: root.groupTitle
            enabled: root.interactive
            navKeys: [{key: "↵", label: "settings.key.open"}]
            navBlocking: keys.popupOpen
            implicitHeight: Math.max(keyName.implicitHeight, keys.implicitHeight)
            onNavActivate: { if (root.service) root.service.refresh(); keys.open() }
            // The keys as they are now, each time the row appears.
            Component.onCompleted: if (root.service) root.service.refresh()
            Name { id: keyName; text: row.label }
            Ui.SearchableDropdown {
                id: keys
                objectName: "drawer-click:keybindings"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: root.width * 0.46
                showLabel: false
                // A key no longer bound still shows, by its keys.
                value: root.current.keybinding
                options: root.keyOptions
                triggerLabel: root.current.keybinding ? Chord.caps(root.current.keybinding).join("+") : root.t("settings.drawerClick.pickKeybinding")
                fontFamily: Kit.Palette.fontFamily
                hasCursor: row.cursorHere
                onChanged: function(next) {
                    root.set("keybinding", next)
                    keys.value = Qt.binding(function() { return root.current.keybinding })
                }
                onPopupOpenChanged: if (!popupOpen && root.nav) root.nav.navTakeFocus()
            }
        }
    }
    Component {
        id: commandRow
        Kit.NavRow {
            id: row
            objectName: "drawer-click:command"
            nav: root.nav
            label: Form.safe(root.t("settings.drawerClick.commandRow"))
            description: root.fieldLabel
            groupTitle: root.groupTitle
            enabled: root.interactive
            navKeys: [{key: "↵", label: "settings.key.edit"}]
            implicitHeight: Math.max(commandName.implicitHeight, input.implicitHeight)
            onNavActivate: { input.forceActiveFocus(); input.selectAll() }
            Name { id: commandName; text: row.label }
            Ui.TextField {
                id: input
                objectName: "drawer-click:input"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: root.width * 0.46
                text: root.current.command
                placeholderText: root.t("settings.drawerClick.commandHint")
                maximumLength: 4096
                selectByMouse: true
                foreground: Kit.Palette.foreground
                accent: Kit.Palette.accent
                font.family: Kit.Palette.fontFamily
                hasCursor: row.cursorHere
                onTextEdited: root.set("command", text, true)
                onEditingFinished: root.finished()
            }
        }
    }
}
