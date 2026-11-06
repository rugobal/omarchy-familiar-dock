pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons as Commons
import "../services/Chord.js" as Chord
import "FormModel.js" as Form
import "ui" as Kit

// A key combination, set by pressing it: the keys as caps, a click (or
// Enter on the row) to record new ones, and what holds the key now. While
// recording, the key service pauses Hyprland's own bindings so a taken
// combination such as Super+Tab reaches this window instead of its action.
Item {
    id: root
    required property var strings
    // The stored combination, "" for none.
    property string value: ""
    property string defaultValue: ""
    // The key service (services/AppsKey.qml), or null (tests, no shell).
    property var service: null
    property bool interactive: true
    property bool armed: false
    readonly property bool recording: armed
    property string hint: ""
    signal picked(string chord)
    signal finished()
    implicitWidth: Commons.Style.space(320)
    implicitHeight: column.implicitHeight

    function record() {
        if (!interactive) return
        hint = ""
        armed = true
        catcher.forceActiveFocus()
        if (service) service.pause()
        stopTimer.restart()
    }
    function stop() {
        if (!armed) return
        armed = false
        stopTimer.stop()
        if (service) service.resume()
        finished()
    }
    // Recording never outlives its window, its focus or ten seconds.
    Timer { id: stopTimer; interval: 10000; onTriggered: root.stop() }
    Component.onDestruction: if (armed && service) service.resume()
    Connections {
        target: root.service
        // Escape, a reload or anything else gave Hyprland its bindings back.
        function onPausedChanged() { if (root.armed && root.service && !root.service.paused) root.stop() }
    }

    Item {
        id: catcher
        width: 0; height: 0
        onActiveFocusChanged: if (!activeFocus && root.armed) root.stop()
        Keys.onPressed: function(event) {
            if (!root.armed) return
            event.accepted = true
            if (event.isAutoRepeat) return
            var held = event.modifiers & (Qt.MetaModifier | Qt.ControlModifier | Qt.AltModifier | Qt.ShiftModifier)
            if (event.key === Qt.Key_Escape && !held) { root.stop(); return }
            if ((event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) && !held) { root.stop(); root.picked(""); return }
            var result = Chord.fromQt(event.key, event.modifiers, event.nativeScanCode)
            if (result.chord) { root.stop(); root.picked(result.chord); return }
            if (result.reason !== "modifier") root.hint = result.reason === "hold" ? "settings.hotkey.hold" : "settings.hotkey.unsupported"
        }
    }

    readonly property string statusKey: {
        var s = service ? service.status : null
        if (recording) return hint || "settings.hotkey.recordingHint"
        // Turned off, but the reload that gives the old key back failed.
        if (!value) return s && s.key === "" && s.error ? "settings.hotkey.failed" : "settings.hotkey.offNote"
        if (!s || s.key !== value) return ""
        if (s.error) return "settings.hotkey.failed"
        if (s.state === "plugin") return "settings.hotkey.active"
        if (s.state === "custom") return s.userFile ? "settings.hotkey.userFile" : "settings.hotkey.inUse"
        if (s.state === "none" && value === defaultValue) return "settings.hotkey.unbound"
        return ""
    }
    readonly property string status: {
        if (!statusKey) return ""
        var s = service ? service.status : null
        var text = strings.t(statusKey)
        if (statusKey === "settings.hotkey.userFile") text = text.replace("%1", String(s.userFile).replace(/^.*\/\.config\//, "~/.config/")).replace("%2", s.holder || "")
        else if (statusKey === "settings.hotkey.inUse") text = text.replace("%1", s.holder || strings.t("settings.hotkey.another"))
        else if (statusKey === "settings.hotkey.failed") text = text.replace("%1", s.error)
        return Form.safe(text)
    }
    readonly property bool warning: ["settings.hotkey.userFile", "settings.hotkey.inUse", "settings.hotkey.failed",
        "settings.hotkey.hold", "settings.hotkey.unsupported"].indexOf(statusKey) >= 0

    Column {
        id: column
        width: root.width
        spacing: Commons.Style.space(6)
        Row {
            anchors.right: parent.right
            spacing: Commons.Style.space(8)
            Rectangle {
                id: keysBox
                objectName: "hotkey-keys"
                anchors.verticalCenter: parent.verticalCenter
                implicitWidth: keyRow.implicitWidth + Commons.Style.space(16)
                implicitHeight: Commons.Style.space(30)
                radius: Kit.Palette.chipRadius
                color: box.containsMouse && root.interactive ? Kit.Palette.tint(0.14) : "transparent"
                border.width: Commons.Style.spacing.hairline
                border.color: root.recording ? Kit.Palette.accent : Kit.Palette.shade(0.28)
                Row {
                    id: keyRow
                    anchors.centerIn: parent
                    spacing: Commons.Style.space(4)
                    Repeater {
                        model: root.recording ? [] : Chord.caps(root.value)
                        Kit.KeyCap { required property string modelData; key: modelData }
                    }
                    Text {
                        textFormat: Text.PlainText
                        visible: root.recording || !root.value
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.strings.t(root.recording ? "settings.hotkey.recording" : "settings.hotkey.off")
                        color: root.recording ? Kit.Palette.accent : Kit.Palette.muted
                        font.family: Kit.Palette.fontFamily
                        font.pixelSize: Commons.Style.font.caption
                        font.bold: root.recording
                    }
                }
                MouseArea {
                    id: box
                    anchors.fill: parent
                    hoverEnabled: true
                    enabled: root.interactive
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.recording ? root.stop() : root.record()
                }
            }
            Kit.Chip {
                objectName: "hotkey-off"
                anchors.verticalCenter: parent.verticalCenter
                visible: !!root.value && !root.recording
                enabled: root.interactive
                text: root.strings.t("settings.hotkey.turnOff")
                onClicked: root.picked("")
            }
        }
        Text {
            objectName: "hotkey-status"
            textFormat: Text.PlainText
            width: parent.width
            visible: text.length > 0
            horizontalAlignment: Text.AlignRight
            text: root.status
            wrapMode: Text.WordWrap
            color: root.warning ? Kit.Palette.urgent : Kit.Palette.muted
            font.family: Kit.Palette.fontFamily
            font.pixelSize: Commons.Style.font.caption
        }
    }
}
