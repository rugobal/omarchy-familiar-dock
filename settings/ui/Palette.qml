pragma Singleton
import QtQuick
import qs.Commons as Commons

// The colours and shapes the settings window is drawn in. Adapted from
// OmaControl's ui/Palette.qml (MIT, see NOTICE.md): every surface is an alpha
// over the theme's own popup text, so each theme gets the same hierarchy in
// its own colours and nothing here is a colour typed into a page.
QtObject {
    id: palette
    readonly property color foreground: Commons.Color.popups.text
    readonly property color base: Commons.Color.popups.background
    // Popups may be translucent; a window full of text is not.
    readonly property color background: Qt.rgba(base.r, base.g, base.b, 1)
    readonly property color accent: Commons.Color.accent
    readonly property color urgent: Commons.Color.urgent

    function shade(alpha) { return Qt.rgba(foreground.r, foreground.g, foreground.b, alpha) }
    function tint(alpha) { return Qt.rgba(accent.r, accent.g, accent.b, alpha) }

    readonly property color muted: shade(0.6)
    readonly property color hairline: shade(0.16)
    readonly property color hover: shade(0.08)
    // Three surfaces: the window, the sidebar beside it, the cards on it.
    readonly property color surface: shade(0.04)
    readonly property color card: shade(0.03)
    readonly property color divider: shade(0.10)
    // The header strip and the key legend frame the window.
    readonly property color chrome: shade(0.07)

    // Text on an accent fill: measured, since a light accent swallows white.
    readonly property color onAccent: accent.hslLightness > 0.55 ? background : Qt.rgba(1, 1, 1, 0.96)
    function onAccentWash(alpha) { return Qt.rgba(onAccent.r, onAccent.g, onAccent.b, alpha) }

    readonly property string fontFamily: Commons.Style.font.family
    // A floor, not a fixed value: a rounded theme still rounds these more.
    readonly property int cardRadius: Math.max(Commons.Style.space(8), Commons.Style.cornerRadius)
    readonly property int chipRadius: Math.max(Commons.Style.space(6), Commons.Style.cornerRadius)
    readonly property int pillRadius: Commons.Style.space(999)
}
