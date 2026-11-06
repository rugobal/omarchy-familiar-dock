pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import qs.Commons as Commons
import qs.Ui
import "../services/ClockLogic.js" as Logic
import "../services/ClockIpc.js" as ClockIpc

Item {
    id: root
    required property var panelWindow
    property bool vertical: false
    property int thickness: 45
    readonly property var host: panelWindow.host
    readonly property var widget: widgetLoader.status === Loader.Ready ? widgetLoader.item : null
    property var ipcHandler: null
    onWidgetChanged: if (!widget) ipcHandler = null
    readonly property string clockSource: Logic.source(!!widget, panelWindow.clockVisible)
    readonly property bool opened: !!widget && widget.opened
    readonly property var layoutEntry: Logic.findEntry(host.shell && host.shell.barConfig ? host.shell.barConfig.layout : {})
    readonly property var clockSettings: layoutEntry ? layoutEntry.entry : (host.clockStash ? host.clockStash.entry : {})
    property var popoutCard: null
    property var tooltipTarget: null
    property string tooltipText: ""
    onClockSettingsChanged: if (widget) widget.settings = clockSettings
    implicitWidth: widget ? widget.implicitWidth : fallback.implicitWidth
    implicitHeight: widget ? widget.implicitHeight : fallback.implicitHeight

    function close() { if (widget) widget.close() }
    function click(button) {
        if (!widget) {
            if (button === "middle") host.actions.run(["omarchy-menu-timezone"])
            return
        }
        if (button === "right") widget.cycleFormat()
        else if (button === "middle") api.run("omarchy-menu-timezone")
        else {
            const wasOpen = opened
            host.closePopups()
            if (!wasOpen) widget.open()
        }
    }
    function requestPopout(owner) {
        host.closePopups(root)
        if (api.activePopout && api.activePopout !== owner && api.activePopout.close) api.activePopout.close()
        api.activePopout = owner
    }
    // The scoped service facade cannot update another plugin's entry. While
    // removed, the stash is its source of truth; otherwise use the public CLI.
    QtObject {
        id: widgetShell
        function updateEntryInline(id, entry) {
            if (id !== "omarchy.clock") return false
            if (root.host.clockStash) root.host.updateClockSettings(entry)
            else {
                Object.keys(entry).forEach(function(key) {
                    if (key !== "id" && JSON.stringify(entry[key]) !== JSON.stringify(root.clockSettings[key]))
                        root.host.actions.run(["omarchy", "bar", "set", id, key, JSON.stringify(entry[key]), "--json"])
                })
            }
            return true
        }
    }
    PluginBarApi {
        id: api
        pluginId: "rugobal.familiar-dock"; moduleName: "omarchy.clock"
        shell: widgetShell
        foreground: Commons.Color.bar.text
        barForeground: Commons.Color.bar.text
        background: root.panelWindow.backgroundColor
        urgent: Commons.Color.bar.active
        fontFamily: Commons.Style.font.family
        position: root.panelWindow.edge.toLowerCase()
        vertical: root.vertical
        barSize: root.panelWindow.thickness
        _requestPopout: function(owner) { root.requestPopout(owner) }
        _releasePopout: function(owner) { if (api.activePopout === owner) api.activePopout = null }
        _notePopoutCard: function(card) { root.popoutCard = card }
        _popoutCardFor: function() { return root.popoutCard }
        _registerClickTarget: function(target) { if (api.clickTargets.indexOf(target) < 0) api.clickTargets = api.clickTargets.concat([target]) }
        _unregisterClickTarget: function(target) { api.clickTargets = api.clickTargets.filter(function(t) { return t !== target }) }
        _targetBelongsToWindow: function(target, window) { return !!target && target.QsWindow.window === window }
        _moduleWidgets: function(id) { return id === "omarchy.clock" ? root.host.clockWidgets() : [] }
        _showTooltip: function(target, text) { root.tooltipTarget = target; root.tooltipText = String(text).slice(0, 512) }
        _hideTooltip: function(target) { if (root.tooltipTarget === target) root.tooltipTarget = null }
        _setCenterHoverRevealSuppressed: function(value) { api._centerHoverRevealSuppressed = value }
        _run: function(command) { Commons.Util.execDetached(command) }
    }
    Loader {
        id: widgetLoader
        anchors.centerIn: parent
        // Intrinsic measurement must never depend on the allocated slot.
        width: item ? item.implicitWidth : 0
        height: item ? item.implicitHeight : 0
        active: root.panelWindow.clockVisible
        source: "file://" + (root.host.omarchyPath || Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy") + "/shell/plugins/panels/clock/BarWidget.qml"
        onLoaded: {
            // The installed widget hardcodes its ShellIpc target. Its completion
            // hook runs before Loader.onLoaded, so an initial registration warning
            // can precede this election; no duplicate remains enabled afterward.
            root.ipcHandler = ClockIpc.handler(item)
            if (root.ipcHandler) root.ipcHandler.enabled = false
            item.moduleName = "omarchy.clock"
            item.bar = api
            item.settings = root.clockSettings
            Qt.callLater(root.host.syncClockIpc)
        }
        onStatusChanged: if (status === Loader.Error) root.host.warnClockFallback()
    }
    Clock { id: fallback; anchors.fill: parent; panelWindow: root.panelWindow; vertical: root.vertical; thickness: root.thickness; visible: !root.widget }
    Tooltip { panelWindow: root.panelWindow; targetItem: root.tooltipTarget || root; text: root.tooltipText; edge: root.panelWindow.edge; hovered: !!root.tooltipTarget }
    Rectangle {
        readonly property int inset: Commons.Style.space(2)
        readonly property real extent: root.widget ? (root.vertical ? root.widget.openPanelIndicatorHeight : root.widget.openPanelIndicatorWidth) : 0
        visible: opacity > 0
        opacity: root.opened ? 0.9 : 0
        color: Commons.Color.accent
        radius: Math.min(width, height) / 2
        width: root.vertical ? Commons.Style.space(2) : extent
        height: root.vertical ? extent : Commons.Style.space(2)
        x: root.vertical ? (api.position === "left" ? root.width - width - inset : inset) : Math.floor((root.width - width) / 2)
        y: root.vertical ? Math.floor((root.height - height) / 2) : (api.position === "top" ? root.height - height - inset : inset)
        Behavior on opacity { NumberAnimation { duration: Commons.Style.duration(120); easing.type: Easing.OutCubic } }
    }
}
