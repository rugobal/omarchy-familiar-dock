import QtQuick
import Quickshell
import "Cleanup.js" as Logic
Item {
    readonly property string stateHome: Quickshell.env("HOME")
    Component.onDestruction: Quickshell.execDetached(["bash", "-c", Logic.script, "familiar-dock-cleanup", stateHome])
}
