.pragma library
function panelRect(screen, edge, length, start, thickness, margin) {
    var vertical = edge === "LEFT" || edge === "RIGHT"
    return {x: screen.x + (vertical ? (edge === "RIGHT" ? screen.width - thickness - margin : margin) : start),
        y: screen.y + (vertical ? start : (edge === "BOTTOM" ? screen.height - thickness - margin : margin)),
        width: vertical ? thickness : length, height: vertical ? length : thickness}
}
// The part of `item` that lies inside a window of `width` x `height`, in
// the window's coordinates: the compositor takes input nowhere else. Null
// when none of it does.
function clip(item, width, height) {
    var x = Math.max(0, item.x), y = Math.max(0, item.y)
    var right = Math.min(width, item.x + item.width), bottom = Math.min(height, item.y + item.height)
    return right > x && bottom > y ? {x: x, y: y, width: right - x, height: bottom - y} : null
}
// Where Hyprland put the layer `namespace` on `monitor`, from the parsed
// `hyprctl layers -j`, relative to the monitor's origin `screen` (Hyprland
// reports global positions). Other layers' reserved space can move a layer
// off its edge, so this is asked, never assumed. Null unless exactly one
// such layer has the size Qt was given, so a stale answer never counts.
function layerOrigin(json, monitor, namespace, width, height, screen) {
    var levels = json && json[monitor] && json[monitor].levels
    if (!levels || typeof levels !== "object") return null
    var found = []
    Object.keys(levels).forEach(function(level) {
        var list = levels[level]
        if (Array.isArray(list)) list.forEach(function(layer) {
            if (layer && layer.namespace === namespace && Math.abs(layer.w - width) < 1 && Math.abs(layer.h - height) < 1) found.push(layer)
        })
    })
    return found.length === 1 ? {x: found[0].x - screen.x, y: found[0].y - screen.y} : null
}
function intersects(a, b, distance) {
    var d = Math.max(0, distance || 0)
    return !!a && !!b && a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
        a.x < b.x + b.width + d && a.x + a.width > b.x - d &&
        a.y < b.y + b.height + d && a.y + a.height > b.y - d
}
function candidates(windows, context, behavior, monitorOnly) {
    var focused = windows.filter(function(w) { return w.activated })[0]
    return windows.filter(function(w) {
        if (w.minimized || context.workspaces.indexOf(w.workspaceId) < 0) return false
        if (monitorOnly && w.monitor !== context.monitor) return false
        if (behavior === "FOCUSED_WINDOWS" && (!focused || focused.appKey !== w.appKey)) return false
        if (behavior === "MAXIMIZED_WINDOWS" && !w.maximized && !w.fullscreen) return false
        return true
    })
}
function near(windows, rect, context, behavior, distance, monitorOnly) {
    return candidates(windows, context, behavior, monitorOnly).some(function(w) { return intersects(rect, w.rect, distance) })
}

// Hyprland supplies no separate maximized flag for ordinary tiled clients.
// Treat a client covering the monitor work area as maximized (allow reserved bars).
function maximized(ipc, monitor) {
    if (ipc.fullscreen || ipc.maximized) return true
    var size = ipc.size || [0,0], scale = monitor.scale || 1
    return size[0] >= monitor.width / scale * 0.95 && size[1] >= monitor.height / scale * 0.85
}
