pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons as Commons
import "Layout.js" as Geometry
import "Hover.js" as HoverLogic
import "MenuModel.js" as Menus
import "ScrollLogic.js" as ScrollLogic
import "../services/WindowFader.js" as FadeLogic
import "../services/Config.js" as ConfigLogic
import "../services" as Services
import "../services/Hotkeys.js" as Hotkeys
import "../services/Proximity.js" as Proximity

PanelWindow {
    id: root
    required property var host
    required property var fader
    required property var config
    required property var appModel
    required property var actions
    required property var strings
    required property string primaryMonitor
    required property int panelCount
    readonly property var monitor: Hyprland.monitorFor(screen)
    readonly property string monitorName: monitor ? monitor.name : (screen ? screen.name : "")
    readonly property int workspaceId: monitor && monitor.activeWorkspace ? monitor.activeWorkspace.id : -1
    readonly property bool isPrimary: monitorName === primaryMonitor
    function setting(key) { return config.perMonitor(key, monitorName, primaryMonitor) }
    readonly property string edge: setting("panel-positions")
    readonly property bool vertical: edge === "LEFT" || edge === "RIGHT"
    readonly property int thickness: setting("panel-sizes")
    readonly property real percent: setting("panel-lengths")
    readonly property string alignment: setting("panel-anchors")
    readonly property var elements: setting("panel-element-positions")
    readonly property int alongPadding: config.get(vertical ? "panel-top-bottom-padding" : "panel-side-padding")
    readonly property int acrossPadding: Math.min(Math.floor((thickness - 4) / 2), config.get(vertical ? "panel-side-padding" : "panel-top-bottom-padding"))
    readonly property int innerThickness: Math.max(4, thickness - acrossPadding * 2)
    readonly property var naturalSizes: ({showAppsButton: vertical ? apps.implicitHeight : apps.implicitWidth,
        taskbar: tasks.naturalLength, dateMenu: vertical ? clock.implicitHeight : clock.implicitWidth,
        desktopButton: config.get("showdesktop-button-width"), rightBox: tray.item ? tray.item.naturalLength : 0})
    readonly property real naturalLength: Geometry.naturalLength(elements, naturalSizes) + alongPadding * 2
    readonly property real length: Geometry.panelLength(screen ? (vertical ? screen.height : screen.width) : 1,
        percent, naturalLength, config.get(vertical ? "panel-top-bottom-margins" : "panel-side-margins"))
    readonly property var longMargins: Geometry.lengthMargins(screen ? (vertical ? screen.height : screen.width) : 1,
        length, config.get(vertical ? "panel-top-bottom-margins" : "panel-side-margins"), alignment)
    readonly property real contentLength: Math.max(0, length - alongPadding * 2)
    readonly property var allocation: Geometry.allocate(elements, naturalSizes, contentLength, percent === -1 ? alignment : "")
    function placement(id) { return allocation[id] || {start: 0, length: 0} }
    function shown(id) { return allocation[id] !== undefined && allocation[id].length > 0 }
    readonly property bool underFullscreen: Geometry.fullscreenOn(Hyprland.toplevels.values, workspaceId)
    readonly property bool themeMode: !config.get("trans-use-custom-bg")
    readonly property color backgroundColor: themeMode ? host.themeBackground.color : cssColor("trans-bg-color")
    readonly property string backgroundHex: "#" + [backgroundColor.r, backgroundColor.g, backgroundColor.b].map(function(c) { return Math.round(c * 255).toString(16).padStart(2, "0") }).join("")

    readonly property real hoverReserve: config.get("animate-appicon-hover") ? Math.min(512, thickness * 3) : 0
    // How far a hovered icon reaches past the panel's face, so Settings,
    // open over the desktop, leaves it in plain sight.
    readonly property real hoverClearance: HoverLogic.clearance(config.settings, innerThickness,
        Geometry.iconGeometry(innerThickness, config.get("appicon-margin"), config.get("appicon-padding")).icon, innerThickness)
    // Where the panel takes the pointer now, in its layer window: its face,
    // as far as it lies inside the window (mid-slide it can reach past it);
    // null while it takes none. Settings leaves exactly this open.
    readonly property var inputArea: !visible || fullscreenBlocked || !hide.shown ? null
        : Proximity.clip({x: surface.x, y: surface.y, width: surface.width, height: surface.height}, width, height)
    readonly property var monitorRect: ({x: screen ? screen.x : 0, y: screen ? screen.y : 0,
        width: screen ? screen.width : 1, height: screen ? screen.height : 1})
    readonly property var panelRect: Proximity.panelRect(monitorRect, edge, length, longMargins.start, thickness,
        config.get(vertical ? "panel-side-margins" : "panel-top-bottom-margins"))
    // macOS-style Plank: Show Apps, when it touches the taskbar, joins the
    // magnified row (the taskbar lays it out, see Taskbar.dock). The pointer
    // is read from the whole panel in window coordinates, which never move,
    // so the panel widening under it can't feed back into the layout.
    readonly property bool dockMode: HoverLogic.macos(config.settings)
    // Only a panel that fits its icons widens with them.
    readonly property bool dockFits: dockMode && percent === -1
    readonly property var dockShowApps: {
        if (!dockMode || !shown("showAppsButton") || !shown("taskbar")) return null
        var a = placement("showAppsButton"), t = placement("taskbar")
        var row = {start: a.start, size: a.length, icon: apps.iconSize}
        if (Math.abs(a.start + a.length - t.start) < 1) return Object.assign(row, {side: "before"})
        if (Math.abs(t.start + t.length - a.start) < 1) return Object.assign(row, {side: "after"})
        return null
    }
    // Along the panel, in the coordinates of `content`.
    readonly property var dockPointer: dockMode && panelHover.hovered && !tasks.dragging
        ? (vertical ? panelHover.point.scenePosition.y : panelHover.point.scenePosition.x) - longMargins.start - alongPadding : null
    readonly property int dockAppsIndex: !dockShowApps ? -1 : dockShowApps.side === "before" ? 0 : tasks.dock.level.length - 1
    readonly property int dockMotion: HoverLogic.duration(config.settings)
    // How far the row reaches past its rest ends, gliding with the icons.
    property real dockBefore: dockFits ? tasks.dock.before : 0
    property real dockAfter: dockFits ? tasks.dock.after : 0
    property real appsShift: dockAppsIndex >= 0 ? tasks.dock.shift[dockAppsIndex] || 0 : 0
    Behavior on dockBefore { NumberAnimation { duration: Commons.Style.duration(root.dockMotion); easing.type: Easing.OutCubic } }
    Behavior on dockAfter { NumberAnimation { duration: Commons.Style.duration(root.dockMotion); easing.type: Easing.OutCubic } }
    Behavior on appsShift { NumberAnimation { duration: Commons.Style.duration(root.dockMotion); easing.type: Easing.OutCubic } }
    // Elements outside the row step aside as far as its ends move.
    function dockSlide(id) {
        if (!dockFits || (id === "showAppsButton" && dockShowApps)) return 0
        var p = placement(id), t = placement("taskbar"), start = t.start, end = t.start + t.length
        if (dockShowApps) { start = Math.min(start, dockShowApps.start); end = Math.max(end, dockShowApps.start + dockShowApps.size) }
        if (p.start + p.length <= start + 0.5) return -dockBefore
        if (p.start >= end - 0.5) return dockAfter
        return 0
    }
    readonly property bool fullscreenBlocked: underFullscreen && (!hide.hideActive || !hide.shown || !config.get("intellihide-show-in-fullscreen"))
    property real dynamicOpacity: hide.near ? config.get("trans-dynamic-anim-target") :
        (config.get("trans-use-custom-opacity") ? config.get("trans-panel-opacity") : (themeMode ? Commons.Color.bar.background.a : backgroundColor.a))
    Behavior on dynamicOpacity { NumberAnimation { duration: Commons.Style.duration(Math.min(HoverLogic.maxMotion, root.config.get("trans-dynamic-anim-time"))); easing.type: Easing.OutCubic } }
    Services.Intellihide { id: hide; panel: root }
    function toggleIntellihide() { hide.toggle() }
    function reveal(ms) { hide.reveal(ms) }
    property bool temporaryOverlay: false
    readonly property bool overlayShown: Hotkeys.overlay(config.settings, isPrimary, temporaryOverlay)
    function showOverlay(ms) {
        if (!config.get("hot-keys")) return
        temporaryOverlay = true; overlayHide.interval = ms; overlayHide.restart(); reveal(ms)
    }
    Timer { id: overlayHide; onTriggered: root.temporaryOverlay = false }
    readonly property bool previewShown: preview.showing
    readonly property Item dragSurface: surface
    readonly property bool dragging: tasks.dragging
    readonly property bool popupOpen: host.settingsOpen || tasks.dragging || preview.showing || clock.opened || context.opened || workspacePopup.opened || (!!tray.item && tray.item.menuOpen)
    readonly property bool clockVisible: visible && elements.some(function(row) { return row.element === "dateMenu" && row.visible })
    function clockWidget() { return clock.widget }
    function clockHandler() { return clock.ipcHandler }
    readonly property var items: tasks.items
    property string hoveredButton: ""
    property var menuApp: null
    property var scrollStates: ({})
    property string menuKind: ""
    property bool desktopFading: false
    property string peekAddress: ""
    readonly property var visibleWorkspaces: Hyprland.monitors.values.map(function(m) { return m.activeWorkspace ? m.activeWorkspace.id : -1 })
    onVisibleWorkspacesChanged: refreshFades()
    readonly property var menuRows: {
        if (menuApp) return Menus.appRows(menuApp, config.effectiveSettings, function(k) { return strings.t(k) },
            menuApp.windows.length === 1 ? strings.t("menu.quit") : strings.tn("menu.quitWindows", menuApp.windows.length).arg(Commons.I18n.formatNumber(menuApp.windows.length)))
        return Menus.panelRows(menuKind, config.settings, actions.hasDesktopList(root), function(k) { return strings.t(k) }, clockVisible)
    }
    function buttonFor(item) { return item ? tasks.buttonFor(item.key) : null }
    function clickItem(index, button, modifiers) {
        var item = items[index]
        if (!item) return
        if (button === "right") openMenu("app", item, buttonFor(item))
        else if (button === "left" || button === "middle") {
            context.close(); clock.close()
            actions.activate(item, button, modifiers || "", root)
        }
    }
    function clickElement(element, button) {
        if (element === "dateMenu") { clock.click(button); return }
        if (button === "right" && (element === "panel" || element === "showAppsButton")) {
            openMenu(element, null, element === "panel" ? surface : apps)
        } else if (button === "left") {
            if (element === "showAppsButton") host.clickShowApps()
            else if (element === "desktopButton") { host.closePopups(); actions.showDesktop(root) }
        }
    }
    function openMenu(kind, item, target) {
        if (host.settingsOpen) { host.toggleSettings(""); return }
        host.closePopups()
        menuKind = kind; menuApp = item
        context.targetItem = target; context.selected = Menus.nextEnabled(menuRows, -1, 1); context.opened = true
    }
    function menuActivate(row) {
        var item = menuApp
        if (row.kind === "window" && item) actions.bringForward(item.windows.filter(function(w) { return w.address === row.address })[0], workspaceId)
        else if (row.kind === "new") actions.launch(item, true)
        else if (row.kind === "quit") actions.closeAllWindows(item)
        else if (row.kind === "action" && item && item.desktopEntry) actions.desktopAction(item.desktopEntry.actions[row.actionIndex])
        else if (row.kind === "pin" && item) {
            const pins = config.get("favorites").filter(function(id) { return id !== item.appKey })
            if (config.get("favorites").indexOf(item.appKey) < 0) pins.push(item.appKey)
            config.setFavorites(pins)
        } else if (row.kind === "command") actions.command(row.command)
        else if (row.kind === "lock") config.setSetting("taskbar-locked", !config.get("taskbar-locked"))
        else if (row.kind === "settings") host.toggleSettings("")
        else if (row.kind === "clock") host.setClockVisible(!clockVisible, monitorName)
        else if (row.kind === "outline") config.setSetting("icon-contrast-outline", !config.get("icon-contrast-outline"))
        else if (row.kind === "desktop") clickElement("desktopButton", "left")
        else if (row.kind === "drawer") host.showApps()
    }
    function openPreview(item, clicked) {
        // Settings is in front of any preview, so none opens beneath it.
        if (!item || !item.windows.length || context.opened || clock.opened || host.settingsOpen) return
        preview.show(item, buttonFor(item) || tasks, clicked)
    }
    function closePreview(immediate) { previewDelay.stop(); preview.dismiss(immediate) }
    function closePopups(exceptClock) { tasks.finishDrag(true); if (tray.item) tray.item.close(); unhover(); closePreview(true); context.close(); if (exceptClock !== clock) clock.close(); workspacePopup.close() }
    function hoverTarget(target) {
        if (tasks.dragging) return
        if (String(target).indexOf("preview:") === 0) {
            previewDelay.stop(); hoveredButton = ""; desktop.setHovered(false)
            preview.hoverCard(Number(String(target).slice(8))); return
        }
        if (target === "desktopButton") {
            hoveredButton = ""; previewDelay.stop(); preview.hoverCard(-1); preview.scheduleClose(); desktop.setHovered(true); return
        }
        desktop.setHovered(false)
        var item = items[Number(target)]
        if (!item) return
        if (hoveredButton === item.key) return
        hoveredButton = item.key
        preview.hoverCard(-1)
        // Upstream switches an already-open preview after at most 100 ms.
        previewDelay.interval = preview.opened ? Math.min(100, config.get("show-window-previews-timeout")) : config.get("show-window-previews-timeout")
        if (config.get("show-window-previews") && item.windows.length && !context.opened && !clock.opened) previewDelay.restart()
        else closePreview(false)
    }
    function unhover() {
        hoveredButton = ""; previewDelay.stop(); desktop.setHovered(false)
        preview.hoverCard(-1); preview.scheduleClose()
    }
    function peek(window) {
        peekAddress = window.address
        refreshFades()
    }
    function releasePeek() { peekAddress = ""; fader.release("peek:" + monitorName, 120) }
    function fadeDesktop(hovered) {
        // Settings is open over the desktop: no peeking at it beneath.
        if (hovered && host.settingsOpen) return
        desktopFading = hovered
        if (hovered) refreshFades()
        else fader.release("desktop:" + monitorName, config.get("show-showdesktop-time"))
    }
    function refreshFades() {
        if (desktopFading) fader.set("desktop:" + monitorName, FadeLogic.targets(appModel.windows, visibleWorkspaces, "", 0), config.get("show-showdesktop-time"))
        if (peekAddress) fader.set("peek:" + monitorName, FadeLogic.targets(appModel.windows, visibleWorkspaces, peekAddress, config.get("peek-mode-opacity") / 100), 180)
    }
    Connections { target: root.appModel; function onWindowsChanged() { root.refreshFades() } }
    Connections {
        target: root.config
        function onSettingsChanged() {
            if (!root.config.get("peek-mode")) root.releasePeek()
            root.refreshFades()
        }
    }
    function scroll(target, delta) {
        var item = target === "panel" ? null : items[Number(target)]
        if (target !== "panel" && !item) return
        var kind = item ? config.get("scroll-icon-action") : config.get("scroll-panel-action")
        if (kind === "PASS_THROUGH" && item) { scroll("panel", delta); return }
        if (kind === "NOTHING" || kind === "PASS_THROUGH") return
        var key = item ? item.key : "panel"
        var result = ScrollLogic.step(scrollStates[key], Number(delta), config.get(item ? "scroll-icon-delay" : "scroll-panel-delay"), Date.now())
        scrollStates[key] = result.state
        if (!result.direction) return
        if (kind === "CYCLE_WINDOWS") {
            const all = [], seen = {}
            items.forEach(function(i) { i.windows.forEach(function(w) { if (!seen[w.address]) { seen[w.address] = true; all.push(w) } }) })
            // Panel cycles follow taskbar order; icon cycles use MRU ordering.
            if (item) actions.cycleThroughWindows(item, result.direction > 0, false, root)
            else actions.cyclePanel(all, result.direction > 0, root)
        } else if (kind === "CHANGE_VOLUME") actions.volume(result.direction)
        else if (kind === "SWITCH_WORKSPACE") {
            actions.switchWorkspace(root, result.direction)
            if (config.get("scroll-panel-show-ws-popup")) { workspacePopup.opened = true; workspaceHide.restart() }
        }
    }
    function debugState() {
        return {monitor: monitorName, inputArea: inputArea, hoverClearance: hoverClearance, dragging: tasks.dragging, dragInsertion: tasks.dragging ? tasks.dragState.insertion.index : -1, taskbarLength: tasks.naturalLength, items: items.map(function(item) {
            return {key: item.key, name: item.name, isFavorite: item.isFavorite, focused: item.focused,
                windows: item.windows.map(function(w) { return {address: w.address, title: w.title, workspace: w.workspace, workspaceId: w.workspaceId, minimized: w.minimized} })}
        }), intellihide: hide.hideState, intellihideHeld: hide.held, revealStrip: edgeStrip.visible, dynamicOpacity: dynamicOpacity, overlay: overlayShown, trayLoaded: !!tray.item, trayCount: tray.item ? tray.item.count : 0, clockSource: clock.clockSource, backgroundSource: themeMode ? "theme" : "custom", themeBgRole: host.themeBackground.role,
            backgroundColor: backgroundHex, candidateScores: host.themeBackground.scores,
            outlinedIcons: tasks.outlinedIcons().concat(apps.outlineAlpha > 0 ? ["__show-apps"] : []), popups: {calendar: clock.opened, contextMenu: context.opened, appGrid: host.gridOn(monitorName), previews: preview.opened,
            previewKey: preview.itemKey, hoveredCard: preview.hoveredCard, workspace: workspacePopup.opened}, fadedWindows: fader.fadedWindows}
    }
    PanelWindow {
        id: edgeStrip
        screen: root.screen
        visible: root.visible && hide.hideActive && root.config.get("intellihide-use-pointer") && (!root.underFullscreen || root.config.get("intellihide-show-in-fullscreen"))
        color: "transparent"
        WlrLayershell.namespace: "familiar-dock-reveal"
        WlrLayershell.layer: root.underFullscreen ? WlrLayer.Overlay : WlrLayer.Top
        exclusionMode: ExclusionMode.Ignore
        anchors.top: root.edge === "TOP" || root.vertical
        anchors.bottom: root.edge === "BOTTOM" || root.vertical
        anchors.left: root.edge === "LEFT" || !root.vertical
        anchors.right: root.edge === "RIGHT" || !root.vertical
        implicitWidth: root.vertical ? 2 : (root.screen ? root.screen.width : 1)
        implicitHeight: root.vertical ? (root.screen ? root.screen.height : 1) : 2
        mask: Region { item: stripHit }
        Item {
            id: stripHit
            x: root.vertical || !root.config.get("intellihide-use-pointer-limit-size") ? 0 : root.longMargins.start
            y: !root.vertical || !root.config.get("intellihide-use-pointer-limit-size") ? 0 : root.longMargins.start
            width: root.vertical ? 2 : (root.config.get("intellihide-use-pointer-limit-size") ? root.length : edgeStrip.width)
            height: !root.vertical ? 2 : (root.config.get("intellihide-use-pointer-limit-size") ? root.length : edgeStrip.height)
            HoverHandler { onHoveredChanged: hide.edgeHovered = hovered }
        }
    }
    PanelWindow {
        screen: root.screen
        visible: root.visible && root.isPrimary && root.config.get("stockgs-force-hotcorner")
        color: "transparent"
        WlrLayershell.namespace: "familiar-dock-corner"
        WlrLayershell.layer: WlrLayer.Top
        exclusionMode: ExclusionMode.Ignore
        anchors.top: true; anchors.left: true
        implicitWidth: 2; implicitHeight: 2
        MouseArea { anchors.fill: parent; hoverEnabled: true; onEntered: cornerDwell.restart(); onExited: cornerDwell.stop() }
        Timer { id: cornerDwell; interval: 500; onTriggered: root.host.showApps() }
    }
    function menuItems() { return context.opened ? menuRows : [] }
    function activateMenu(index) { if (context.opened) context.activate(index) }
    Component.onCompleted: host.registerPanel(root)
    Component.onDestruction: { host.unregisterPanel(root); releasePeek(); fader.release("desktop:" + monitorName, 0) }
    onVisibleChanged: if (!visible) { tasks.finishDrag(true); unhover(); closePreview(true); context.close(); clock.close() }
    onUnderFullscreenChanged: if (fullscreenBlocked) { unhover(); closePreview(true); context.close(); clock.close() }
    Timer {
        id: previewDelay
        onTriggered: root.openPreview(root.items.filter(function(i) { return i.key === root.hoveredButton })[0], false)
    }
    PreviewPopup { id: preview; panelWindow: root; config: root.config; actions: root.actions; appModel: root.appModel; strings: root.strings }
    ContextMenu { id: context; panelWindow: root; rows: root.menuRows; onActivated: function(row) { root.menuActivate(row) } }
    PopupFrame {
        id: workspacePopup
        panelWindow: root; targetItem: surface; interactive: false
        implicitWidth: 160; implicitHeight: 48
        Text {
            textFormat: Text.PlainText
            anchors.centerIn: parent
            text: root.monitor && root.monitor.activeWorkspace ? String(root.monitor.activeWorkspace.name).slice(0, 128) : ""
            color: Commons.Color.menu.text; font.family: Commons.Style.font.family; font.pixelSize: Commons.Style.font.body
        }
    }
    Timer { id: workspaceHide; interval: 900; onTriggered: workspacePopup.close() }

    visible: config.get("multi-monitors") || isPrimary
    color: "transparent"
    WlrLayershell.namespace: "familiar-dock"
    WlrLayershell.layer: underFullscreen && hide.hideActive && hide.shown && config.get("intellihide-show-in-fullscreen") ? WlrLayer.Overlay : WlrLayer.Top
    // Never change this during a press. Taking keyboard focus mid-drag makes
    // Hyprland re-focus the surface, Qt then forgets the held button, and the
    // drag ends as a drop the moment it starts. So a drag can't hear Escape;
    // pulling the button well off the taskbar and letting go cancels it instead.
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    exclusionMode: !hide.shown || hide.hideActive ? ExclusionMode.Ignore : ExclusionMode.Normal
    exclusiveZone: thickness
    // Keep one edge plus both perpendicular anchors for a well-defined exclusive
    // zone. Extra long-axis margins place short panels without corner anchoring.
    anchors {
        top: edge === "TOP" || root.vertical
        bottom: edge === "BOTTOM" || root.vertical
        left: edge === "LEFT" || !root.vertical
        right: edge === "RIGHT" || !root.vertical
    }
    margins {
        top: root.vertical ? 0 : root.config.get("panel-top-bottom-margins")
        bottom: root.vertical ? 0 : root.config.get("panel-top-bottom-margins")
        left: root.vertical ? root.config.get("panel-side-margins") : 0
        right: root.vertical ? root.config.get("panel-side-margins") : 0
    }
    implicitWidth: vertical ? thickness + hoverReserve : (screen ? screen.width : length)
    implicitHeight: vertical ? (screen ? screen.height : length) : thickness + hoverReserve
    mask: fullscreenBlocked || !hide.shown ? noInput : panelInput
    Region { id: noInput }
    Region { id: panelInput; item: surface }

    function cssColor(key, alpha) {
        var c = ConfigLogic.parseColor(config.get(key))
        return c ? Qt.rgba(c[0], c[1], c[2], c[3] * (alpha === undefined ? 1 : alpha)) : "transparent"
    }
    Rectangle {
        id: surface
        opacity: root.fullscreenBlocked ? 0 : 1
        property real slide: hide.shown ? 0 : root.thickness + root.config.get(root.vertical ? "panel-side-margins" : "panel-top-bottom-margins")
        Behavior on slide { NumberAnimation { duration: Commons.Style.duration(Math.min(HoverLogic.maxMotion, root.config.get("intellihide-animation-time"))); easing.type: Easing.OutCubic } }
        // A macOS-style row widens the panel past both of its rest ends.
        x: root.vertical ? (root.edge === "RIGHT" ? root.hoverReserve + slide : -slide) : root.longMargins.start - root.dockBefore
        y: root.vertical ? root.longMargins.start - root.dockBefore : (root.edge === "BOTTOM" ? root.hoverReserve + slide : -slide)
        width: root.vertical ? root.thickness : root.length + root.dockBefore + root.dockAfter
        height: root.vertical ? root.length + root.dockBefore + root.dockAfter : root.thickness
        HoverHandler { id: panelHover; onHoveredChanged: hide.panelHovered = hovered }
        radius: root.config.get("global-border-radius") * 4
        color: {
            var base = root.backgroundColor
            var alpha = root.dynamicOpacity
            return Qt.rgba(base.r, base.g, base.b, alpha)
        }
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            visible: root.config.get("trans-use-custom-gradient")
            gradient: Gradient {
                GradientStop { position: 0; color: root.cssColor("trans-gradient-top-color", root.config.get("trans-gradient-top-opacity")) }
                GradientStop { position: 1; color: root.cssColor("trans-gradient-bottom-color", root.config.get("trans-gradient-bottom-opacity")) }
            }
        }
        Rectangle {
            visible: root.config.get("trans-use-border")
            width: root.vertical ? root.config.get("trans-border-width") : parent.width
            height: root.vertical ? parent.height : root.config.get("trans-border-width")
            x: root.edge === "LEFT" ? parent.width - width : 0
            y: root.edge === "TOP" ? parent.height - height : 0
            color: root.config.get("trans-border-use-custom-color") ? root.cssColor("trans-border-custom-color") : Qt.rgba(Commons.Color.bar.text.r, Commons.Color.bar.text.g, Commons.Color.bar.text.b, 0.2)
        }
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: function(event) {
                if (event.button === Qt.LeftButton) { context.close(); clock.close(); root.closePreview(true) }
                else root.clickElement("panel", "right")
            }
            onWheel: function(event) { root.scroll("panel", event.angleDelta.y || event.angleDelta.x); event.accepted = true }
        }
        Item {
            id: content
            // Stays put on screen as the panel widens around it.
            x: root.vertical ? root.acrossPadding : root.alongPadding + root.dockBefore
            y: root.vertical ? root.alongPadding + root.dockBefore : root.acrossPadding
            width: root.vertical ? root.innerThickness : root.contentLength
            height: root.vertical ? root.contentLength : root.innerThickness
            // Explicit user layout order is physical (top/left to bottom/right),
            // including in RTL locales, as in the shell dock and upstream panel.
            LayoutMirroring.enabled: false
            LayoutMirroring.childrenInherit: true
            ShowAppsButton {
                id: apps
                config: root.config; actions: root.actions; strings: root.strings; panelWindow: root
                vertical: root.vertical; thickness: root.innerThickness
                visible: root.shown("showAppsButton")
                dockLevel: root.dockAppsIndex >= 0 ? tasks.dock.level[root.dockAppsIndex] || 0 : 0
                dockShift: root.appsShift + root.dockSlide("showAppsButton")
                x: root.vertical ? 0 : root.placement("showAppsButton").start
                y: root.vertical ? root.placement("showAppsButton").start : 0
                width: root.vertical ? root.innerThickness : root.placement("showAppsButton").length
                height: root.vertical ? root.placement("showAppsButton").length : root.innerThickness
            }
            Taskbar {
                id: tasks
                config: root.config; actions: root.actions; appModel: root.appModel; panelWindow: root
                vertical: root.vertical; thickness: root.innerThickness
                visible: root.shown("taskbar")
                x: root.vertical ? 0 : root.placement("taskbar").start
                y: root.vertical ? root.placement("taskbar").start : 0
                width: root.vertical ? root.innerThickness : root.placement("taskbar").length
                height: root.vertical ? root.placement("taskbar").length : root.innerThickness
            }
            HoverHandler {
                acceptedDevices: PointerDevice.Mouse
                onPointChanged: {
                    // A drag counts as a popup for intellihide, but crossing the clock
                    // mid-drag must not open its menu: that closes popups, drag and all.
                    // Nor may passing over it close Settings.
                    if (root.config.get("stockgs-panelbtn-click-only") || !root.popupOpen || root.host.settingsOpen || root.dragging || clock.opened) return
                    var p = clock.mapFromItem(content, point.position.x, point.position.y)
                    if (clock.visible && p.x >= 0 && p.y >= 0 && p.x < clock.width && p.y < clock.height) clock.click("left")
                }
            }
            OmarchyClock {
                id: clock
                panelWindow: root
                vertical: root.vertical; thickness: root.innerThickness
                visible: root.shown("dateMenu")
                transform: Translate { x: root.vertical ? 0 : root.dockSlide("dateMenu"); y: root.vertical ? root.dockSlide("dateMenu") : 0 }
                x: root.vertical ? 0 : root.placement("dateMenu").start
                y: root.vertical ? root.placement("dateMenu").start : 0
                width: root.vertical ? root.innerThickness : root.placement("dateMenu").length
                height: root.vertical ? root.placement("dateMenu").length : root.innerThickness
            }
            ShowDesktop {
                id: desktop
                config: root.config; strings: root.strings; panelWindow: root
                vertical: root.vertical; thickness: root.innerThickness
                visible: root.shown("desktopButton")
                transform: Translate { x: root.vertical ? 0 : root.dockSlide("desktopButton"); y: root.vertical ? root.dockSlide("desktopButton") : 0 }
                x: root.vertical ? 0 : root.placement("desktopButton").start
                y: root.vertical ? root.placement("desktopButton").start : 0
                width: root.vertical ? root.innerThickness : root.placement("desktopButton").length
                height: root.vertical ? root.placement("desktopButton").length : root.innerThickness
            }
            Loader {
                id: tray
                // Test layout intent, never the measured allocation (zero items is valid).
                active: root.visible && root.elements.some(function(row) { return row.element === "rightBox" && row.visible })
                sourceComponent: Tray { panel: root }
                transform: Translate { x: root.vertical ? 0 : root.dockSlide("rightBox"); y: root.vertical ? root.dockSlide("rightBox") : 0 }
                x: root.vertical ? 0 : root.placement("rightBox").start
                y: root.vertical ? root.placement("rightBox").start : 0
                width: root.vertical ? root.innerThickness : root.placement("rightBox").length
                height: root.vertical ? root.placement("rightBox").length : root.innerThickness
            }
        }
        // While Settings is open the panel shows its hover effects but takes
        // no clicks: a click closes Settings, as one beside the card does, and
        // a scroll does nothing. Without hover of its own, this lets hover
        // through to everything beneath it.
        MouseArea {
            objectName: "settings-click-guard"
            anchors.fill: parent
            z: 1000
            visible: root.host.settingsOpen
            acceptedButtons: Qt.AllButtons
            onClicked: root.host.toggleSettings("")
            onWheel: function(event) { event.accepted = true }
        }
    }
}
