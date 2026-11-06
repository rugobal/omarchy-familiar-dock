.pragma library

// Port of the grouping/allocation rules in upstream panel.js (c3aed93).
// Coordinates use the long axis, so the same solver serves all four edges.
function centered(position) { return position === "centered" || position === "centerMonitor" }
// What the panel never draws: GNOME-only elements and the boxes that stay
// empty while the top bar is kept. The settings editor leaves out the same
// ones (settings/ElementLayout.js), so they take no part in the layout
// either: unseen, a box could split the elements around it into separate
// groups, or pull a group to the center.
var undrawn = ["activitiesButton", "leftBox", "centerBox", "systemMenu"]
function groupsFor(elements, sizes, dynamic) {
    var groups = [], previous = "", previousCenter = ""
    elements.forEach(function(row) {
        if (!row.visible || undrawn.indexOf(row.element) >= 0) return
        var pos = dynamic || row.position
        if (pos === "stackedTL" && previous === "stackedBR") pos = "stackedBR"
        if (!previous || (previous === "stackedTL" && pos !== previous) ||
            (previous !== "stackedBR" && pos === "stackedBR") ||
            (centered(pos) && previous !== pos && previous !== "stackedBR")) {
            groups.push({elements: [], position: pos, isCentered: false, expandable: -1, fixed: false})
            previousCenter = ""
        }
        var group = groups[groups.length - 1]
        if (row.element === "taskbar") group.expandable = group.elements.length
        if (centered(pos) && !group.isCentered) { group.isCentered = true; previousCenter = pos }
        group.position = previousCenter || pos
        group.elements.push({id: row.element, position: pos, length: Math.max(0, sizes[row.element] || 0)})
        previous = pos
    })
    return groups
}
function measure(group) {
    var size = 0, tl = 0, br = 0
    group.elements.forEach(function(e) {
        if (!group.isCentered || centered(e.position)) size += e.length
        else if (e.position === "stackedTL") tl += e.length
        else br += e.length
    })
    group.size = size + (group.isCentered ? Math.max(tl, br) * 2 : 0)
    group.offset = group.isCentered ? Math.max(tl - br, 0) : 0
}
function naturalLength(elements, sizes) {
    return elements.reduce(function(sum, row) {
        return sum + (row.visible && undrawn.indexOf(row.element) < 0 ? (sizes[row.element] || 0) : 0)
    }, 0)
}
function allocate(elements, sizes, length, dynamicAnchor) {
    var dynamic = dynamicAnchor ? ({START: "stackedTL", END: "stackedBR", MIDDLE: "centerMonitor"})[dynamicAnchor] : ""
    var groups = groupsFor(elements, sizes, dynamic), monitorGroup = -1, result = {}
    groups.forEach(function(g, i) { measure(g); if (g.position === "centerMonitor") monitorGroup = i })
    function place(index, lo, hi) {
        var group = groups[index]
        if (group.expandable >= 0) {
            var before = 0, after = 0, begin = 0, end = groups.length
            var expandable = group.elements[group.expandable]
            if (monitorGroup >= 0 && (monitorGroup !== index || expandable.position !== "centerMonitor")) {
                if (monitorGroup < index || (monitorGroup === index && expandable.position === "stackedTL")) begin = monitorGroup
                else end = monitorGroup
            }
            for (var j = begin; j < end; j++) {
                var ref = groups[j]
                if (j < index && (!ref.fixed || ref.end > lo)) before += ref.size
                else if (j > index && (!ref.fixed || ref.start < hi)) after += ref.size
            }
            var room = hi - lo - (group.isCentered ? Math.max(before, after) * 2 : before + after)
            if (room < group.size) {
                expandable.length = Math.max(0, expandable.length - (group.size - room) *
                    (group.isCentered && !centered(expandable.position) ? 0.5 : 1))
                measure(group)
            }
        }
        var start = group.isCentered ? lo + (hi - lo - group.size) / 2 : group.position === "stackedBR" ? hi - group.size : lo
        var cursor = Math.max(lo, start + group.offset)
        group.start = start
        group.elements.forEach(function(e) {
            var span = Math.max(0, Math.min(e.length, hi - cursor))
            result[e.id] = {start: Math.round(cursor), length: Math.round(span)}
            cursor += span
        })
        group.end = cursor
        group.fixed = true
    }
    if (monitorGroup >= 0) place(monitorGroup, 0, length)
    for (var pass = 0; pass < 10 && groups.some(function(g) { return !g.fixed }); pass++) {
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i]
            if (g.fixed) continue
            var prev = groups[i - 1], next = groups[i + 1]
            var lo = prev && prev.fixed ? prev.end : monitorGroup >= 0 && i > monitorGroup ? groups[monitorGroup].end : 0
            var hi = next && next.fixed ? next.start : monitorGroup >= 0 && i < monitorGroup ? groups[monitorGroup].start : length
            if (g.position === "stackedTL") place(i, 0, hi)
            else if (g.position === "stackedBR") place(i, lo, length)
            else if ((!prev || prev.fixed) && (!next || next.fixed)) place(i, lo, hi)
        }
    }
    return result
}
function iconGeometry(thickness, margin, padding) {
    var minIcon = Math.min(4 + thickness % 2, thickness)
    var actualPadding = Math.max(0, Math.min(padding, (thickness - minIcon) / 2))
    var icon = Math.max(minIcon, thickness - padding * 2)
    return {icon: icon, padding: actualPadding, button: icon + actualPadding * 2 + margin * 2}
}
function panelLength(screenLength, percent, natural, margins) {
    var available = Math.max(1, screenLength - margins * 2)
    return Math.round(Math.max(1, Math.min(available, percent === -1 ? natural : available * percent / 100)))
}
function lengthMargins(screenLength, length, margin, anchor) {
    var gap = Math.max(0, Math.round(screenLength - margin * 2 - length))
    var start = anchor === "END" ? gap : anchor === "MIDDLE" ? Math.floor(gap / 2) : 0
    return {start: margin + start, end: margin + gap - start}
}
function fullscreenOn(toplevels, workspace) {
    return toplevels.some(function(t) {
        return t.workspace && t.workspace.id === workspace && t.lastIpcObject && (Number(t.lastIpcObject.fullscreen) & 2) !== 0
    })
}
