// Drives the real Taskbar and AppButton with synthesized mouse drags, offscreen,
// against stand-ins for the panel, the settings writer and the app model.
import QtQuick
import QtTest
import qs.Commons as Commons
import "panel"
import "services/Config.js" as ConfigLogic

Item {
    id: top
    width: 700; height: 260
    property var warnings: []
    QtObject {
        id: config
        property var settings: ConfigLogic.validate({favorites: ["a", "b", "c", "d"], "animate-appicon-hover": false})
        property var raw: ({})
        property var writes: []
        property var pending: null
        function get(key) { return settings[key] }
        function setFavorites(list) { writes = writes.concat([list]); pending = list; writer.restart() }
    }
    // The real writer is asynchronous: publish a moment later.
    Timer { id: writer; interval: 40; onTriggered: config.settings = ConfigLogic.validate({favorites: config.pending, "animate-appicon-hover": false}) }
    QtObject {
        id: appModel
        // Ungrouped, pin a shows as its three windows side by side.
        property bool ungroupA: false
        // Running apps that aren't pinned follow the pins, one window each.
        property var running: []
        function moveRunning(key, before) {
            var out = running.filter(function(k) { return k !== key })
            var at = before ? out.indexOf(before) : -1
            out.splice(at < 0 ? out.length : at, 0, key)
            running = out
        }
        function itemsFor() {
            var list = []
            config.settings.favorites.forEach(function(k) {
                if (k === "a" && ungroupA) [1, 2, 3].forEach(function(n) {
                    list.push({key: "window:a" + n, appKey: k, desktopEntry: {id: k}, name: k, icon: k, title: "A" + n,
                        windows: [{address: "a" + n, title: "A" + n, activated: false, minimized: false, monitor: "DP-1"}],
                        isFavorite: true, focused: false})
                })
                else list.push({key: "app:" + k, appKey: k, desktopEntry: {id: k}, name: k, icon: k, title: "",
                    windows: k === "b" ? [{address: "1", title: "B", activated: false, minimized: false, monitor: "DP-1"}] : [],
                    isFavorite: true, focused: false})
            })
            running.forEach(function(k) {
                if (config.settings.favorites.indexOf(k) < 0) list.push({key: "app:" + k, appKey: k, desktopEntry: {id: k}, name: k, icon: k,
                    title: "", windows: [{address: "r" + k, title: k.toUpperCase(), activated: false, minimized: false, monitor: "DP-1"}],
                    isFavorite: false, focused: false})
            })
            return list
        }
        function iconFor(app) { return app ? Qt.resolvedUrl("icon-" + app.appKey + ".svg") : "" }
    }
    QtObject {
        id: iconColors
        property int generation: 0
        function sample() { return null }
        function ensure() {}
    }
    QtObject {
        id: host
        property var iconColors: iconColors
        property var badges: ({})
        function outlineAlpha() { return 0 }
    }
    Item {
        id: panelWindow
        anchors.fill: parent
        property string monitorName: "DP-1"
        property int workspaceId: 1
        property bool isPrimary: true
        property int panelCount: 1
        property string hoveredButton: ""
        property string edge: "BOTTOM"
        property var longMargins: ({start: 0})
        property real alongPadding: 0
        property var monitorRect: ({x: 0, y: 0, width: 700, height: 260})
        property bool overlayShown: false
        property bool themeMode: true
        property bool previewShown: false
        property color backgroundColor: "#202020"
        property real dynamicOpacity: 0.9
        property string backgroundHex: "#202020"
        property var host: host
        readonly property Item dragSurface: surface
        // As the panel provides them for a macOS-style row: the pointer
        // along the taskbar's parent, and Show Apps when it joins the row.
        property var dockShowApps: null
        readonly property var dockPointer: dockHover.hovered ? dockHover.point.position.x : null
        // Where the taskbar sits on the monitor: 80 into a surface 40 from its edge.
        function placement() { return {start: 120, length: 400} }
        function unhover() { hoveredButton = "" }
        function closePreview() {}
        function hoverTarget(i) {}
        function scroll() {}
        function clickItem() {}
        Rectangle {
            id: surface
            x: 40; y: 200; width: 600; height: 45
            color: "#202020"
            HoverHandler { id: dockHover }
            Taskbar {
                id: tasks
                x: 80
                width: implicitWidth; height: implicitHeight
                config: config; actions: ({}); appModel: appModel; panelWindow: panelWindow
                thickness: 45
            }
        }
    }
    function ghost() { for (var i = 0; i < surface.children.length; i++) if (surface.children[i].z === 1000) return surface.children[i]; return null }
    function room() { for (var i = 0; i < surface.children.length; i++) if (surface.children[i].z === 999) return surface.children[i]; return null }
    function body(button) { for (var i = 0; i < button.children.length; i++) if (button.children[i].objectName === "body") return button.children[i]; return null }
    TestCase {
        name: "TaskbarDrag"
        when: windowShown
        function init() {
            Commons.Style.motion = 0
            appModel.ungroupA = false
            appModel.running = []
            config.settings = ConfigLogic.validate({favorites: ["a", "b", "c", "d"], "animate-appicon-hover": false})
            panelWindow.dockShowApps = null
            config.writes = []
            tryCompare(tasks, "dragging", false)
            tryVerify(function() { return tasks.buttonFor("app:d") !== null })
        }
        function press(button, dx) {
            var p = button.mapToItem(top, dx, button.height / 2)
            mousePress(top, p.x, p.y, Qt.LeftButton)
            return p
        }
        function drag(from, toX, toY) {
            var steps = 12
            for (var i = 1; i <= steps; i++) mouseMove(top, from.x + (toX - from.x) * i / steps, from.y + (toY - from.y) * i / steps, 5, Qt.LeftButton)
        }
        function test_1_grab_offset_row_and_drop() {
            var b = tasks.buttonFor("app:b"), c = tasks.buttonFor("app:c")
            var slot = b.width
            var start = press(b, 10)
            mouseMove(top, start.x + 4, start.y, 5, Qt.LeftButton)
            drag({x: start.x + 4, y: start.y}, start.x + 30, start.y - 20)
            verify(tasks.dragging, "drag started")
            var g = ghost(), r = room()
            var home = b.mapToItem(surface, tasks.dragFace.x, tasks.dragFace.y)
            // Keeps the grab offset along the panel and stays in its row.
            fuzzyCompare(g.x, home.x + 30, 1.01)
            compare(g.y, home.y)
            compare(g.width, tasks.dragFace.width); compare(g.height, 45)
            verify(!body(b).visible, "source face hidden while dragged")
            // Past c's center: the room opens where c was.
            drag({x: start.x + 30, y: start.y - 20}, start.x + slot * 1.2, start.y)
            compare(tasks.dragState.insertion.index, 2)
            tryVerify(function() { return Math.abs(r.x - (tasks.mapToItem(surface, tasks.dragLayout.placeholder + tasks.dragFace.x, 0).x)) < 1 })
            mouseRelease(top, start.x + slot * 1.2, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "c", "b", "d"]))
            var landed = tasks.buttonFor("app:b")
            verify(body(landed).visible)
            compare(landed.x, tasks.startAt(2))
            compare(landed.opacity, 1)
        }
        function test_2_pulled_off_cancels() {
            var b = tasks.buttonFor("app:b")
            var start = press(b, 20)
            drag(start, start.x + b.width * 1.2, start.y)
            verify(tasks.dragging)
            compare(tasks.dragArmed, false)
            drag({x: start.x + b.width * 1.2, y: start.y}, start.x + b.width * 1.2, start.y - 22 - 60)
            compare(tasks.dragArmed, true)
            compare(tasks.dragState.insertion.index, 1, "room goes home while armed")
            tryCompare(ghost(), "scale", 0.82)
            mouseRelease(top, start.x + b.width * 1.2, start.y - 82, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(config.writes.length, 0)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "b", "c", "d"]))
        }
        function test_3_overshoot_still_drops() {
            var b = tasks.buttonFor("app:b"), c = tasks.buttonFor("app:c")
            var start = press(b, 20)
            // Just past c's center, 30 px above the panel: within the limit.
            var to = c.mapToItem(top, c.width / 2 + 5, -30)
            drag(start, to.x, to.y)
            verify(tasks.dragging)
            compare(tasks.dragArmed, false)
            compare(tasks.dragState.insertion.index, 2)
            mouseRelease(top, to.x, to.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "c", "b", "d"]))
        }
        function test_4_with_motion_landing_does_not_slide_or_fade() {
            Commons.Style.motion = 1
            var b = tasks.buttonFor("app:b")
            var start = press(b, 20)
            drag(start, start.x + b.width * 2.2, start.y)
            verify(tasks.dragging)
            wait(200)
            mouseRelease(top, start.x + b.width * 2.2, start.y, Qt.LeftButton)
            // The ghost glides into the room before anything is written.
            verify(tasks.settling)
            compare(config.writes.length, 0)
            tryVerify(function() { return config.writes.length === 1 }, 1000)
            verify(tasks.dragging, "ghost holds the room while the write is out")
            tryCompare(tasks, "dragging", false, 2000)
            // The frame the drag ends, the button is already in its slot, shown.
            var landed = tasks.buttonFor("app:b")
            compare(landed.slotIndex, 3)
            compare(landed.x, tasks.startAt(3))
            verify(body(landed).visible)
            compare(landed.opacity, 1)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "c", "d", "b"]))
        }
        function test_5_new_drag_right_after_landing_survives() {
            Commons.Style.motion = 1
            var a = tasks.buttonFor("app:a")
            var start = press(a, 20)
            drag(start, start.x + a.width * 1.2, start.y)
            mouseRelease(top, start.x + a.width * 1.2, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            var c = tasks.buttonFor("app:c")
            var s2 = press(c, 20)
            drag(s2, s2.x + 40, s2.y)
            verify(tasks.dragging)
            wait(400)
            verify(tasks.dragging, "no stale timer ends the next drag")
            mouseRelease(top, s2.x + 40, s2.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
        }
        // Ungrouped, a window drags its app's other windows along: a nudge
        // keeps its room where it is, and past b the whole run moves, with
        // the room where the window then lands.
        function test_6_ungrouped_window_moves_its_app() {
            appModel.ungroupA = true
            tryVerify(function() { return tasks.buttonFor("window:a2") !== null && tasks.buttonFor("app:a") === null })
            var a2 = tasks.buttonFor("window:a2"), w = a2.width, r
            var homeX = a2.x
            var start = press(a2, w / 2)
            drag(start, start.x + 30, start.y)
            verify(tasks.dragging)
            compare(tasks.dragState.insertion.index, 0, "a nudge leaves the app in place")
            compare(tasks.dragLayout.placeholder, homeX)
            r = room()
            tryVerify(function() { return Math.abs(r.x - tasks.mapToItem(surface, homeX + tasks.dragFace.x, 0).x) < 1 })
            mouseRelease(top, start.x + 30, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(config.writes.length, 0)
            compare(tasks.buttonFor("window:a2").x, homeX, "back where it was")

            Commons.Style.motion = 1
            a2 = tasks.buttonFor("window:a2")
            start = press(a2, w / 2)
            drag(start, start.x + w * 2.2, start.y)
            verify(tasks.dragging)
            compare(tasks.dragState.insertion.index, 1)
            var landingX = tasks.dragLayout.placeholder
            compare(landingX, tasks.dragState.sizes[3] + w, "a2 lands after b and a1")
            compare(tasks.dragLayout.starts[0], tasks.dragState.sizes[3], "a1 moved with it")
            mouseRelease(top, start.x + w * 2.2, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["b", "a", "c", "d"]))
            var landed = tasks.buttonFor("window:a2")
            compare(landed.slotIndex, 2)
            compare(landed.x, landingX, "the window ends where the ghost landed")
            verify(body(landed).visible)
        }
        // A running app that isn't pinned, after another one: past that one
        // the room opens ahead of it, still unpinned, and brought back it can
        // be left where it was, with nothing written. Among the pins it is pinned.
        function test_7_running_app_goes_back_unpinned() {
            appModel.running = ["e", "f"]
            tryVerify(function() { return tasks.buttonFor("app:f") !== null })
            var f = tasks.buttonFor("app:f"), e = tasks.buttonFor("app:e"), w = f.width
            var homeX = f.x
            compare(f.slotIndex, 5)
            var start = press(f, w / 2)
            drag(start, start.x - 20, start.y)
            verify(tasks.dragging)
            compare(tasks.dragState.insertion.index, 5, "a nudge leaves the room at home")
            compare(tasks.dragLayout.placeholder, homeX)
            // Past e's center: the room is ahead of e, right after the pins,
            // and that does not pin it.
            var left = start.x - e.width * 1.25
            drag({x: start.x - 20, y: start.y}, left, start.y)
            compare(tasks.dragState.insertion.index, 4)
            verify(!tasks.dragState.insertion.stays)
            verify(!tasks.dragState.insertion.pin)
            compare(tasks.dragState.insertion.runBefore, "e")
            // Back where it started, without letting go.
            drag({x: left, y: start.y}, start.x + 10, start.y)
            compare(tasks.dragState.insertion.index, 5, "it can go back home")
            verify(tasks.dragState.insertion.stays)
            compare(tasks.dragLayout.placeholder, homeX)
            var r = room()
            tryVerify(function() { return Math.abs(r.x - tasks.mapToItem(surface, homeX + tasks.dragFace.x, 0).x) < 1 })
            mouseRelease(top, start.x + 10, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            wait(100)
            compare(config.writes.length, 0, "nothing written")
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "b", "c", "d"]))
            var landed = tasks.buttonFor("app:f")
            compare(landed.slotIndex, 5)
            compare(landed.x, homeX, "back where it was")
            verify(body(landed).visible)

            start = press(landed, w / 2)
            var d = tasks.buttonFor("app:d"), to = d.mapToItem(top, d.width * 0.3, d.height / 2)
            drag(start, to.x, to.y)
            compare(tasks.dragState.insertion.index, 3)
            compare(tasks.dragState.insertion.before, "d")
            mouseRelease(top, to.x, to.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "b", "c", "f", "d"]))
            compare(tasks.buttonFor("app:f").slotIndex, 3)
        }
        // Running apps that aren't pinned trade places with each other, as
        // in Dash to Panel: nothing is pinned or written, the model keeps the
        // new order, and each lands where its ghost did.
        function test_8_running_apps_trade_places() {
            appModel.running = ["e", "f"]
            tryVerify(function() { return tasks.buttonFor("app:f") !== null })
            var f = tasks.buttonFor("app:f"), e = tasks.buttonFor("app:e"), w = f.width
            var eX = e.x
            var start = press(f, w / 2)
            var to = e.mapToItem(top, e.width * 0.3, e.height / 2)
            drag(start, to.x, to.y)
            compare(tasks.dragState.insertion.index, 4)
            verify(!tasks.dragState.insertion.pin)
            var landingX = tasks.dragLayout.placeholder
            compare(landingX, eX, "the room opens where e was")
            mouseRelease(top, to.x, to.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            wait(100)
            compare(config.writes.length, 0, "the pins are not written")
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "b", "c", "d"]))
            compare(JSON.stringify(appModel.running), JSON.stringify(["f", "e"]))
            var landed = tasks.buttonFor("app:f")
            compare(landed.slotIndex, 4)
            compare(tasks.buttonFor("app:e").slotIndex, 5)
            compare(landed.x, landingX, "f ends where its ghost landed")
            verify(body(landed).visible)

            // And back to the right, past e: last again.
            start = press(landed, w / 2)
            e = tasks.buttonFor("app:e")
            to = e.mapToItem(top, e.width * 0.8, e.height / 2)
            drag(start, to.x, to.y)
            compare(tasks.dragState.insertion.index, 5)
            verify(!tasks.dragState.insertion.pin)
            compare(tasks.dragState.insertion.runBefore, "")
            landingX = tasks.dragLayout.placeholder
            mouseRelease(top, to.x, to.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            wait(100)
            compare(config.writes.length, 0)
            compare(JSON.stringify(appModel.running), JSON.stringify(["e", "f"]))
            compare(tasks.buttonFor("app:f").slotIndex, 5)
            compare(tasks.buttonFor("app:f").x, landingX)
        }
        // PLANK spreads the icons away from the pointer. What the pointer
        // hovers, and so what a click opens, is the icon drawn under it,
        // even in the gaps the spread opens.
        function test_9_plank_hovers_what_it_draws() {
            mouseMove(top, 5, 5)
            config.settings = ConfigLogic.validate({favorites: ["a", "b", "c", "d"], "animate-appicon-hover": true,
                "animate-appicon-hover-animation-type": "PLANK"})
            var b = tasks.buttonFor("app:b"), c = tasks.buttonFor("app:c"), d = tasks.buttonFor("app:d")
            var slot = c.width, cStart = tasks.startAt(2), dStart = tasks.startAt(3)
            compare(c.neighborPosition, 0)
            // A fifth of a slot right of c's center: c gives way to the left,
            // d to the right, b further left; c by 2 * 0.2/(2 + 0.8) slots.
            var p = tasks.mapToItem(top, cStart + slot * 0.7, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return Math.abs(c.neighborPosition + slot * 0.4 / 2.8) < 0.5 })
            verify(d.neighborPosition > 0)
            verify(b.neighborPosition < c.neighborPosition)
            mouseMove(top, p.x + 1, p.y); mouseMove(top, p.x, p.y)
            tryVerify(function() { return c.hovered && !d.hovered && !b.hovered })

            // Just short of d's slot: beyond c's drawn edge and short of d's,
            // but nearer c's, so c still has it.
            p = tasks.mapToItem(top, dStart - slot * 0.05, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return c.neighborPosition < -slot * 0.2 && d.neighborPosition > slot * 0.2 })
            var cEdge = dStart + c.neighborPosition, dEdge = dStart + d.neighborPosition, at = dStart - slot * 0.05
            verify(at > cEdge && at < dEdge, "the pointer is in the gap")
            mouseMove(top, p.x + 1, p.y); mouseMove(top, p.x, p.y)
            tryVerify(function() { return c.hovered && !d.hovered })
            // A little past the middle of the gap, d has it.
            p = tasks.mapToItem(top, dStart + slot * 0.08, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return d.hovered && !c.hovered })

            // Off the taskbar, everything settles back into its slot.
            mouseMove(top, 5, 5)
            tryCompare(c, "neighborPosition", 0)
            tryCompare(d, "neighborPosition", 0)
            verify(!c.hovered && !d.hovered)
        }
        // macOS-style Plank: the icons make exactly the room they grow by,
        // around the pointer, and Show Apps (a slot just before the taskbar)
        // takes part. The pointer always rests on the icon whose slot it's in.
        function test_10_macos_row_makes_room() {
            mouseMove(top, 5, 5)
            panelWindow.dockShowApps = {start: tasks.x - 45, size: 45, icon: 30, side: "before"}
            config.settings = ConfigLogic.validate({favorites: ["a", "b", "c", "d"], "animate-appicon-hover": true,
                "animate-appicon-hover-animation-type": "PLANK", "animate-appicon-hover-macos": true})
            var a = tasks.buttonFor("app:a"), b = tasks.buttonFor("app:b"), c = tasks.buttonFor("app:c"), d = tasks.buttonFor("app:d")
            var slot = c.width, icon = c.geometry.icon
            verify(tasks.macos)
            // Over c's center: c doubles in place, b and d grow by half an
            // icon, a and Show Apps not at all; each makes room for the rest.
            var p = tasks.mapToItem(top, tasks.startAt(2) + slot / 2, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return Math.abs(c.growth - icon) < 0.5 })
            fuzzyCompare(c.neighborPosition, 0, 0.5)
            fuzzyCompare(b.neighborPosition, -icon * 0.75, 0.5)
            fuzzyCompare(d.neighborPosition, icon * 0.75, 0.5)
            fuzzyCompare(a.neighborPosition, -icon, 0.5)
            fuzzyCompare(tasks.dock.level[0], 0, 0.001)
            fuzzyCompare(tasks.dock.shift[0], -icon, 0.5)
            fuzzyCompare(tasks.dock.before, icon, 0.5)
            fuzzyCompare(tasks.dock.after, icon, 0.5)
            // Their pointer areas are exactly their grown boxes, edge to edge.
            for (var i = 0; i < 4; i++) {
                var reach = tasks.hitReach(i), grown = tasks.buttonFor(["app:a", "app:b", "app:c", "app:d"][i]).growth
                fuzzyCompare(reach.before, grown / 2, 0.01); fuzzyCompare(reach.after, grown / 2, 0.01)
            }
            verify(c.hovered && !b.hovered && !d.hovered)
            // Just inside d's slot: d has it, though c has grown toward it.
            p = tasks.mapToItem(top, tasks.startAt(3) + slot * 0.1, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return d.hovered && !c.hovered })
            // Over Show Apps: it magnifies, and the taskbar makes room for it.
            p = tasks.mapToItem(top, -20, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            tryVerify(function() { return tasks.dock.level[0] > 0.9 })
            verify(a.neighborPosition > 0)
            verify(tasks.dock.before > 0)
            // A drag drops the magnification and still lands.
            p = tasks.mapToItem(top, tasks.startAt(1) + slot / 2, tasks.height / 2)
            mouseMove(top, p.x, p.y)
            var start = press(b, b.width / 2)
            drag(start, start.x + slot * 1.2, start.y)
            verify(tasks.dragging)
            tryCompare(c, "neighborPosition", 0)
            compare(tasks.dock.before, 0)
            mouseRelease(top, start.x + slot * 1.2, start.y, Qt.LeftButton)
            tryCompare(tasks, "dragging", false, 2000)
            compare(JSON.stringify(config.settings.favorites), JSON.stringify(["a", "c", "b", "d"]))
            mouseMove(top, 5, 5)
            tryCompare(tasks.buttonFor("app:a"), "neighborPosition", 0)
        }
    }
}
