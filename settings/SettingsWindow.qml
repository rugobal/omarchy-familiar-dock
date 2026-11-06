pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Io
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "WritePlan.js" as Writes
import "Nav.js" as Nav
import "../services/Proximity.js" as Proximity
import "ui" as Kit

// The settings, in one card over the desktop: what this is and what it has
// changed across the top, the pages down the left with a search over them,
// the page on the right, and what the keys do across the foot. The panel's
// own strip stays uncovered, so every change shows on it as it is made.
// Laid out after OmaControl's SettingsWindow.qml (MIT, see NOTICE.md).
Item {
    id: root
    required property var host
    required property var config
    required property var strings
    property bool opened: false
    // Closing Settings answers an open import question with "nothing".
    onOpenedChanged: if (!opened && config.importReview) config.finishImport("cancel")
    property string tab: "Overview"
    property string monitor: ""
    property bool allMonitors: true
    readonly property var monitors: Hyprland.monitors.values.map(function(m) { return m.name })
    onMonitorsChanged: {
        if (monitors.indexOf(monitor) < 0) monitor = monitors[0] || ""
        if (monitors.length <= 1) allMonitors = true
    }
    readonly property string monitorName: overlay.targetScreen ? overlay.targetScreen.name : ""
    readonly property var livePanel: host.panelFor(monitorName)
    readonly property string edge: livePanel ? livePanel.edge : "BOTTOM"
    // The strip along the panel's edge left undimmed: the panel, its margin
    // and as far as its hovered icons reach.
    readonly property real reserve: livePanel ? livePanel.thickness + config.get(livePanel.vertical ? "panel-side-margins" : "panel-top-bottom-margins") + livePanel.hoverClearance + Commons.Style.space(12) : Commons.Style.space(12)
    // Where the panel takes the pointer, which the overlay lets through:
    // its input area, placed where Hyprland put its layer. Shrunk to whole
    // pixels inside it, so no spot between the two reaches a window, which
    // would take the keys. Nothing is let through until the place is known.
    readonly property var hole: {
        var a = livePanel ? livePanel.inputArea : null, o = panelOrigin
        if (!a || !o) return {x: 0, y: 0, width: 0, height: 0}
        var left = o.x + a.x, top = o.y + a.y, x = Math.ceil(left), y = Math.ceil(top)
        return {x: x, y: y, width: Math.max(0, Math.floor(left + a.width) - x), height: Math.max(0, Math.floor(top + a.height) - y)}
    }
    // Where Hyprland put the panel's layer on its screen. Another layer's
    // reserved space (a bar on the same edge, or across a vertical panel's
    // ends) moves it off its edge, so ask while Settings is open, again
    // whenever anything that places it changes, and forget it meanwhile.
    property var panelOrigin: null
    readonly property string panelPlacement: opened && livePanel ? JSON.stringify([monitorName, livePanel.edge,
        livePanel.width, livePanel.height, livePanel.visible, livePanel.exclusionMode,
        config.get("panel-top-bottom-margins"), config.get("panel-side-margins")]) : ""
    onPanelPlacementChanged: { panelOrigin = null; layerProbe.again() }
    Process {
        id: layerProbe
        property int tries: 0
        property string asked: ""
        property string output: ""
        command: ["hyprctl", "layers", "-j"]
        stdout: StdioCollector { onStreamFinished: layerProbe.output = text }
        function again() { tries = 0; if (root.panelPlacement) probeDelay.restart() }
        onExited: function(code) {
            var text = output
            output = ""
            if (!root.panelPlacement || !root.livePanel) return
            // The panel moved while this listing ran: list again.
            if (asked !== root.panelPlacement) { again(); return }
            var parsed = null
            try { parsed = JSON.parse(text) } catch (e) { parsed = null }
            var origin = code === 0 ? Proximity.layerOrigin(parsed, root.monitorName, "familiar-dock",
                root.livePanel.width, root.livePanel.height, root.livePanel.monitorRect) : null
            root.panelOrigin = origin
            // Hyprland may not have placed a resized layer yet.
            if (!origin && ++tries < 5) probeDelay.restart()
        }
    }
    Timer {
        id: probeDelay
        interval: 80
        onTriggered: {
            if (!root.panelPlacement) return
            if (layerProbe.running) { restart(); return }
            layerProbe.asked = root.panelPlacement
            layerProbe.running = true
        }
    }
    // A layer coming or going can rearrange the panel without resizing it.
    Connections {
        target: Hyprland
        enabled: root.opened
        function onRawEvent(event) { if (event.name === "openlayer" || event.name === "closelayer") layerProbe.again() }
    }
    // The overlay covers one screen. Every other one gets an empty layer
    // that takes the pointer but never the keys, so no window there takes
    // them either; a click there closes Settings, as one beside the card does.
    Variants {
        model: root.opened ? Quickshell.screens : []
        delegate: Component {
            PanelWindow {
                required property var modelData
                screen: modelData
                // By name: until the overlay's screen is known, none maps,
                // so none can cover the overlay's own screen.
                visible: root.opened && !!overlay.targetScreen && modelData.name !== overlay.targetScreen.name
                color: "transparent"
                exclusionMode: ExclusionMode.Ignore
                WlrLayershell.namespace: "familiar-dock-settings-elsewhere"
                WlrLayershell.layer: WlrLayer.Overlay
                WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
                anchors { top: true; bottom: true; left: true; right: true }
                MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onPressed: root.close() }
            }
        }
    }
    readonly property string primary: host.primaryMonitor || ""
    function show(name) {
        if (name) tab = Form.tabs.filter(function(t) { return t.toLowerCase() === name.toLowerCase() })[0] || "Overview"
        if (!monitor || monitors.indexOf(monitor) < 0) monitor = host.primaryMonitor || monitors[0] || ""
        config.reload()
        searchQuery = ""
        changedOnly = false; changedShown = ({})
        cursor = null
        opened = true
        Qt.callLater(root.navTakeFocus)
    }
    function close() { resetDialog.opened = false; opened = false }
    onTabChanged: { bodyScroll.contentY = 0; cursor = null }

    // ---------------- what has changed ---------------------------------------
    readonly property var changedKeys: Form.changedKeys(config.settings, monitors.length, allMonitors ? "*" : monitor, primary)
    readonly property int changedCount: changedKeys.length
    readonly property bool canReset: config.valid && config.pendingSettings === null && config.resetSnapshot === null && !config.importReview
    function askReset() {
        if (!canReset) return
        resetDialog.selectedIndex = 0
        resetDialog.opened = true
        navTakeFocus()
    }

    // ---------------- the changed view -----------------------------------------
    // Only the settings that differ from their defaults, on their own pages
    // under their own headings, as a search shows its matches. What it shows
    // is taken when it opens and only grows: a setting changed meanwhile
    // joins it, a row reset there stays (unmarked) until the view is left,
    // so nothing moves under the pointer.
    property bool changedOnly: false
    property var changedShown: ({})
    // Whether the card has the keyboard now, for debugState.
    readonly property bool keyboard: opened && keys.Window.active === true
    function changedShows(keys) { return Nav.shows(changedShown, keys) }
    onChangedKeysChanged: if (changedOnly) changedShown = Nav.grown(changedShown, changedKeys)
    function showChanged(on) {
        if (on === changedOnly || (on && changedCount === 0)) return
        changedShown = on ? Nav.grown({}, changedKeys) : ({})
        changedOnly = on
        if (on) { firstPageShowing(); return }
        // Back on the whole page, at the row the cursor was on.
        Qt.callLater(function() { if (root.navUsable(root.cursor)) bodyScroll.reveal(root.cursor) })
    }
    // Escape backs out of the changed view before it closes the window.
    function backOut() { if (changedOnly) showChanged(false); else close() }

    // ---------------- search -------------------------------------------------
    // Only the open page is built, so the other pages answer from the form
    // model: what each would show, by name, description and heading.
    property string searchQuery: ""
    readonly property string searchTerm: Nav.term(searchQuery)
    readonly property bool searching: searchTerm !== ""
    // A search or the changed view: pages show only what they match.
    readonly property bool filtering: searching || changedOnly
    property bool searchFocused: false
    property var searchInput: null
    function pageTitle(name) { return Form.safe(strings.t("settings.tab." + name)) }
    function countFor(name, term) { return Nav.matchCount(name, strings, monitors.length, term, changedOnly ? changedShown : null) }
    readonly property var matchCounts: {
        var counts = {}
        for (var i = 0; i < Nav.order.length; i++) counts[Nav.order[i]] = filtering ? countFor(Nav.order[i], searchTerm) : 0
        return counts
    }
    function pageShows(name) { return !filtering || (matchCounts[name] || 0) > 0 }
    readonly property var visiblePages: Nav.order.filter(function(name) { return root.pageShows(name) })
    function rowMatches(label, description, group) { return Nav.matches(searchTerm, label, description, group, pageTitle(tab)) }
    // Typing onto a page with nothing left on it moves to the first page
    // that has something. Asked with the new term directly: the counts are a
    // binding on it and may still hold the last term's answer here.
    onSearchTermChanged: { cursor = null; firstPageShowing() }
    function firstPageShowing() {
        if (!filtering || countFor(tab, searchTerm) > 0) return
        for (var i = 0; i < Nav.order.length; i++)
            if (countFor(Nav.order[i], searchTerm) > 0) { tab = Nav.order[i]; return }
    }
    function focusSearch() {
        if (!searchInput) return
        searchInput.forceActiveFocus()
        searchInput.selectAll()
    }

    // ---------------- keyboard navigation ------------------------------------
    // One cursor runs down the rows of the open page. Rows register
    // themselves; the cursor is the row, so a page rebuilt around it simply
    // loses it rather than pointing at a stranger.
    property var navRows: []
    property Item cursor: null
    property var navBlocker: null
    readonly property bool navBlocked: navBlocker !== null
    // A field being typed into keeps the keys until Enter or Escape.
    property bool typing: false
    function registerNavRow(row) { var rows = navRows.slice(); rows.push(row); navRows = rows }
    function unregisterNavRow(row) {
        navRows = navRows.filter(function(r) { return r !== row && r !== null })
        if (cursor === row) cursor = null
        if (navBlocker === row) navBlocker = null
    }
    function setNavBlocked(row, blocking) {
        if (blocking) navBlocker = row
        else if (navBlocker === row) navBlocker = null
    }
    // Reading order, from where rows actually sit: tiles run across, then
    // down; rows that come and go never leave a gap in the walk.
    function navOrdered() {
        var out = []
        for (var i = 0; i < navRows.length; i++) {
            var row = navRows[i]
            if (!row || !row.visible || !row.enabled || row.height <= 0) continue
            var p = row.mapToItem(bodyScroll.contentItem, 0, 0)
            if (p) out.push({row: row, x: p.x, y: p.y})
        }
        out.sort(function(a, b) { return Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x })
        return out
    }
    function navMove(delta) {
        var ordered = navOrdered()
        if (ordered.length === 0) return
        var at = -1
        for (var i = 0; i < ordered.length; i++) if (ordered[i].row === cursor) at = i
        var next = at < 0 ? (delta > 0 ? 0 : ordered.length - 1) : Math.max(0, Math.min(ordered.length - 1, at + delta))
        cursor = ordered[next].row
        navReveal(ordered[next])
    }
    function navJump(where) {
        var ordered = navOrdered()
        if (ordered.length === 0) return
        var entry = ordered[where < 0 ? 0 : ordered.length - 1]
        cursor = entry.row
        navReveal(entry)
    }
    function navReveal(entry) {
        var margin = Commons.Style.space(24)
        var top = entry.y - margin, bottom = entry.y + entry.row.height + margin
        if (top < bodyScroll.contentY) bodyScroll.contentY = Math.max(0, top)
        else if (bottom > bodyScroll.contentY + bodyScroll.height)
            bodyScroll.contentY = Math.min(Math.max(0, bodyScroll.contentHeight - bodyScroll.height), bottom - bodyScroll.height)
    }
    // A row the cursor stayed on can since have been disabled or hidden (a
    // synchronized layout, a search); it answers no keys until it is back.
    function navUsable(row) { return !!row && row.visible && row.enabled }
    function navStep(delta) { if (navUsable(cursor)) cursor.navStep(delta) }
    function navActivate() { if (navUsable(cursor)) cursor.navActivate() }
    function navReset() { if (navUsable(cursor) && cursor.changed) cursor.resetRequested() }
    function navTakeFocus() { keySink.forceActiveFocus() }
    function navPage(delta) {
        var pages = visiblePages
        if (pages.length === 0) return
        var at = pages.indexOf(tab)
        tab = pages[Math.max(0, Math.min(pages.length - 1, (at < 0 ? 0 : at) + delta))]
    }
    readonly property var legend: Nav.legend(navBlocker !== null ? navBlocker : cursor,
        {searchFocused: searchFocused, typing: typing, blocked: navBlocked, changed: changedCount > 0, changedOnly: changedOnly})
    // A save or a transfer reports here, at the foot; failures in the
    // urgent colour, everything else muted.
    readonly property bool messageFailed: ["settings.invalidImport", "settings.invalidPath", "settings.importFailed",
        "settings.exportFailed", "settings.backupFailed", "settings.resetChanged", "settings.saveFailed"].indexOf(config.message) >= 0

    Ui.OverlayWindow {
        id: overlay
        shown: root.opened
        WlrLayershell.namespace: "familiar-dock-settings"
        // Hyprland sends every pointer event to a surface holding exclusive
        // keyboard focus, wherever the pointer is, so the panel would never
        // see hover: no magnifying, no hover effects while Settings is open.
        // As the shell's KeyboardPanel does, prime with Exclusive to take the
        // keys when the overlay maps, then hold them on demand. Hyprland gives
        // them back to an on-demand surface whenever the pointer crosses it.
        property bool focusPrimed: false
        shownKeyboardFocus: focusPrimed ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.Exclusive
        onBackingWindowVisibleChanged: {
            focusPrimed = false
            if (backingWindowVisible) focusPrime.restart()
        }
        Timer { id: focusPrime; interval: 75; onTriggered: overlay.focusPrimed = overlay.shown }
        // Everything takes the pointer but the panel, as it is now, so hover
        // reaches the panel and nothing else below: live changes show on it,
        // and a click there closes Settings (see the panel's click guard).
        mask: Region {
            width: overlay.width; height: overlay.height
            Region {
                intersection: Intersection.Subtract
                x: root.hole.x; y: root.hole.y; width: root.hole.width; height: root.hole.height
            }
        }
        // A click anywhere off the card closes Settings: beside the panel
        // too, not just inside the dimmed area.
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: root.close()
        }
        // Dim everything but the panel's strip: the card is in front, the
        // panel it edits stays in plain sight.
        Rectangle {
            x: root.edge === "LEFT" ? root.reserve : 0
            y: root.edge === "TOP" ? root.reserve : 0
            width: Math.max(0, overlay.width - x - (root.edge === "RIGHT" ? root.reserve : 0))
            height: Math.max(0, overlay.height - y - (root.edge === "BOTTOM" ? root.reserve : 0))
            color: Qt.rgba(0, 0, 0, 0.4)
        }
        Item {
            id: available
            x: root.edge === "LEFT" ? root.reserve : Commons.Style.space(8)
            y: root.edge === "TOP" ? root.reserve : Commons.Style.space(8)
            width: Math.max(1, overlay.width - x - (root.edge === "RIGHT" ? root.reserve : Commons.Style.space(8)))
            height: Math.max(1, overlay.height - y - (root.edge === "BOTTOM" ? root.reserve : Commons.Style.space(8)))
            Rectangle {
                id: card
                anchors.centerIn: parent
                // A width settings are read at: a name on the left and its
                // value on the right stay within one glance.
                width: Math.round(Math.min(parent.width * 0.92, Commons.Style.space(1200)))
                height: Math.round(Math.min(parent.height * 0.92, Math.max(Commons.Style.space(560), parent.height * 0.86)))
                color: Kit.Palette.background
                radius: Commons.Style.cornerRadius
                border.width: Commons.Style.spacing.hairline
                border.color: Kit.Palette.hairline
                // The card is not the scrim: a click that lands on it stays.
                MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton; onClicked: {} }
                FocusScope {
                    id: keys
                    anchors.fill: parent
                    anchors.margins: Commons.Style.spacing.hairline
                    focus: true
                    // Focus handed back to the scope lands on whichever child
                    // held it last, so it goes to a sink that wants nothing,
                    // and the navigation keys are handled above it.
                    Item { id: keySink; focus: true }
                    Keys.priority: Keys.BeforeItem
                    Keys.onPressed: function(event) {
                        if (resetDialog.opened) { event.accepted = resetDialog.handleKey(event); return }
                        if (importDialog.opened) { event.accepted = importDialog.handleKey(event); return }
                        // An open list or the search box has the keys.
                        if (root.navBlocked || root.searchFocused) return
                        if (root.typing) {
                            if (event.key === Qt.Key_Escape || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                                root.navTakeFocus(); event.accepted = true
                            }
                            return
                        }
                        var alt = (event.modifiers & Qt.AltModifier) !== 0
                        var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
                        if (event.key === Qt.Key_Escape) { root.backOut(); event.accepted = true; return }
                        if (event.text === "c" && !ctrl && !alt) { root.showChanged(!root.changedOnly); event.accepted = true; return }
                        if (event.key === Qt.Key_Backspace && ctrl) { root.askReset(); event.accepted = true; return }
                        if (event.text === "/" || (ctrl && event.key === Qt.Key_F)) { root.focusSearch(); event.accepted = true; return }
                        if (event.key === Qt.Key_Down || event.text === "j") { alt ? root.navPage(1) : root.navMove(1); event.accepted = true; return }
                        if (event.key === Qt.Key_Up || event.text === "k") { alt ? root.navPage(-1) : root.navMove(-1); event.accepted = true; return }
                        if (event.key === Qt.Key_Tab) { root.navPage(1); event.accepted = true; return }
                        if (event.key === Qt.Key_Backtab) { root.navPage(-1); event.accepted = true; return }
                        if (event.key === Qt.Key_Right || event.text === "l") { root.navStep(1); event.accepted = true; return }
                        if (event.key === Qt.Key_Left || event.text === "h") { root.navStep(-1); event.accepted = true; return }
                        if (event.key === Qt.Key_Space || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.navActivate(); event.accepted = true; return }
                        if (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) { root.navReset(); event.accepted = true; return }
                        if (event.key === Qt.Key_Home) { root.navJump(-1); event.accepted = true; return }
                        if (event.key === Qt.Key_End) { root.navJump(1); event.accepted = true; return }
                    }
                    // A field taking the keyboard: the page scrolls to it, and
                    // the keys are its own until it hands them back.
                    Connections {
                        target: keys.Window.window
                        function onActiveFocusItemChanged() {
                            var item = target.activeFocusItem, ancestor = item
                            while (ancestor && ancestor !== page) ancestor = ancestor.parent
                            root.typing = ancestor === page
                            if (ancestor === page) Qt.callLater(function() { if (item) bodyScroll.reveal(item) })
                        }
                    }

                    // ---------------- header ---------------------------------
                    Rectangle {
                        id: header
                        width: parent.width
                        height: Commons.Style.spacing.controlHeight + Commons.Style.space(8)
                        radius: card.radius
                        color: Kit.Palette.chrome
                        // Square the corners that meet the body.
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: parent.radius; color: parent.color; visible: parent.radius > 0 }
                        Row {
                            anchors.left: parent.left
                            anchors.leftMargin: Commons.Style.spacing.panelPadding
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Commons.Style.space(8)
                            Text {
                                textFormat: Text.PlainText
                                anchors.verticalCenter: parent.verticalCenter
                                text: Form.safe(root.strings.t("settings.name"))
                                color: Kit.Palette.foreground
                                font.family: Kit.Palette.fontFamily
                                font.pixelSize: Commons.Style.font.title
                                font.bold: true
                            }
                            Text {
                                textFormat: Text.PlainText
                                anchors.verticalCenter: parent.verticalCenter
                                text: String((root.host.manifest ? root.host.manifest.version : "") || "").slice(0, 64)
                                color: Kit.Palette.muted
                                font.family: Kit.Palette.fontFamily
                                font.pixelSize: Commons.Style.font.caption
                            }
                        }
                        Row {
                            anchors.right: parent.right
                            anchors.rightMargin: Commons.Style.spacing.panelPadding
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Commons.Style.space(8)
                            // The count is the way into the changed view, and
                            // while it is open, a pill that leaves it.
                            Rectangle {
                                id: changedToggle
                                objectName: "settings:changed"
                                readonly property bool on: root.changedOnly
                                readonly property string label: on
                                    ? (root.changedCount === 0 ? root.strings.t("settings.showingNone")
                                        : root.changedCount === 1 ? root.strings.t("settings.showingOne")
                                        : root.strings.t("settings.showingMany").arg(root.changedCount))
                                    : root.changedCount === 1 ? root.strings.t("settings.changedOne")
                                    : root.strings.t("settings.changedMany").arg(root.changedCount)
                                anchors.verticalCenter: parent.verticalCenter
                                visible: root.changedCount > 0 || on
                                implicitWidth: changedRow.implicitWidth + (on ? Commons.Style.space(22) : 0)
                                implicitHeight: Commons.Style.space(22)
                                width: implicitWidth; height: implicitHeight
                                radius: Kit.Palette.pillRadius
                                color: on ? Kit.Palette.accent : "transparent"
                                Row {
                                    id: changedRow
                                    anchors.centerIn: parent
                                    spacing: Commons.Style.space(8)
                                    Text {
                                        textFormat: Text.PlainText
                                        text: Form.safe(changedToggle.label)
                                        color: changedToggle.on ? Kit.Palette.onAccent : changedMouse.containsMouse ? Kit.Palette.accent : Kit.Palette.muted
                                        font.family: Kit.Palette.fontFamily
                                        font.pixelSize: Commons.Style.font.caption
                                        font.bold: true
                                        font.underline: changedMouse.containsMouse && !changedToggle.on
                                    }
                                    Text {
                                        textFormat: Text.PlainText
                                        visible: changedToggle.on
                                        text: "\uf00d"
                                        color: Kit.Palette.onAccent
                                        font.family: Kit.Palette.fontFamily
                                        font.pixelSize: Commons.Style.font.caption
                                    }
                                }
                                MouseArea {
                                    id: changedMouse
                                    anchors.fill: parent
                                    anchors.margins: -Commons.Style.space(4)
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: { root.showChanged(!root.changedOnly); root.navTakeFocus() }
                                }
                            }
                            Kit.Chip {
                                anchors.verticalCenter: parent.verticalCenter
                                visible: root.changedCount > 0
                                enabled: root.canReset
                                text: Form.safe(root.strings.t("settings.resetAll"))
                                onClicked: root.askReset()
                            }
                            Kit.KeyCap {
                                anchors.verticalCenter: parent.verticalCenter
                                key: "esc"
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.backOut() }
                            }
                        }
                    }
                    Rectangle { id: headerRule; anchors.top: header.bottom; width: parent.width; height: Commons.Style.spacing.hairline; color: Kit.Palette.hairline }

                    // ---------------- sidebar --------------------------------
                    Rectangle {
                        id: sidebar
                        anchors.top: headerRule.bottom
                        anchors.bottom: footerRule.top
                        width: Commons.Style.space(240)
                        color: Kit.Palette.surface
                        Item {
                            id: searchBox
                            x: Commons.Style.space(10); y: Commons.Style.space(12)
                            width: parent.width - Commons.Style.space(20)
                            height: searchLoader.item ? searchLoader.item.implicitHeight : Commons.Style.spacing.controlHeight
                            Text {
                                textFormat: Text.PlainText
                                anchors.left: parent.left
                                anchors.leftMargin: Commons.Style.space(10)
                                anchors.verticalCenter: parent.verticalCenter
                                z: 1
                                text: ""
                                color: Kit.Palette.muted
                                font.family: Kit.Palette.fontFamily
                                font.pixelSize: Commons.Style.font.iconSmall
                            }
                            // Built only while open: a live text field watches
                            // the clipboard, and a hidden one has no business to.
                            Loader {
                                id: searchLoader
                                anchors.fill: parent
                                active: root.opened
                                sourceComponent: Ui.TextField {
                                    id: searchField
                                    objectName: "settings:search"
                                    horizontalPadding: Commons.Style.space(28)
                                    placeholderText: root.strings.t("settings.search")
                                    maximumLength: 256
                                    foreground: Kit.Palette.foreground
                                    accent: Kit.Palette.accent
                                    font.family: Kit.Palette.fontFamily
                                    Component.onCompleted: { text = root.searchQuery; root.searchInput = searchField }
                                    Component.onDestruction: { root.searchFocused = false; if (root.searchInput === searchField) root.searchInput = null }
                                    onActiveFocusChanged: root.searchFocused = activeFocus
                                    onTextChanged: root.searchQuery = text
                                    // Escape gives the keys back to the page
                                    // rather than closing the window under a
                                    // search; Enter or Down goes to the results.
                                    Keys.onPressed: function(event) {
                                        if (event.key === Qt.Key_Escape) {
                                            if (text !== "") text = ""
                                            root.navTakeFocus(); event.accepted = true
                                        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Down) {
                                            root.navTakeFocus(); root.navMove(1); event.accepted = true
                                        }
                                    }
                                }
                            }
                        }
                        Flickable {
                            anchors.top: searchBox.bottom
                            anchors.topMargin: Commons.Style.space(12)
                            anchors.bottom: parent.bottom
                            anchors.bottomMargin: Commons.Style.space(12)
                            x: Commons.Style.space(10)
                            width: parent.width - Commons.Style.space(20)
                            clip: true
                            contentWidth: width
                            contentHeight: blocks.implicitHeight
                            boundsBehavior: Flickable.StopAtBounds
                            Column {
                                id: blocks
                                width: parent.width
                                spacing: Commons.Style.space(11)
                                Repeater {
                                    model: Nav.blocks
                                    Column {
                                        id: block
                                        required property var modelData
                                        required property int index
                                        readonly property bool shows: modelData.items.some(function(item) { return root.pageShows(item.tab) })
                                        width: blocks.width
                                        visible: shows
                                        spacing: Commons.Style.space(2)
                                        Text {
                                            textFormat: Text.PlainText
                                            visible: block.modelData.title !== ""
                                            leftPadding: Commons.Style.space(11)
                                            bottomPadding: Commons.Style.space(2)
                                            text: block.modelData.title ? root.strings.t(block.modelData.title) : ""
                                            color: Kit.Palette.muted
                                            font.family: Kit.Palette.fontFamily
                                            font.pixelSize: Commons.Style.font.caption
                                            font.bold: true
                                            font.capitalization: Font.AllUppercase
                                            font.letterSpacing: Commons.Style.space(1)
                                        }
                                        Repeater {
                                            model: block.modelData.items
                                            Rectangle {
                                                id: entry
                                                required property var modelData
                                                readonly property bool selected: root.tab === modelData.tab
                                                readonly property int count: root.matchCounts[modelData.tab] || 0
                                                objectName: "nav:" + modelData.tab
                                                visible: root.pageShows(modelData.tab)
                                                width: block.width
                                                height: Commons.Style.spacing.controlHeight + Commons.Style.space(4)
                                                radius: Kit.Palette.chipRadius
                                                color: selected ? Kit.Palette.accent : (entryMouse.containsMouse ? Kit.Palette.hover : "transparent")
                                                Behavior on color { ColorAnimation { duration: Commons.Style.duration(90); easing.type: Easing.OutCubic } }
                                                MouseArea {
                                                    id: entryMouse
                                                    anchors.fill: parent
                                                    hoverEnabled: true
                                                    cursorShape: Qt.PointingHandCursor
                                                    onClicked: { root.tab = entry.modelData.tab; root.navTakeFocus() }
                                                }
                                                // A fixed column for the glyph, centred in it, so
                                                // every label starts at the same x.
                                                Item {
                                                    id: glyphColumn
                                                    x: Commons.Style.space(8)
                                                    width: Commons.Style.space(24); height: parent.height
                                                    Text {
                                                        textFormat: Text.PlainText
                                                        anchors.centerIn: parent
                                                        text: entry.modelData.icon
                                                        color: entry.selected ? Kit.Palette.onAccent : Kit.Palette.muted
                                                        font.family: Kit.Palette.fontFamily
                                                        font.pixelSize: Commons.Style.font.body
                                                    }
                                                }
                                                Text {
                                                    textFormat: Text.PlainText
                                                    anchors.left: glyphColumn.right
                                                    anchors.leftMargin: Commons.Style.space(9)
                                                    anchors.right: countText.left
                                                    anchors.rightMargin: Commons.Style.space(8)
                                                    anchors.verticalCenter: parent.verticalCenter
                                                    text: root.pageTitle(entry.modelData.tab)
                                                    elide: Text.ElideRight
                                                    color: entry.selected ? Kit.Palette.onAccent : Kit.Palette.foreground
                                                    font.family: Kit.Palette.fontFamily
                                                    font.pixelSize: Commons.Style.font.subtitle
                                                    font.bold: true
                                                }
                                                Text {
                                                    id: countText
                                                    textFormat: Text.PlainText
                                                    anchors.right: parent.right
                                                    anchors.rightMargin: Commons.Style.space(11)
                                                    anchors.verticalCenter: parent.verticalCenter
                                                    visible: root.filtering && entry.count > 0
                                                    text: Commons.I18n.formatNumber(entry.count)
                                                    color: entry.selected ? Kit.Palette.onAccent : Kit.Palette.accent
                                                    font.family: Kit.Palette.fontFamily
                                                    font.pixelSize: Commons.Style.font.caption
                                                    font.bold: true
                                                }
                                            }
                                        }
                                        // A rule between blocks, not after the last.
                                        Item {
                                            width: parent.width
                                            height: Commons.Style.space(12)
                                            visible: block.index < Nav.blocks.length - 1 && !root.filtering
                                            Rectangle { anchors.verticalCenter: parent.verticalCenter; width: parent.width; height: Commons.Style.spacing.hairline; color: Kit.Palette.hairline }
                                        }
                                    }
                                }
                                Text {
                                    textFormat: Text.PlainText
                                    width: parent.width
                                    visible: root.filtering && root.visiblePages.length === 0
                                    padding: Commons.Style.space(10)
                                    text: root.strings.t("settings.nothingFound")
                                    wrapMode: Text.WordWrap
                                    color: Kit.Palette.muted
                                    font.family: Kit.Palette.fontFamily
                                    font.pixelSize: Commons.Style.font.caption
                                }
                            }
                        }
                    }
                    Rectangle { id: sidebarRule; anchors.top: headerRule.bottom; anchors.bottom: footerRule.top; anchors.left: sidebar.right; width: Commons.Style.spacing.hairline; color: Kit.Palette.hairline }

                    // ---------------- page -----------------------------------
                    Item {
                        id: pageArea
                        anchors.top: headerRule.bottom
                        anchors.bottom: footerRule.top
                        anchors.left: sidebarRule.right
                        anchors.right: parent.right
                        // The page names itself once, with what it is for.
                        Item {
                            id: pageHead
                            width: parent.width
                            height: Commons.Style.space(64)
                            Row {
                                anchors.left: parent.left
                                anchors.leftMargin: Commons.Style.spacing.panelPadding
                                anchors.right: parent.right
                                anchors.rightMargin: Commons.Style.spacing.panelPadding
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Commons.Style.space(12)
                                Text {
                                    id: pageTitleText
                                    objectName: "settings:page-title"
                                    textFormat: Text.PlainText
                                    text: root.pageTitle(root.tab)
                                    color: Kit.Palette.foreground
                                    font.family: Kit.Palette.fontFamily
                                    font.pixelSize: Commons.Style.font.display
                                    font.bold: true
                                }
                                Text {
                                    textFormat: Text.PlainText
                                    anchors.baseline: pageTitleText.baseline
                                    width: parent.width - pageTitleText.width - parent.spacing
                                    elide: Text.ElideRight
                                    text: root.strings.t("settings.page." + root.tab)
                                    color: Kit.Palette.muted
                                    font.family: Kit.Palette.fontFamily
                                    font.pixelSize: Commons.Style.font.caption
                                    font.bold: true
                                }
                            }
                        }
                        Rectangle { id: pageRule; anchors.top: pageHead.bottom; width: parent.width; height: Commons.Style.spacing.hairline; color: Kit.Palette.hairline }
                        // The clip runs a gutter outside the page and the page
                        // sits back in by it, so a cursor band reaching into
                        // the margin is not cut flush with the words.
                        Flickable {
                            id: bodyScroll
                            readonly property real gutter: Math.min(Commons.Style.space(10), Commons.Style.spacing.panelPadding)
                            anchors.top: pageRule.bottom
                            anchors.bottom: parent.bottom
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.margins: Commons.Style.spacing.panelPadding - gutter
                            clip: true
                            contentWidth: width
                            contentHeight: page.implicitHeight + gutter * 2
                            boundsBehavior: Flickable.StopAtBounds
                            flickableDirection: Flickable.VerticalFlick
                            function reveal(item) {
                                var p = item.mapToItem(bodyScroll.contentItem, 0, 0)
                                if (p.y < contentY) contentY = Math.max(0, p.y - gutter)
                                else if (p.y + item.height > contentY + height) contentY = Math.max(0, Math.min(contentHeight - height, p.y + item.height + gutter - height))
                            }
                            Column {
                                id: page
                                x: bodyScroll.gutter
                                y: bodyScroll.gutter
                                width: bodyScroll.width - bodyScroll.gutter * 2
                                spacing: Commons.Style.space(26)
                                // Said once, at the top of whatever page is open.
                                Rectangle {
                                    width: parent.width
                                    visible: !root.config.valid
                                    implicitHeight: invalidText.implicitHeight + Commons.Style.space(24)
                                    height: visible ? implicitHeight : 0
                                    radius: Kit.Palette.cardRadius
                                    color: Qt.rgba(Kit.Palette.urgent.r, Kit.Palette.urgent.g, Kit.Palette.urgent.b, 0.12)
                                    border.width: Commons.Style.spacing.hairline
                                    border.color: Kit.Palette.urgent
                                    Text {
                                        id: invalidText
                                        textFormat: Text.PlainText
                                        x: Commons.Style.space(14)
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: parent.width - Commons.Style.space(28)
                                        wrapMode: Text.WordWrap
                                        text: root.strings.t("settings.invalidFile")
                                        color: Kit.Palette.foreground
                                        font.family: Kit.Palette.fontFamily
                                        font.pixelSize: Commons.Style.font.body
                                    }
                                }
                                // Everything reset from the changed view: its rows
                                // stay, unmarked, until it is left.
                                Text {
                                    objectName: "settings:changed-none"
                                    textFormat: Text.PlainText
                                    width: parent.width
                                    visible: root.changedOnly && root.changedCount === 0
                                    text: root.strings.t("settings.changedNoneNote")
                                    wrapMode: Text.WordWrap
                                    color: Kit.Palette.muted
                                    font.family: Kit.Palette.fontFamily
                                    font.pixelSize: Commons.Style.font.body
                                }
                                Text {
                                    textFormat: Text.PlainText
                                    width: parent.width
                                    visible: root.filtering && !root.pageShows(root.tab)
                                    text: root.strings.t("settings.nothingFound")
                                    wrapMode: Text.WordWrap
                                    color: Kit.Palette.muted
                                    font.family: Kit.Palette.fontFamily
                                    font.pixelSize: Commons.Style.font.body
                                }
                                MonitorControls {
                                    width: parent.width
                                    // In the changed view, one monitor leaves nothing to choose.
                                    visible: root.tab === "Position" && !searchEmpty && !(root.changedOnly && root.monitors.length <= 1)
                                    nav: root
                                    strings: root.strings; monitors: root.monitors
                                    monitor: root.monitor; allMonitors: root.allMonitors
                                    onMonitorSelected: function(value) { root.monitor = value }
                                    onAllMonitorsSelected: function(value) { root.allMonitors = value }
                                }
                                SettingsTabContent {
                                    width: parent.width
                                    opened: root.opened; tab: root.tab
                                    nav: root
                                    host: root.host; config: root.config; strings: root.strings
                                    monitors: root.monitors; monitor: root.monitor
                                    primary: root.primary; allMonitors: root.allMonitors
                                    onResetRequested: root.askReset()
                                }
                            }
                        }
                        // A thin indicator rather than a scrollbar to aim at:
                        // the wheel, the keys and a drag all scroll the page.
                        Rectangle {
                            visible: bodyScroll.contentHeight > bodyScroll.height + 1
                            anchors.right: parent.right
                            anchors.rightMargin: Commons.Style.space(4)
                            y: bodyScroll.y + bodyScroll.visibleArea.yPosition * bodyScroll.height
                            width: Commons.Style.space(3)
                            height: Math.max(Commons.Style.space(24), bodyScroll.visibleArea.heightRatio * bodyScroll.height)
                            radius: width / 2
                            color: Kit.Palette.shade(bodyScroll.moving ? 0.35 : 0.18)
                        }
                    }

                    // ---------------- key legend -----------------------------
                    Rectangle { id: footerRule; anchors.bottom: footer.top; width: parent.width; height: Commons.Style.spacing.hairline; color: Kit.Palette.hairline }
                    Rectangle {
                        id: footer
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: Commons.Style.spacing.controlHeight + Commons.Style.space(4)
                        radius: card.radius
                        color: Kit.Palette.chrome
                        Rectangle { anchors.top: parent.top; width: parent.width; height: parent.radius; color: parent.color; visible: parent.radius > 0 }
                        // What the keys do here: the cursor's row first, then
                        // what always applies.
                        Row {
                            id: legendRow
                            anchors.left: parent.left
                            anchors.leftMargin: Commons.Style.spacing.panelPadding
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Commons.Style.space(18)
                            Repeater {
                                model: root.legend
                                Row {
                                    id: legendKey
                                    required property var modelData
                                    spacing: Commons.Style.space(5)
                                    Repeater {
                                        model: legendKey.modelData.keys
                                        Kit.KeyCap {
                                            required property var modelData
                                            // A cap leaving with an old legend has no parent.
                                            anchors.verticalCenter: parent ? parent.verticalCenter : undefined
                                            key: modelData
                                        }
                                    }
                                    Text {
                                        textFormat: Text.PlainText
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: root.strings.t(legendKey.modelData.label)
                                        color: Kit.Palette.muted
                                        font.family: Kit.Palette.fontFamily
                                        font.pixelSize: Commons.Style.font.caption
                                        font.bold: true
                                    }
                                }
                            }
                        }
                        Text {
                            objectName: "settings:status"
                            textFormat: Text.PlainText
                            anchors.right: parent.right
                            anchors.rightMargin: Commons.Style.spacing.panelPadding
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(0, parent.width - legendRow.width - Commons.Style.spacing.panelPadding * 2 - Commons.Style.space(18))
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideMiddle
                            visible: root.config.message.length > 0
                            text: root.config.message ? root.strings.t(root.config.message).arg(root.config.messageDetail.slice(0, 4096)) : ""
                            color: root.messageFailed ? Kit.Palette.urgent : Kit.Palette.muted
                            font.family: Kit.Palette.fontFamily
                            font.pixelSize: Commons.Style.font.caption
                            font.bold: true
                        }
                    }
                }
                Ui.ConfirmDialog {
                    id: resetDialog
                    anchors.fill: parent
                    z: 100
                    message: Form.safe(root.strings.t("settings.resetConfirm"))
                    cancelText: Form.safe(root.strings.t("settings.cancel"))
                    confirmText: Form.safe(root.strings.t("settings.reset"))
                    background: Kit.Palette.background
                    foreground: Kit.Palette.foreground
                    fontFamily: Kit.Palette.fontFamily
                    onCanceled: { opened = false; root.navTakeFocus() }
                    onConfirmed: { opened = false; root.config.resetDefaults(); root.navTakeFocus() }
                }
                // An import that would add shell commands shows them first.
                Kit.ChoiceDialog {
                    id: importDialog
                    objectName: "settings:importCommands"
                    anchors.fill: parent
                    z: 100
                    opened: !!root.config.importReview
                    message: root.strings.t("settings.importCommands")
                    entries: root.config.importReview ? Writes.reviewEntries(root.config.importReview.commands, function(key) { return root.strings.t(key) }) : []
                    choices: [{text: root.strings.t("settings.cancel")}, {text: root.strings.t("settings.importCommands.skip")},
                        {text: root.strings.t("settings.importCommands.all"), destructive: true}]
                    background: Kit.Palette.background
                    foreground: Kit.Palette.foreground
                    fontFamily: Kit.Palette.fontFamily
                    onOpenedChanged: if (opened) root.navTakeFocus()
                    onCanceled: { root.config.finishImport("cancel"); root.navTakeFocus() }
                    onChosen: function(index) { root.config.finishImport(["cancel", "skip", "all"][index]); root.navTakeFocus() }
                }
            }
        }
    }
}
