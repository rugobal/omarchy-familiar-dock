pragma ComponentBehavior: Bound
// Adapted from Omarchy plugins/dock/AppGrid.qml (MIT), see NOTICE.md.
import QtQuick
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Every app on one grid. Type to narrow it, arrows to move, Enter to launch.
Item {
  id: root

  // The shell's keepLoaded menu and service loaders inject the same singleton.
  property var shell: null
  property var service: null
  property var manifest: null
  property string omarchyPath: ""
  readonly property var appLibrary: shell ? shell.appLibrary : null
  readonly property var config: service ? service.configuration : null
  readonly property var actions: service ? service.actions : null
  readonly property var strings: service ? service.strings : null
  readonly property real surfaceRadius: config ? config.get("global-border-radius") * 4 : Commons.Style.cornerRadius
  onServiceChanged: if (service) service.appGrid = root
  Component.onDestruction: if (service && service.appGrid === root) service.appGrid = null

  property bool opened: false
  readonly property string monitorName: panel.targetScreen ? panel.targetScreen.name : ""
  // The app whose menu is open, and where it opened.
  property var menuEntry: null
  property point menuPoint
  property string filterText: ""
  property int selectedIndex: 0
  property var apps: []

  readonly property int iconSize: Math.round(56 * Commons.Style.fontScale)
  readonly property int labelHeight: Math.ceil(labelMetrics.height) * 2
  readonly property int cellGutter: Commons.Style.spacing.sm
  readonly property int cellPadding: Commons.Style.spacing.lg
  readonly property int cellWidth: Math.round(iconSize * 2.2)
  readonly property int cellHeight: cellPadding * 2 + iconSize + Commons.Style.spacing.md + labelHeight
  readonly property int maxColumns: 7
  readonly property int visibleRows: 4
  readonly property int borderWidth: Math.max(1, Commons.Style.space(2))
  readonly property int contentMargin: Commons.Style.spacing.panelPadding
  readonly property int inset: contentMargin + borderWidth
  readonly property int headerHeight: Math.max(Commons.Style.space(36), Commons.Style.font.heading + Commons.Style.spacing.controlPaddingY * 2)
  readonly property int headerSpacing: Commons.Style.spacing.xl
  readonly property int screenMargin: Commons.Style.space(40)

  // The card fits whole columns, and the grid sits centered in it so any
  // leftover width splits evenly on both sides.
  readonly property int cardWidth: Math.min(panel.width - screenMargin * 2, maxColumns * cellWidth + inset * 2)
  readonly property int columns: Math.max(1, Math.floor((cardWidth - inset * 2) / cellWidth))
  readonly property int gridWidth: columns * cellWidth
  readonly property int cardHeight: Math.min(panel.height - screenMargin * 2, inset * 2 + headerHeight + headerSpacing + visibleRows * cellHeight)

  function open() {
    if (!service || !config || !actions) return
    if (!appLibrary) actions.warnMissingLauncher()
    service.closePanelPopups()
    root.selectedIndex = 0
    if (root.appLibrary) root.appLibrary.refreshIcons()
    // The cells from last time are reused when nothing changed, so the grid
    // opens with its icons already drawn.
    if (root.appsStale || root.filterText !== "" || root.apps.length === 0) {
      root.filterText = ""
      root.rebuild()
    } else {
      grid.positionViewAtBeginning()
    }
    root.opened = true
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
    root.menuEntry = null
  }

  function openMenu(entry, point) {
    root.menuEntry = entry
    root.menuPoint = point
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function rebuild() {
    root.appsStale = false
    var rows = root.appLibrary ? root.appLibrary.sortedEntries(root.filterText) : []
    root.apps = rows.map(function(row) { return row.entry })
    root.selectedIndex = Math.max(0, Math.min(root.selectedIndex, root.apps.length - 1))
    grid.positionViewAtBeginning()
  }

  function setFilter(text) {
    root.filterText = String(text).slice(0, 256)
    root.selectedIndex = 0
    root.rebuild()
  }

  function select(delta) {
    if (root.apps.length === 0) return
    root.selectedIndex = Math.max(0, Math.min(root.apps.length - 1, root.selectedIndex + delta))
    grid.positionViewAtIndex(root.selectedIndex, GridView.Contain)
  }

  function launch(index) {
    var entry = root.apps[index]
    if (!entry || !root.actions) return
    root.close()
    root.actions.launch({desktopEntry: entry})
  }

  FontMetrics {
    id: labelMetrics
    font.family: Commons.Style.font.menuFamily
    font.pixelSize: Commons.Style.font.body
  }

  // Apps installed or removed while the grid is closed are picked up when it
  // next opens.
  property bool appsStale: false

  Connections {
    target: root.appLibrary
    function onAppsChanged() {
      if (root.opened) root.rebuild()
      else root.appsStale = true
    }
  }

  OverlayWindow {
    id: panel
    shown: root.opened
    WlrLayershell.namespace: "familiar-dock-apps"
    Rectangle {
      anchors.fill: parent
      color: Commons.Color.menu.scrim
      opacity: 1

      Behavior on opacity {
        id: scrimFade
        NumberAnimation { duration: Commons.Style.duration(scrimFade.targetValue > 0 ? 150 : 100); easing.type: Easing.OutCubic }
      }
    }

    MouseArea {
      anchors.fill: parent
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      onClicked: {
        if (root.menuEntry) root.menuEntry = null
        else root.close()
      }
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      anchors.centerIn: parent
      radius: root.surfaceRadius
      color: Commons.Color.menu.background
      borderSpec: Border.surfaceSpec("menu", "border", Commons.Color.menu.border, root.borderWidth)
      padding: root.contentMargin
      opacity: 1

      Behavior on opacity {
        id: cardFade
        NumberAnimation { duration: Commons.Style.duration(cardFade.targetValue > 0 ? 150 : 100); easing.type: Easing.OutCubic }
      }

      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: root.menuEntry = null
      }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) {
            if (root.menuEntry) root.menuEntry = null
            else if (root.filterText) root.setFilter("")
            else root.close()
          } else if (Commons.Util.editsFilter(event, root.filterText)) {
            root.setFilter(Commons.Util.editedFilter(event, root.filterText))
          } else if (Commons.Util.readingKey(event) === Qt.Key_Left) {
            root.select(-1)
          } else if (Commons.Util.readingKey(event) === Qt.Key_Right) {
            root.select(1)
          } else if (event.key === Qt.Key_Up) {
            root.select(-root.columns)
          } else if (event.key === Qt.Key_Down) {
            root.select(root.columns)
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            root.launch(root.selectedIndex)
          } else if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127) {
            root.setFilter((root.filterText + event.text).slice(0, 256))
          } else {
            return
          }
          event.accepted = true
        }
      }

      Column {
        width: root.gridWidth
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.topMargin: card.contentTopInset
        anchors.bottomMargin: card.contentBottomInset
        spacing: root.headerSpacing

        Rectangle {
          x: root.cellGutter
          width: parent.width - root.cellGutter * 2
          height: root.headerHeight
          radius: Commons.Style.cornerRadius
          color: Commons.Util.alpha(Commons.Color.menu.text, 0.06)

          Text {
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.leftMargin: Commons.Style.spacing.controlPaddingX
            anchors.rightMargin: Commons.Style.spacing.controlPaddingX
            anchors.verticalCenter: parent.verticalCenter
            text: root.filterText.slice(0, 256) || (root.strings ? root.strings.t("apps.search") : "")
            color: Commons.Color.menu.text
            opacity: root.filterText ? 1 : 0.58
            font.family: Commons.Style.font.menuFamily
            font.pixelSize: Commons.Style.font.heading
            elide: Text.ElideRight
          }
        }

        Item {
          width: parent.width
          height: parent.height - root.headerHeight - parent.spacing

          GridView {
            id: grid
            anchors.fill: parent
            model: root.apps
            clip: true
            cellWidth: root.cellWidth
            cellHeight: root.cellHeight
            boundsBehavior: Flickable.StopAtBounds

            delegate: Item {
              id: cell

              required property int index
              required property var modelData
              readonly property bool selected: index === root.selectedIndex

              width: root.cellWidth
              height: root.cellHeight

              Image {
                id: icon
                anchors.horizontalCenter: parent.horizontalCenter
                y: root.cellPadding
                width: root.iconSize
                height: root.iconSize
                sourceSize: Qt.size(root.iconSize * 2, root.iconSize * 2)
                source: root.appLibrary ? root.appLibrary.iconSource(cell.modelData.icon) : ""
                fillMode: Image.PreserveAspectFit
                // Loaded with the cell, from Qt's image cache after the first
                // open, so icons do not pop in after the grid has appeared.
                asynchronous: false
                smooth: true
                mipmap: true
              }

              // The selection marks the app's name, not the whole cell.
              Rectangle {
                anchors.centerIn: label
                width: Math.min(cell.width - root.cellGutter * 2, label.contentWidth + Commons.Style.spacing.md * 2)
                height: label.contentHeight + Commons.Style.spacing.xs * 2
                radius: Commons.Style.cornerRadius
                color: cell.selected ? Commons.Color.menu.selectedBackground : "transparent"
              }

              Text {
                textFormat: Text.PlainText
                id: label
                anchors.top: icon.bottom
                anchors.topMargin: Commons.Style.spacing.md
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width - (root.cellGutter + Commons.Style.spacing.md) * 2
                text: root.appLibrary ? String(root.appLibrary.entryName(cell.modelData)).slice(0, 256) : ""
                color: cell.selected ? Commons.Color.menu.selectedText : Commons.Color.menu.text
                font.family: Commons.Style.font.menuFamily
                font.pixelSize: Commons.Style.font.body
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignTop
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
              }

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                preventStealing: true
                onContainsMouseChanged: if (containsMouse) root.selectedIndex = cell.index
                onClicked: function(event) {
                  if (event.button === Qt.RightButton) {
                    root.openMenu(cell.modelData, cell.mapToItem(panel.contentItem, event.x, event.y))
                    return
                  }
                  root.menuEntry = null
                  root.launch(cell.index)
                }
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            anchors.centerIn: parent
            visible: root.apps.length === 0
            text: root.strings ? root.strings.t("apps.noMatches").arg(root.filterText) : ""
            color: Commons.Color.menu.text
            opacity: 0.7
            font.family: Commons.Style.font.menuFamily
            font.pixelSize: Commons.Style.font.title
          }
        }
      }
    }
    // Right-click on an app: launch it, or pin/unpin it on this taskbar.
    BorderSurface {
      id: menu

      readonly property var entry: root.menuEntry
      readonly property bool pinned: !!entry && !!root.config && root.config.get("favorites").indexOf(String(entry.id || "")) >= 0

      visible: !!entry
      width: Math.max(Commons.Style.space(160), menuColumn.implicitWidth) + padding * 2
      height: menuColumn.implicitHeight + padding * 2
      // Opens along the reading direction from the pointer.
      x: LayoutMirroring.enabled
        ? Math.max(Commons.Style.gapsOut, root.menuPoint.x - width)
        : Math.min(root.menuPoint.x, panel.width - width - Commons.Style.gapsOut)
      y: Math.min(root.menuPoint.y, panel.height - height - Commons.Style.gapsOut)
      radius: root.surfaceRadius
      color: Commons.Color.menu.background
      borderSpec: Border.surfaceSpec("menu", "border", Commons.Color.menu.border, Commons.Style.normalBorderWidth)
      padding: Commons.Style.spacing.sm

      Column {
        id: menuColumn
        x: menu.contentLeftInset
        y: menu.contentTopInset
        width: menu.width - menu.contentLeftInset - menu.contentRightInset

        MenuRow {
          text: root.strings ? root.strings.t("menu.open") : ""
          onTriggered: {
            var entry = menu.entry
            root.close()
            if (entry) root.actions.launch({desktopEntry: entry})
          }
        }

        MenuRow {
          text: root.strings ? root.strings.t(menu.pinned ? "menu.unpin" : "menu.pin") : ""
          onTriggered: {
            if (menu.entry) {
              const id = String(menu.entry.id || "")
              const pins = root.config.get("favorites").filter(function(pin) { return pin !== id })
              if (!menu.pinned) pins.push(id)
              root.config.setFavorites(pins)
            }
            root.menuEntry = null
          }
        }

      }
    }
  }

  component MenuRow: Rectangle {
    id: row

    property string text: ""
    signal triggered()

    width: parent ? parent.width : 0
    height: visible ? Commons.Style.spacing.popupRowHeight : 0
    radius: Commons.Style.cornerRadius
    color: rowMouse.containsMouse ? Commons.Style.hoverFill : "transparent"

    Text {
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.leftMargin: Commons.Style.spacing.controlPaddingX
      text: row.text.slice(0, 512)
      color: Commons.Color.menu.text
      font.family: Commons.Style.font.family
      font.pixelSize: Commons.Style.font.body
    }

    MouseArea {
      id: rowMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: row.triggered()
    }
  }
}
