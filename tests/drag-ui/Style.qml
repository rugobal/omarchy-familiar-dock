pragma Singleton
import QtQuick
// Deterministic tokens. `motion` scales every duration: 0 lands at once.
QtObject {
    property var font: ({family: "sans-serif"})
    property int cornerRadius: 4
    property real motion: 0
    function space(n) { return Math.max(1, Math.round(n)) }
    function spaceReal(n) { return n }
    function duration(n) { return Math.round(n * motion) }
}
