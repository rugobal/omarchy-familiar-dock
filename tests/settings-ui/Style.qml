pragma Singleton
import QtQuick
QtObject {
    // Deterministic theme tokens only. The controls themselves are copied
    // unchanged from the installed qs.Ui; no shell services are loaded.
    property var font: ({family:"sans-serif", body:14, bodySmall:12, caption:12, title:18, subtitle:16, heading:16, display:24, icon:16, iconSmall:12})
    property var spacing: ({md:8, huge:16, xs:4, xxs:2, hairline:1, controlHeight:36, controlPaddingX:10, controlPaddingY:6, controlGap:6, labelGap:4, rowPaddingX:10, popupRowHeight:32, dropdownWidth:240, searchableDropdownWidth:240, searchablePopupMinHeight:160, numberFieldWidth:120, inputPaddingY:6, panelPadding:18})
    property var styleOverrides: ({})
    property int cornerRadius: 4
    property bool reduceMotion: true
    property int normalBorderWidth: 1
    property int hoverBorderWidth: 1
    property int selectedBorderWidth: 1
    property int focusBorderWidth: 1
    property real normalBorderAlpha: 0.3
    property real hoverBorderAlpha: 0.4
    property real selectedBorderAlpha: 1
    property real focusBorderAlpha: 1
    property var easeOut: [0.2,0,0,1,1,1]
    function space(n) { return n }
    function duration(n) { return 0 }
    function normalStateColor(f,a,u) { return f }
    function selectedStateColor(f,a,u) { return a }
    function hoverStateColor(f,a,u) { return f }
    function focusStateColor(f,a,u) { return a }
    function normalFillFor(f,a) { return "transparent" }
    function selectedFillFor(f,a) { return "transparent" }
    function pressedFillFor(f,a) { return "transparent" }
    function hoverFillFor(f,a) { return "transparent" }
    function focusFillFor(f,a) { return "transparent" }
    function selectionFillFor(f,a) { return a }
    function controlFill(f,h,fg,a) { return "transparent" }
}
