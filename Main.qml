pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs.Commons as Commons
import "services" as Services
import "panel" as PanelUi
import "settings" as SettingsUi
import "services/ClockLogic.js" as ClockLogic
import "services/ClockIpc.js" as ClockIpc
import "services/IconColors.js" as IconLogic
import "services/Ipc.js" as IpcLogic
import "services/Badges.js" as BadgeLogic
import "services/Hotkeys.js" as HotkeyLogic

Item {
    id: root
    property var shell: null
    property var manifest: null
    property string omarchyPath: ""
    property var pluginRegistry: null
    property var barWidgetRegistry: null

    readonly property var appLibrary: shell ? shell.appLibrary : null
    readonly property var configuration: pluginConfig
    readonly property var actions: windowActions
    readonly property var strings: pluginStrings
    readonly property var iconColors: iconSampler
    readonly property var themeBackground: themeSurface
    property bool warnedInvalidBool: false
    property bool warnedBadgeMissing: false
    function parseBool(value) {
        var result = IpcLogic.boolean(value)
        if (result === null && !warnedInvalidBool) console.warn("familiar-dock: invalid boolean IPC argument")
        if (result === null) warnedInvalidBool = true
        return result
    }
    property bool warnedClockFallback: false
    function warnClockFallback() {
        if (!warnedClockFallback) console.warn("familiar-dock: Omarchy clock could not load; using fallback label")
        warnedClockFallback = true
    }
    property var appGrid: null
    readonly property string primaryMonitor: {
        var names = Quickshell.screens.map(function(screen) {
            var monitor = Hyprland.monitorFor(screen)
            return monitor ? monitor.name : screen.name
        })
        var requested = pluginConfig.get("primary-monitor")
        return names.indexOf(requested) >= 0 ? requested : (names[0] || "")
    }
    readonly property int panelCount: pluginConfig.get("multi-monitors") ? Quickshell.screens.length : Math.min(1, Quickshell.screens.length)

    Commons.Translations { id: pluginStrings; directory: Qt.resolvedUrl("i18n") }
    Services.Config { id: pluginConfig; systemDefaults: defaultPins.defaults }
    Services.SystemDefaults { id: defaultPins; appModel: taskModel }
    Services.AppModel { id: taskModel; config: pluginConfig; appLibrary: root.appLibrary }
    readonly property string pinnedIconSignature: {
        var style = pluginConfig.get("appicon-style")
        var icons = pluginConfig.get("favorites").map(function(id) {
            var entry = taskModel.entriesById[id]
            return entry ? {id: id, source: taskModel.iconFor({icon: entry.icon}, style), grayscale: style === "GRAYSCALE"} : null
        }).filter(function(icon) { return !!icon })
        var source = pluginConfig.get("show-apps-icon-file")
        icons.push({id: "__show-apps", source: source, dots: !source})
        return JSON.stringify(icons)
    }
    Services.IconColors {
        id: iconSampler
        sampleParent: { var panel = root.panels.filter(function(p) { return p.visible })[0]; return panel ? panel.contentItem : null }
        generation: themeSurface.generation
    }
    Services.ThemeBackground { id: themeSurface; config: pluginConfig; iconColors: iconSampler; icons: JSON.parse(root.pinnedIconSignature) }
    function outlineAlpha(id, source, grayscale, background) {
        if (!pluginConfig.get("icon-contrast-outline")) return 0
        var sample = iconSampler.sample(id, source, grayscale)
        return sample ? IconLogic.outlineAlpha(sample.edges, background, themeSurface.foreground) : 0
    }
    readonly property var badges: badgeLoader.item ? badgeLoader.item.entries : ({})
    Loader {
        id: badgeLoader
        active: BadgeLogic.enabled(pluginConfig.settings)
        sourceComponent: Services.Badges { host: root }
    }
    Services.WindowActions { id: windowActions; config: pluginConfig; appModel: taskModel; appLibrary: root.appLibrary; fader: windowFader; onDispatched: taskModel.refreshSoon() }
    Services.WindowFader { id: windowFader; actions: windowActions }
    Services.Cleanup {}
    Services.DockLifecycle { config: pluginConfig }
    Services.AppsKey { id: appsKey; config: pluginConfig }
    Services.DrawerClick { id: drawerClick; config: pluginConfig; actions: windowActions; onDrawerWanted: root.showApps() }
    readonly property var drawerClickService: drawerClick
    // Settings records the key through it and shows what holds the key.
    readonly property var appsKeyService: appsKey
    Services.ClockLifecycle { id: clockLifecycle; actions: windowActions; shown: root.panels.some(function(p) { return p.isPrimary && p.clockVisible }) }
    readonly property var clockStash: clockLifecycle.stash
    function updateClockSettings(entry) { clockLifecycle.updateSettings(entry) }
    function clockWidgets() { return panels.map(function(p) { return p.clockWidget() }).filter(function(w) { return !!w }) }
    readonly property var clockIpcRecords: panels.map(function(p) {
        return {monitor: p.monitorName, visible: p.clockVisible, handler: p.clockHandler()}
    })
    readonly property bool clockIpcTakeover: !ClockLogic.findEntry(shell && shell.barConfig ? shell.barConfig.layout : {})
    readonly property string clockIpcFocus: Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : primaryMonitor
    property bool clockIpcPending: false
    property string clockIpcMonitor: ""
    function syncClockIpc() {
        var result = ClockIpc.reconcile(clockIpcRecords || [], clockIpcFocus, primaryMonitor, clockIpcTakeover, Commons.IpcRegistry.handlers)
        clockIpcPending = result.pending; clockIpcMonitor = result.monitor
    }
    onClockIpcRecordsChanged: syncClockIpc()
    onClockIpcTakeoverChanged: syncClockIpc()
    onClockIpcFocusChanged: syncClockIpc()
    onPrimaryMonitorChanged: syncClockIpc()
    // Only runs while a dying top-bar handler still owns the public target.
    Timer { interval: 50; running: root.clockIpcPending; repeat: true; onTriggered: root.syncClockIpc() }
    function setClockVisible(visible, monitor) {
        var name = monitor || primaryMonitor
        pluginConfig.setSetting("panel-element-positions", ClockLogic.visibleLayout(pluginConfig.settings, name, primaryMonitor, visible))
    }

    Variants {
        model: Quickshell.screens
        delegate: Component {
            PanelUi.Panel {
                required property var modelData
                host: root
                fader: windowFader
                screen: modelData
                config: pluginConfig
                appModel: taskModel
                actions: windowActions
                strings: pluginStrings
                primaryMonitor: root.primaryMonitor
                panelCount: root.panelCount
            }
        }
    }
    property var panels: []
    function registerPanel(panel) { panels = panels.concat([panel]) }
    function unregisterPanel(panel) { panels = panels.filter(function(p) { return p !== panel }) }
    function panelFor(monitor) {
        var name = monitor || (Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : primaryMonitor)
        return panels.filter(function(p) { return p.visible && p.monitorName === name })[0] || null
    }
    readonly property bool settingsOpen: preferences.opened
    SettingsUi.SettingsWindow { id: preferences; host: root; config: pluginConfig; strings: pluginStrings }
    function showSettings(tab) {
        closePanelPopups(); if (appGrid) appGrid.close()
        preferences.show(tab)
    }
    function toggleSettings(tab) { if (preferences.opened) preferences.close(); else showSettings(tab) }
    function closeSettings() { preferences.close() }
    function showApps() {
        preferences.close()
        if (shell) shell.toggle("rugobal.familiar-dock", "")
    }
    // The drawer icon: the drawer, or what show-apps-click picks instead.
    function clickShowApps() {
        if (drawerClick.plan.kind === "drawer") { showApps(); return }
        closePopups()
        drawerClick.click()
    }
    function closePanelPopups(exceptClock) { panels.forEach(function(p) { p.closePopups(exceptClock) }) }
    function closePopups(exceptClock) { preferences.close(); closePanelPopups(exceptClock); if (appGrid) appGrid.close() }
    function gridOn(monitor) { return !!appGrid && appGrid.opened && appGrid.monitorName === monitor }
    readonly property bool popupOpen: preferences.opened || !!appGrid && appGrid.opened || panels.some(function(p) { return p.popupOpen })
    Connections {
        target: Hyprland
        function onRawEvent(event) {
            if (event.name === "activewindowv2") windowActions.noteWindowFocus(event.data)
        }
    }

    // ---- Input/testing IPC: every hook enters the real panel/action path. ----
    Commons.ShellIpc {
        target: "rugobal.familiar-dock"
        function reloadConfig(): void { pluginConfig.reload(); defaultPins.refreshSoon() }
        function debugState(): string {
            return JSON.stringify({panels: root.panels.filter(function(p) { return p.visible }).map(function(p) { return p.debugState() }),
                settings: {open: preferences.opened, tab: preferences.tab, changedOnly: preferences.changedOnly === true, keyboard: preferences.keyboard === true},
                settingsOpen: preferences.opened, settingsTab: preferences.tab, settingsHole: preferences.opened ? preferences.hole : null, appGrid: !!root.appGrid && root.appGrid.opened, fadedWindows: windowFader.fadedWindows,
                favoritesSource: pluginConfig.favoritesSource, systemDefaults: defaultPins.defaults,
                barClockHidden: clockLifecycle.hidden, appsKey: appsKey.status, drawerClick: drawerClick.status, clockIpcMonitor: root.clockIpcMonitor, clockIpcPending: root.clockIpcPending,
                badges: root.badges, badgeListener: !!badgeLoader.item,
                backgroundSource: pluginConfig.get("trans-use-custom-bg") ? "custom" : "theme",
                themeBgRole: themeSurface.role,
                backgroundColor: pluginConfig.get("trans-use-custom-bg") ? pluginConfig.get("trans-bg-color") : themeSurface.color,
                candidateScores: themeSurface.scores})
        }
        function click(monitor: string, index: string, button: string, modifiers: string): void {
            var panel = root.panelFor(monitor)
            if (panel) panel.clickItem(Number(index), button, modifiers)
        }
        function clickElement(monitor: string, element: string, button: string): void {
            var panel = root.panelFor(monitor)
            if (panel) panel.clickElement(element, button)
        }
        function scroll(monitor: string, target: string, delta: string): void {
            var panel = root.panelFor(monitor)
            if (panel) panel.scroll(target, Number(delta))
        }
        function hover(monitor: string, target: string): void {
            var panel = root.panelFor(monitor)
            if (panel) panel.hoverTarget(target)
        }
        function unhover(monitor: string): void {
            var panel = root.panelFor(monitor)
            if (panel) panel.unhover()
        }
        function menuItems(): string {
            var panel = root.panels.filter(function(p) { return p.menuItems().length })[0]
            return JSON.stringify(panel ? panel.menuItems() : [])
        }
        function menuActivate(index: string): void {
            var panel = root.panels.filter(function(p) { return p.menuItems().length })[0]
            if (panel) panel.activateMenu(Number(index))
        }
        function activateApp(n: string, modifier: string): void {
            var plan = HotkeyLogic.activation(pluginConfig.settings, n, modifier)
            if (!plan) return
            var panel = root.panelFor("")
            if (panel) {
                panel.showOverlay(pluginConfig.get("overlay-timeout"))
                var item = panel.items[plan.index]
                if (item && item.windows.length > 1 && pluginConfig.get("shortcut-previews") && !plan.modifier) panel.openPreview(item, true)
                else panel.clickItem(plan.index, "left", plan.modifier)
            }
        }
        function showOverlay(): void {
            if (!pluginConfig.get("hot-keys")) return
            root.panels.forEach(function(p) { p.showOverlay(pluginConfig.get("shortcut-timeout")) })
        }
        function toggleIntellihide(): void {
            if (!pluginConfig.get("hot-keys")) return
            var panel = root.panelFor(""); if (panel) panel.toggleIntellihide()
        }
        function showDesktop(): void { var panel = root.panelFor(""); if (panel) panel.clickElement("desktopButton", "left") }
        function showApps(): void { root.showApps() }
        function showSettings(tab: string): void { root.showSettings(tab) }
        function closeSettings(): void { root.closeSettings() }
        function toggleSettings(tab: string): void { root.toggleSettings(tab) }
        function setClockVisible(visible: string): void { var value = root.parseBool(visible); if (value !== null) root.setClockVisible(value) }
        function setThemeBgColor(role: string): void { pluginConfig.setSetting("theme-bg-color", role) }
        function setIconContrastOutline(enabled: string): void { var value = root.parseBool(enabled); if (value !== null) pluginConfig.setSetting("icon-contrast-outline", value) }
    }
}
