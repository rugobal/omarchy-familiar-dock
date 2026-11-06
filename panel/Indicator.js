.pragma library

// Upstream _drawRunningIndicator geometry, expressed as portable primitives.
function marks(style, count, width, height, edge, size, focused) {
    var n = Math.min(4, Math.max(0, count))
    if (!n || width <= 0 || height <= 0) return []
    var horizontal = edge === "TOP" || edge === "BOTTOM"
    var length = horizontal ? width : height
    size = Math.min(size, horizontal ? height : width)
    var result = [], gap = Math.ceil(length / 18)
    function rect(at, span, round, shade) {
        span = Math.max(0, Math.min(span, length - at))
        result.push({x: horizontal ? at : edge === "RIGHT" ? width - size : 0,
            y: horizontal ? edge === "BOTTOM" ? height - size : 0 : at,
            width: horizontal ? span : size, height: horizontal ? size : span,
            radius: round ? size / 2 : 0, shade: shade || 1})
    }
    if (style === "SOLID" || (style === "METRO" && n === 1)) rect(0, length)
    else if (style === "METRO") {
        var black = length / 48, dark = length * (focused ? 2 : 10) / 48
        rect(0, length - black - dark)
        rect(length - black - dark, black, false, 0.3)
        rect(length - dark, dark, false, 0.7)
    } else if (style === "CILIORA") {
        var bar = Math.max(0, length - 2 * size * (n - 1))
        rect(0, bar)
        for (var c = 1; c < n; c++) rect(bar + size + (c - 1) * size * 2, size)
    } else {
        var span = style === "DOTS" || style === "SQUARES" ? size
            : style === "DASHES" ? Math.max(1, Math.floor(length / 4) - gap)
            : Math.ceil((length - (n - 1) * gap) / n)
        var start = style === "SEGMENTED" ? 0 : Math.floor((length - n * span - (n - 1) * gap) / 2)
        for (var i = 0; i < n; i++) rect(start + i * (span + gap), span, style === "DOTS")
    }
    return result
}
function colorKey(count, focused, override, different) {
    if (!override) return ""
    return "dot-color-" + (!focused && different ? "unfocused-" : "") + Math.min(4, Math.max(1, count))
}
