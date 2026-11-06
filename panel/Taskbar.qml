pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Effects
import qs.Commons as Commons
import "../services/AppModel.js" as Logic
import "../services/Config.js" as ConfigLogic
import "Hover.js" as HoverLogic
import "Layout.js" as Geometry
import "DragLayout.js" as DragLayout

Flickable {
    id: root
    required property var config
    required property var actions
    required property var appModel
    required property var panelWindow
    property bool vertical: false
    property int thickness: 45
    readonly property var liveItems: appModel.itemsFor(panelWindow.monitorName, panelWindow.workspaceId, panelWindow.isPrimary, panelWindow.panelCount)
    readonly property var items: dragState ? dragState.items : liveItems
    onLiveItemsChanged: if (dragging && !dragState.committed && JSON.stringify(liveItems.map(function(i) { return i.key })) !== JSON.stringify(dragState.items.map(function(i) { return i.key }))) finishDrag(true)
    readonly property var byKey: {
        var result = Object.create(null)
        items.forEach(function(item) { result[item.key] = item })
        return result
    }
    property int delegateRevision: 0
    readonly property int hoveredIndex: dragging ? -1 : items.findIndex(function(item) { return item.key === panelWindow.hoveredButton })
    readonly property var slotSizes: {
        var revision = delegateRevision, result = []
        for (var i = 0; i < buttons.count; i++) {
            var button = buttons.itemAt(i)
            result.push(button ? (vertical ? button.implicitHeight : button.implicitWidth) : thickness)
        }
        return result
    }
    // A drag works as the top bar's does. The button lifts into an outlined
    // ghost that keeps the point it was grabbed by and slides along the panel.
    // The room it would land in opens with a faint copy of it, and on release
    // the ghost glides into that room.
    property var dragState: null
    // The dragged button's face at rest (AppButton.dragFace), which the ghost
    // and the room draw. It outlives the drag, so neither copy ever reads a
    // cleared face while it goes.
    property var dragFace: null
    property bool settling: false
    // Neighbors and the room slide only while this is set. It is set after
    // a drag's first layout and cleared before its last, so nothing glides
    // in from a stale place when a drag starts or lands.
    property bool slotMotion: false
    readonly property bool dragging: dragState !== null
    readonly property bool dragArmed: !!dragState && !!dragState.armed
    // Pulled this far off the taskbar, letting go puts the button back. This
    // is the top bar's removal distance, so an overshot drop still moves.
    readonly property real cancelDistance: Commons.Style.spaceReal(48)
    readonly property var dragLayout: dragState ? DragLayout.arrange(dragState.sizes, dragState.insertion.order, dragState.source) : null
    function startAt(index) {
        if (dragState && dragLayout && index !== dragState.source && index < items.length) return dragLayout.starts[index]
        return (dragState ? dragState.sizes : slotSizes).slice(0, index).reduce(function(a,b) { return a+b }, 0)
    }
    function beginDrag(button, press, point) {
        if (dragging || config.get("taskbar-locked") || panelWindow.host.settingsOpen) return
        var source = button.slotIndex, face = button.dragFace()
        panelWindow.unhover(); panelWindow.closePreview(true)
        // Window coordinates: the surface widens and narrows under a
        // macOS-style row, and the window never moves.
        var home = button.mapToItem(null, face.x, face.y), grab = press
        // How far into its slot the button was grabbed, along the panel.
        var into = button.mapFromItem(null, press.x, press.y)
        settleTimer.stop()
        settling = false
        slotMotion = false
        dragFace = face
        dragState = {source: source, key: button.app.key, appKey: button.app.appKey,
            sizes: slotSizes.slice(), items: items.slice(), insertion: DragLayout.rest(items, source),
            home: {x: home.x, y: home.y}, press: {x: grab.x, y: grab.y}, grab: vertical ? into.y : into.x, armed: false}
        moveDrag(point)
        slotMotion = true
    }
    function moveDrag(point) {
        if (!dragging || settling) return
        var local = mapFromItem(null, point.x, point.y)
        var next = Object.assign({}, dragState)
        next.armed = DragLayout.pulledOff(local, width, height, cancelDistance)
        // The ghost's center picks the room, wherever the button was grabbed.
        var center = (vertical ? local.y + contentY : local.x + contentX) - next.grab + next.sizes[next.source] / 2
        next.insertion = next.armed ? DragLayout.rest(next.items, next.source) : DragLayout.insertion(next.items, next.sizes, next.source,
            center, config.get("favorites"), next.insertion.index)
        dragState = next
        var at = DragLayout.follow(next.home, next.press, point, vertical)
        placeGhost(ghost.parent.mapFromItem(null, at.x, at.y))
    }
    function placeGhost(at) {
        ghost.x = Math.max(0, Math.min(ghost.parent.width - ghost.width, at.x))
        ghost.y = Math.max(0, Math.min(ghost.parent.height - ghost.height, at.y))
    }
    // Where the dragged button's face sits in the room the drag holds open.
    function landing() {
        // A binding can ask before the layout of a drag just begun is out.
        if (!dragLayout || !dragFace) return Qt.point(0, 0)
        return slots.mapToItem(ghost.parent, vertical ? dragFace.x : dragLayout.placeholder + dragFace.x,
            vertical ? dragLayout.placeholder + dragFace.y : dragFace.y)
    }
    function finishDrag(cancel) {
        // A landing already being written can't be called back.
        if (!dragging || dragState.committed) return
        if (settling && !cancel) return
        settling = true
        var accepted = !cancel && !dragState.armed && !config.get("taskbar-locked")
        var next = Object.assign({}, dragState, {accepted: accepted, armed: false})
        if (!accepted) next.insertion = DragLayout.rest(next.items, next.source)
        dragState = next
        placeGhost(landing())
        settleTimer.restart()
    }
    function endDrag() {
        settleTimer.stop(); writeWait.stop()
        slotMotion = false
        dragState = null; settling = false
    }
    Timer {
        id: settleTimer
        interval: Commons.Style.duration(180)
        onTriggered: {
            var state = root.dragState
            if (!root.settling) return
            // Back where it started: nothing is written, and a running app
            // that isn't pinned stays unpinned.
            if (state && state.accepted && !state.insertion.stays) {
                // Among the running apps it only moves, and stays unpinned.
                // Committed first, so the model's change isn't taken for a
                // window coming or going mid-drag.
                if (!state.insertion.pin) {
                    root.dragState = Object.assign({}, state, {committed: true})
                    root.appModel.moveRunning(state.appKey, state.insertion.runBefore)
                    root.endDrag()
                    return
                }
                var expected = ConfigLogic.reorderFavorites(root.config.get("favorites"), state.appKey, state.insertion.before)
                if (JSON.stringify(expected) === JSON.stringify(root.config.get("favorites"))) { root.endDrag(); return }
                root.dragState = Object.assign({}, state, {committed: true, expected: expected})
                root.reorder(state.appKey, state.insertion.before)
                writeWait.restart()
            } else root.endDrag()
        }
    }
    // Keep the ghost in its landing slot until the asynchronous atomic writer
    // publishes the reordered model; there must be no flash back to the source.
    Connections {
        target: root.config
        function onSettingsChanged() {
            if (root.dragging && root.dragState.committed && JSON.stringify(root.config.get("favorites")) === JSON.stringify(root.dragState.expected)) Qt.callLater(root.endDrag)
        }
    }
    Timer { id: writeWait; interval: 500; onTriggered: root.endDrag() }
    // The outline the top bar draws round a dragged widget and its room
    // (RoomOutline), filled like the panel.
    component DragOutline: Rectangle {
        anchors.fill: parent
        anchors.margins: Commons.Style.space(1)
        color: Qt.rgba(root.panelWindow.backgroundColor.r, root.panelWindow.backgroundColor.g, root.panelWindow.backgroundColor.b, root.panelWindow.dynamicOpacity)
        border.width: 1
        border.color: Commons.Color.bar.text
        radius: Math.min(Commons.Style.cornerRadius, Math.min(width, height) / 2)
    }
    // A copy of the dragged button's face, as it looks at rest.
    component DragFace: Item {
        id: face
        readonly property var spec: root.dragFace
        width: spec.width; height: spec.height
        Indicator {
            anchors.fill: parent
            config: root.config
            dominant: face.spec.dominant; count: face.spec.count
            focused: face.spec.focused; ungrouped: face.spec.ungrouped
        }
        Image {
            id: faceIcon
            x: face.spec.iconX; y: face.spec.iconY
            width: face.spec.iconSize; height: width
            source: face.spec.icon
            sourceSize: Qt.size(width * 2, height * 2)
            fillMode: Image.PreserveAspectFit
            mipmap: true
            layer.enabled: face.spec.grayscale || face.spec.outline > 0
            layer.effect: MultiEffect {
                saturation: face.spec.grayscale ? -1 : 0
                shadowEnabled: face.spec.outline > 0
                shadowColor: Commons.Color.bar.text
                shadowOpacity: face.spec.outline
                shadowHorizontalOffset: 0; shadowVerticalOffset: 0
                shadowScale: 1 + 2 / Math.max(1, faceIcon.width); shadowBlur: 0.05
            }
        }
        Text {
            textFormat: Text.PlainText
            visible: face.spec.title !== ""
            text: face.spec.title
            x: face.spec.titleX; y: face.spec.titleY
            width: face.spec.titleWidth; height: face.spec.titleHeight
            wrapMode: face.spec.wrap
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
            color: face.spec.titleColor
            font.family: face.spec.fontFamily
            font.pixelSize: face.spec.fontSize
            font.weight: face.spec.fontWeight
        }
    }
    // The room the drag holds open where the button would land, with a faint
    // copy of it in it, as the top bar's DragSpacer has.
    Item {
        id: room
        parent: root.panelWindow.dragSurface
        z: 999
        visible: root.dragging
        readonly property point at: root.dragging ? root.landing() : Qt.point(0, 0)
        x: at.x; y: at.y
        width: root.dragFace ? root.dragFace.width : 0
        height: root.dragFace ? root.dragFace.height : 0
        Behavior on x { enabled: root.slotMotion; NumberAnimation { duration: Commons.Style.duration(160); easing.type: Easing.OutCubic } }
        Behavior on y { enabled: root.slotMotion; NumberAnimation { duration: Commons.Style.duration(160); easing.type: Easing.OutCubic } }
        DragOutline { opacity: 0.32 }
        Loader { active: root.dragging; sourceComponent: DragFace { opacity: 0.22 } }
    }
    // The dragged button, outlined. Pulled far enough off the taskbar that
    // letting go puts it back, it shrinks and dims as the top bar's does.
    Item {
        id: ghost
        parent: root.panelWindow.dragSurface
        z: 1000
        visible: root.dragging
        width: root.dragFace ? root.dragFace.width : 0
        height: root.dragFace ? root.dragFace.height : 0
        scale: root.dragArmed ? 0.82 : 1
        opacity: root.dragArmed ? 0.55 : 1
        Behavior on scale { NumberAnimation { duration: Commons.Style.duration(140); easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: Commons.Style.duration(140); easing.type: Easing.OutCubic } }
        Behavior on x { enabled: root.settling; NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic } }
        Behavior on y { enabled: root.settling; NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic } }
        DragOutline { opacity: 0.94 }
        Loader { active: root.dragging; sourceComponent: DragFace { opacity: 0.84 } }
    }
    // Where the pointer is along the slots. RIPPLE and PLANK follow it, as in
    // Dash to Panel; an IPC hover has no pointer, so it stands at the center
    // of the hovered slot. -1 while neither applies, or during a drag.
    readonly property real pointerAlong: {
        if (dragging) return -1
        if (pointer.hovered) return vertical ? pointer.point.position.y : pointer.point.position.x
        return hoveredIndex >= 0 && hoveredIndex < slotSizes.length ? startAt(hoveredIndex) + slotSizes[hoveredIndex] / 2 : -1
    }
    function slotSize(index) { return index < slotSizes.length ? slotSizes[index] : thickness }
    function pointerDifference(index) {
        return pointerAlong < 0 ? null : pointerAlong - startAt(index) - slotSize(index) / 2
    }
    // macOS-style Plank lays the row out as a whole (HoverLogic.dock): the
    // icons make exactly the room they grow by. The pointer comes from the
    // whole panel, so Show Apps, when it sits next to the taskbar, joins the
    // row (panelWindow.dockShowApps, in this taskbar's parent's coordinates).
    readonly property bool macos: HoverLogic.macos(config.settings)
    readonly property real iconSize: Geometry.iconGeometry(thickness, config.get("appicon-margin"), config.get("appicon-padding")).icon
    readonly property var joined: macos && panelWindow.dockShowApps ? panelWindow.dockShowApps : null
    readonly property int dockOffset: joined && joined.side === "before" ? 1 : 0
    readonly property real origin: vertical ? y - contentY : x - contentX
    readonly property var dockSlots: {
        var list = []
        for (var i = 0; i < slotSizes.length; i++) list.push({start: origin + startAt(i), size: slotSizes[i], icon: iconSize})
        if (joined) {
            var apps = {start: joined.start, size: joined.size, icon: joined.icon}
            if (joined.side === "before") list.unshift(apps)
            else list.push(apps)
        }
        return list
    }
    readonly property var dockPointer: {
        if (!macos || dragging) return null
        var p = panelWindow.dockPointer
        if (p !== null && p !== undefined) return p
        return hoveredIndex >= 0 && hoveredIndex < slotSizes.length ? origin + startAt(hoveredIndex) + slotSizes[hoveredIndex] / 2 : null
    }
    readonly property var dock: HoverLogic.dock(config.settings, dockSlots, dockPointer)
    function hoverTransform(index) {
        if (macos) return HoverLogic.transform(config.settings, dock.level[index + dockOffset] || 0, thickness,
            dockPointer !== null && dockPointer > origin + startAt(index) + slotSize(index) / 2 ? -1 : 1)
        var difference = pointerDifference(index)
        return HoverLogic.transform(config.settings, HoverLogic.level(config.settings, index === hoveredIndex, difference, slotSize(index)),
            thickness, difference !== null && difference > 0 ? -1 : 1)
    }
    function hoverOffset(index, icon, margin, padding) {
        var shift = macos ? dock.shift[index + dockOffset] || 0 : HoverLogic.stretch(config.settings, pointerDifference(index), slotSize(index))
        if (!shift) return 0
        var center = panelWindow.longMargins.start + panelWindow.alongPadding + panelWindow.placement("taskbar").start +
            startAt(index) - (vertical ? contentY : contentX) + margin + padding + icon / 2
        var extent = vertical ? panelWindow.monitorRect.height : panelWindow.monitorRect.width
        return HoverLogic.limitOffset(shift, center, icon * hoverTransform(index).zoom, extent)
    }
    // Where button `index` is drawn now, as it glides: its shift from its
    // slot and how much its icon has grown.
    function drawnAt(index) {
        var revision = delegateRevision
        var button = index >= 0 && index < buttons.count ? buttons.itemAt(index) : null
        return button ? {shift: button.neighborPosition, growth: button.growth} : {shift: 0, growth: 0}
    }
    // How far a button's pointer area reaches past its slot on each side.
    // Each slot, grown by its icon's growth, is drawn where it has moved;
    // neighbors split the gap or overlap between them halfway. So the spots
    // PLANK's spread opens still belong to the nearer icon, and macOS-style
    // rows, which tile exactly, get exactly their grown boxes.
    function hitReach(index) {
        if (index < 0 || index >= buttons.count) return {before: 0, after: 0}
        var own = drawnAt(index), before = own.growth / 2, after = own.growth / 2
        if (index > 0) {
            var previous = drawnAt(index - 1)
            before = (own.shift - previous.shift) / 2 + (own.growth - previous.growth) / 4
        }
        if (index + 1 < buttons.count) {
            var next = drawnAt(index + 1)
            after = (next.shift - own.shift) / 2 + (own.growth - next.growth) / 4
        }
        return {before: before, after: after}
    }
    readonly property real naturalLength: vertical ? slots.implicitHeight : slots.implicitWidth
    implicitWidth: vertical ? thickness : naturalLength
    implicitHeight: vertical ? naturalLength : thickness
    contentWidth: vertical ? width : slots.implicitWidth
    contentHeight: vertical ? slots.implicitHeight : height
    clip: false
    boundsBehavior: Flickable.StopAtBounds
    interactive: !dragging
    flickableDirection: vertical ? Flickable.VerticalFlick : Flickable.HorizontalFlick
    // A move keeps every delegate, so nothing else tells slotSizes that the
    // buttons it measured have changed places.
    onItemsChanged: { Logic.syncModel(stableModel, items.map(function(item) { return item.key })); delegateRevision++ }
    Component.onCompleted: Logic.syncModel(stableModel, items.map(function(item) { return item.key }))
    ListModel { id: stableModel }
    Item {
        id: slots
        implicitWidth: root.vertical ? root.thickness : root.startAt(buttons.count)
        implicitHeight: root.vertical ? root.startAt(buttons.count) : root.thickness
        HoverHandler { id: pointer }
        Repeater {
            id: buttons
            model: stableModel
            onItemAdded: root.delegateRevision++
            onItemRemoved: root.delegateRevision++
            AppButton {
                required property string key
                required property int index
                slotIndex: index
                Behavior on x { enabled: root.slotMotion; NumberAnimation { duration: Commons.Style.duration(160); easing.type: Easing.OutCubic } }
                Behavior on y { enabled: root.slotMotion; NumberAnimation { duration: Commons.Style.duration(160); easing.type: Easing.OutCubic } }
                x: root.vertical ? 0 : root.startAt(index)
                y: root.vertical ? root.startAt(index) : 0
                taskbar: root
                config: root.config
                actions: root.actions
                appModel: root.appModel
                panelWindow: root.panelWindow
                app: root.byKey[key] || null
                vertical: root.vertical
                thickness: root.thickness
                width: implicitWidth
                height: implicitHeight
            }
        }
    }
    function buttonFor(key) {
        for (var i = 0; i < buttons.count; i++) {
            var button = buttons.itemAt(i)
            if (button && button.key === key) return button
        }
        return null
    }
    function outlinedIcons() {
        var out = []
        for (var i = 0; i < buttons.count; i++) {
            var button = buttons.itemAt(i)
            if (button && button.app && button.outlineAlpha > 0 && out.indexOf(button.app.appKey) < 0) out.push(button.app.appKey)
        }
        return out
    }
    function reorderAt(id, target, after) {
        var pins = config.get("favorites")
        var before = target
        if (after) before = pins[pins.indexOf(target) + 1] || ""
        if (id === target) return
        reorder(id, before)
    }
    function reorder(id, beforeId) {
        if (config.get("taskbar-locked")) return
        config.setFavorites(ConfigLogic.reorderFavorites(config.get("favorites"), id, beforeId))
    }
}
