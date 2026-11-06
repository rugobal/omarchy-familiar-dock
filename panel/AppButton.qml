pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Effects
import qs.Commons as Commons
import "Layout.js" as Geometry
import "Hover.js" as HoverLogic
import "../services/Config.js" as ConfigLogic

Item {
    id: root
    required property var taskbar
    required property var config
    required property var actions
    required property var appModel
    required property var panelWindow
    property int slotIndex: 0
    readonly property var hoverMotion: taskbar.hoverTransform(slotIndex)
    readonly property real neighborOffset: taskbar.hoverOffset(slotIndex, geometry.icon, config.get("appicon-margin"), geometry.padding)
    property real neighborPosition: neighborOffset
    property real hoverZoom: Math.max(0.95, hoverMotion.zoom)
    property real hoverTravel: hoverMotion.travel + geometry.icon * Math.max(0, hoverZoom - 1) / 2
    // How much wider the icon is drawn than at rest, as it glides.
    readonly property real growth: geometry.icon * (hoverZoom - 1)
    Behavior on neighborPosition { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
    Behavior on hoverTravel { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
    Behavior on hoverZoom { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
    readonly property var iconSample: app ? panelWindow.host.iconColors.sample(app.appKey, iconSource, grayscale) : null
    readonly property color dominant: iconSample && iconSample.dominant ? iconSample.dominant : Commons.Color.accent
    readonly property var badge: app ? (panelWindow.host.badges[app.appKey.replace(/\.desktop$/, "")] || {}) : ({})
    readonly property bool urgent: !!app && (app.windows.some(function(w) { return w.urgent }) || badge.urgent === true)
    onUrgentChanged: if (!urgent) urgentTilt = 0
    property real urgentTilt: 0
    SequentialAnimation on urgentTilt {
        running: root.urgent && Commons.Style.duration(1) > 0
        loops: Animation.Infinite
        NumberAnimation { to: -10; duration: Commons.Style.duration(160); easing.type: Easing.OutCubic }
        NumberAnimation { to: 10; duration: Commons.Style.duration(160); easing.type: Easing.OutCubic }
        NumberAnimation { to: 0; duration: Commons.Style.duration(160); easing.type: Easing.OutCubic }
        PauseAnimation { duration: Commons.Style.duration(300) }
    }
    property var app: null
    property bool vertical: false
    property int thickness: 45
    readonly property bool labeled: !!app && !config.get("group-apps") && app.windows.length > 0
    readonly property var geometry: Geometry.iconGeometry(thickness, config.get("appicon-margin"), config.get("appicon-padding"))
    // Measure an unconstrained line. Text's implicit width under wrapping/elision
    // can depend on its height, which is allocated from this slot's span.
    readonly property real labelLength: labeled ? (config.get("group-apps-use-fixed-width") ? config.get("group-apps-label-max-width") : Math.min(config.get("group-apps-label-max-width"), titleMetrics.advanceWidth)) : 0
    readonly property real span: geometry.button + (labeled ? labelLength + geometry.padding : 0)
    readonly property real popupClearance: HoverLogic.clearance(config.settings, thickness, geometry.icon, vertical ? width : height)
    implicitWidth: vertical ? thickness : span
    implicitHeight: vertical ? span : thickness
    function cssColor(key, alpha) {
        var c = ConfigLogic.parseColor(config.get(key))
        return c ? Qt.rgba(c[0], c[1], c[2], c[3] * (alpha === undefined ? 1 : alpha)) : "transparent"
    }
    property bool appeared: false
    readonly property bool hovered: mouse.containsMouse || (!!app && panelWindow.hoveredButton === app.key)
    readonly property string iconSource: appModel.iconFor(app, config.get("appicon-style"))
    readonly property bool grayscale: config.get("appicon-style") === "GRAYSCALE"
    readonly property string samplingKey: JSON.stringify([app ? app.appKey : "", iconSource, grayscale, config.get("icon-contrast-outline"), config.get("dot-color-dominant"), config.get("focus-highlight-dominant"), panelWindow.host.iconColors.generation])
    readonly property real outlineAlpha: app ? panelWindow.host.outlineAlpha(app.appKey, iconSource, grayscale, panelWindow.backgroundHex) : 0
    onSamplingKeyChanged: {
        if (app && (config.get("icon-contrast-outline") || config.get("dot-color-dominant") || config.get("focus-highlight-dominant"))) panelWindow.host.iconColors.ensure(app.appKey, iconSource, grayscale)
    }
    function highlight(key, role, alpha) {
        if (!panelWindow.themeMode || Object.prototype.hasOwnProperty.call(config.raw, key)) return cssColor(key, alpha)
        return Qt.rgba(role.r, role.g, role.b, alpha === undefined ? role.a : role.a * alpha)
    }
    // A dragged button leaves its place to its ghost. It comes back at once,
    // not with the launch fade below, so the slot it lands in never shows empty.
    readonly property bool dragHidden: !!taskbar.dragState && !!app && taskbar.dragState.key === app.key
    // This button's face at rest, for the drag's ghost and landing room.
    function dragFace() {
        return {x: body.x, y: body.y, width: body.width, height: body.height,
            icon: iconSource, iconX: icon.x, iconY: icon.y, iconSize: geometry.icon,
            grayscale: grayscale, outline: outlineAlpha,
            title: labeled ? title.text : "", titleX: title.x, titleY: title.y,
            titleWidth: title.width, titleHeight: title.height, titleColor: title.color, wrap: title.wrapMode,
            fontFamily: title.font.family, fontSize: title.font.pixelSize, fontWeight: title.font.weight,
            dominant: config.get("dot-color-dominant") ? dominant : Commons.Color.bar.text,
            count: app ? app.windows.length : 0, focused: !!app && app.focused, ungrouped: labeled}
    }
    opacity: appeared ? 1 : (config.get("animate-window-launch") ? 0 : 1)
    scale: appeared || !config.get("animate-window-launch") ? 1 : 0.95
    Behavior on opacity { NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic } }
    Behavior on scale { NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic } }
    Component.onCompleted: appeared = true
    TextMetrics { id: titleMetrics; font: title.font; text: title.text }
    // PLANK's spread moves the whole button, its pointer area with it, so a
    // click lands on the icon drawn under the pointer.
    transform: Translate { x: root.vertical ? 0 : root.neighborPosition; y: root.vertical ? root.neighborPosition : 0 }
    Item {
        id: body
        visible: !root.dragHidden
        objectName: "body"
        Behavior on x { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
        Behavior on y { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
        x: root.vertical ? 0 : root.config.get("appicon-margin")
        y: root.vertical ? root.config.get("appicon-margin") : 0
        width: root.width - (root.vertical ? 0 : root.config.get("appicon-margin") * 2)
        height: root.height - (root.vertical ? root.config.get("appicon-margin") * 2 : 0)
        Rectangle {
            anchors.fill: parent
            color: root.highlight("focus-highlight-color", root.config.get("focus-highlight-dominant") ? root.dominant : Commons.Color.accent, root.config.get("focus-highlight-opacity") / 100)
            opacity: root.app && root.app.focused && root.config.get("focus-highlight") ? 1 : 0
            Behavior on opacity {
                enabled: root.config.get("animate-app-switch")
                NumberAnimation { duration: Commons.Style.duration(180); easing.type: Easing.OutCubic }
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: root.config.get("highlight-appicon-hover-border-radius")
            color: root.config.get("highlight-appicon-hover") && root.hovered
                ? root.highlight(mouse.pressed ? "highlight-appicon-pressed-background-color" : "highlight-appicon-hover-background-color", Commons.Color.bar.text, mouse.pressed ? 0.18 : 0.1) : "transparent"
        }
        Image {
            id: icon
            x: root.vertical ? (body.width - width) / 2 : root.geometry.padding
            y: root.vertical ? root.geometry.padding : (body.height - height) / 2
            width: root.geometry.icon; height: width
            scale: root.hoverZoom
            rotation: root.hoverMotion.rotation + root.urgentTilt
            transform: Translate {
                x: root.vertical ? (root.panelWindow.edge === "LEFT" ? root.hoverTravel : -root.hoverTravel) : 0
                y: root.vertical ? 0 : (root.panelWindow.edge === "TOP" ? root.hoverTravel : -root.hoverTravel)
            }
            Behavior on scale { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
            Behavior on rotation { NumberAnimation { duration: Commons.Style.duration(root.hoverMotion.duration); easing.type: Easing.OutCubic } }
            sourceSize: Qt.size(width * 2, height * 2)
            source: root.iconSource
            asynchronous: true
            fillMode: Image.PreserveAspectFit
            mipmap: true
            layer.enabled: root.grayscale || root.outlineAlpha > 0
            layer.effect: MultiEffect {
                saturation: root.grayscale ? -1 : 0
                shadowEnabled: root.outlineAlpha > 0
                shadowColor: Commons.Color.bar.text
                shadowOpacity: root.outlineAlpha
                shadowHorizontalOffset: 0; shadowVerticalOffset: 0
                shadowScale: 1 + 2 / Math.max(1, icon.width)
                shadowBlur: 0.05
            }
        }
        Text {
            id: title
            textFormat: Text.PlainText
            visible: root.labeled
            text: root.app ? String(root.app.title).slice(0, 512) : ""
            x: root.vertical ? (body.width - width) / 2 : icon.x + icon.width + root.geometry.padding
            y: root.vertical ? icon.y + icon.height + root.geometry.padding : (body.height - height) / 2
            width: root.vertical ? root.thickness - 4 : root.labelLength
            height: root.vertical ? root.labelLength + root.geometry.padding : implicitHeight
            wrapMode: root.vertical ? Text.WrapAnywhere : Text.NoWrap
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
            color: root.highlight(root.app && root.app.windows.length && root.app.windows[0].minimized ? "group-apps-label-font-color-minimized" : "group-apps-label-font-color", Commons.Color.bar.text)
            font.family: Commons.Style.font.family
            font.pixelSize: root.config.get("group-apps-label-font-size")
            font.weight: ({inherit: Font.Normal, normal: Font.Normal, lighter: Font.Light, bold: Font.Bold, bolder: Font.ExtraBold})[root.config.get("group-apps-label-font-weight")]
        }
        Indicator {
            anchors.fill: parent
            config: root.config
            dominant: root.config.get("dot-color-dominant") ? root.dominant : Commons.Color.bar.text
            count: root.app ? root.app.windows.length : 0
            focused: !!root.app && root.app.focused
            ungrouped: root.labeled
        }
    }
    Loader {
        visible: !root.dragHidden
        active: root.panelWindow.overlayShown && root.slotIndex < 10
        anchors.right: parent.right; anchors.top: parent.top
        sourceComponent: Rectangle {
            implicitWidth: 18; implicitHeight: 18; radius: 4; color: Commons.Color.menu.background
            Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: String((root.slotIndex + 1) % 10); color: Commons.Color.menu.text; font.pixelSize: 12 }
        }
    }
    Loader {
        visible: !root.dragHidden
        active: root.config.get("progress-show-count") && root.badge["count-visible"] === true && root.badge.count > 0
        anchors.right: parent.right; anchors.top: parent.top
        sourceComponent: Rectangle {
            implicitWidth: Math.max(18, badgeText.implicitWidth + 8); implicitHeight: 18; radius: 9; color: Commons.Color.accent
            Text { id: badgeText; textFormat: Text.PlainText; anchors.centerIn: parent; text: root.badge.count > 999 ? Commons.I18n.formatNumber(999) + "+" : Commons.I18n.formatNumber(root.badge.count); color: Commons.Color.bar.background; font.pixelSize: 12 }
        }
    }
    Loader {
        visible: !root.dragHidden
        active: root.config.get("progress-show-bar") && root.badge["progress-visible"] === true
        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
        height: 3
        sourceComponent: Rectangle {
            color: Commons.Color.menu.background
            Rectangle { width: parent.width * (root.badge.progress || 0); height: parent.height; color: Commons.Color.accent }
        }
    }
    MouseArea {
        id: mouse
        // Magnified icons spread apart or crowd together. Each pointer area
        // reaches halfway to its neighbors' drawn edges (Taskbar.hitReach),
        // so every spot on the taskbar belongs to the nearest icon.
        readonly property var reach: root.taskbar.hitReach(root.slotIndex)
        x: root.vertical ? 0 : -reach.before
        y: root.vertical ? -reach.before : 0
        width: root.vertical ? root.width : Math.max(0, root.width + reach.before + reach.after)
        height: root.vertical ? Math.max(0, root.height + reach.before + reach.after) : root.height
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
        onEntered: if (!root.taskbar.dragging && root.app) root.panelWindow.hoverTarget(root.taskbar.items.findIndex(function(i) { return i.key === root.app.key }))
        // Qt 6 delivers the next button's enter before this button's exit, so
        // only clear the hover while this button still owns it.
        onExited: if (!reorderDrag.active && root.app && root.panelWindow.hoveredButton === root.app.key) root.panelWindow.unhover()
        onWheel: function(event) {
            if (root.app) root.panelWindow.scroll(String(root.taskbar.items.findIndex(function(i) { return i.key === root.app.key })), event.angleDelta.y || event.angleDelta.x)
            event.accepted = true
        }
        cursorShape: root.taskbar.dragging ? Qt.ClosedHandCursor : Qt.PointingHandCursor
        onClicked: function(event) {
            if (!root.app || reorderDrag.active || root.taskbar.dragging) return
            var mods = []
            if (event.modifiers & Qt.ShiftModifier) mods.push("shift")
            if (event.modifiers & Qt.ControlModifier) mods.push("ctrl")
            root.panelWindow.clickItem(root.taskbar.items.findIndex(function(i) { return i.key === root.app.key }),
                event.button === Qt.RightButton ? "right" : event.button === Qt.MiddleButton ? "middle" : "left", mods.join(","))
        }
    }
    DragHandler {
        id: reorderDrag
        target: null
        acceptedButtons: Qt.LeftButton
        enabled: !root.config.get("taskbar-locked") && !!root.app && !!root.app.desktopEntry && !root.panelWindow.host.settingsOpen
        cursorShape: active ? Qt.ClosedHandCursor : Qt.PointingHandCursor
        onActiveChanged: {
            if (active) root.taskbar.beginDrag(root, centroid.scenePressPosition, centroid.scenePosition)
            else root.taskbar.finishDrag(false)
        }
        onCentroidChanged: if (active) root.taskbar.moveDrag(centroid.scenePosition)
        onCanceled: root.taskbar.finishDrag(true)
    }
    Tooltip {
        panelWindow: root.panelWindow
        targetItem: root
        text: root.app ? String(root.app.name).slice(0, 256) : ""
        edge: root.panelWindow.edge
        hovered: root.hovered
        enabled: !root.taskbar.dragging && root.config.get("show-tooltip") && !root.panelWindow.previewShown
    }
}
