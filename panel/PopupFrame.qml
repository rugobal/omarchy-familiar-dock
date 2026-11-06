import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs.Commons as Commons
import "PopupGeometry.js" as Geometry
import "Hover.js" as HoverLogic

// Edge anchoring, focus/outside dismissal and motion shared by all panel popups.
PopupWindow {
    id: root
    required property var panelWindow
    property Item targetItem: null
    property Item focusTarget: holder
    property bool opened: false
    property bool interactive: true
    property bool immediate: false
    property int animationTime: 180
    property bool reserveHover: false
    readonly property real hoverClearance: reserveHover && targetItem && "popupClearance" in targetItem ? targetItem.popupClearance : 0
    onHoverClearanceChanged: anchor.updateAnchor()
    property color backgroundColor: Commons.Color.menu.background
    readonly property bool containsMouse: hover.hovered
    default property alias contents: holder.data
    signal dismissed()
    function close() { opened = false; dismissed() }
    visible: (opened || card.opacity > 0) && !panelWindow.fullscreenBlocked && panelWindow.visible
    color: "transparent"
    grabFocus: interactive && opened
    mask: Region { item: root.opened ? card : null }
    onOpenedChanged: if (opened) Qt.callLater(function() { root.focusTarget.forceActiveFocus() })
    HyprlandFocusGrab {
        active: root.opened && root.interactive
        windows: [root, root.panelWindow]
        onCleared: root.close()
    }
    anchor {
        window: root.panelWindow
        adjustment: PopupAdjustment.Slide
        edges: Edges.Top | Edges.Left
        gravity: Edges.Bottom | Edges.Right
        rect.width: 1; rect.height: 1
        onAnchoring: {
            var target = root.targetItem || root.panelWindow.contentItem
            var offset = Geometry.position(root.panelWindow.edge, target.width, target.height, root.implicitWidth, root.implicitHeight, 4 + root.hoverClearance)
            var point = root.panelWindow.contentItem.mapFromItem(target, offset.x, offset.y)
            root.anchor.rect.x = Math.round(point.x)
            root.anchor.rect.y = Math.round(point.y)
        }
    }
    Rectangle {
        id: card
        anchors.fill: parent
        radius: root.panelWindow.config.get("global-border-radius") * 4
        color: root.backgroundColor
        border.width: 1; border.color: Commons.Color.menu.border
        opacity: root.opened ? 1 : 0
        scale: 0.97 + opacity * 0.03
        Behavior on opacity {
            enabled: !root.immediate
            NumberAnimation { duration: Commons.Style.duration(Math.min(HoverLogic.maxMotion, root.opened ? root.animationTime : Math.min(120, root.animationTime))); easing.type: Easing.OutCubic }
        }
        Item {
            id: holder
            anchors.fill: parent
            focus: true
            LayoutMirroring.enabled: Commons.I18n.rightToLeft
            LayoutMirroring.childrenInherit: true
            Keys.onEscapePressed: root.close()
        }
        HoverHandler { id: hover }
    }
}
