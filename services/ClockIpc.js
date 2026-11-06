.pragma library

function handler(widget) {
    var data = widget ? widget.data : []
    for (var i = 0; i < data.length; i++) {
        var child = data[i]
        if (child && "target" in child && child.target === "omarchy.clock" &&
                typeof child.cycleFormat === "function" && typeof child.toggleWeekStart === "function") return child
    }
    return null
}
function reconcile(records, focused, primary, takeover, registered) {
    var visible = records.filter(function(r) { return r.visible && r.handler })
    var selected = takeover ? (visible.filter(function(r) { return r.monitor === focused })[0] ||
        visible.filter(function(r) { return r.monitor === primary })[0] || visible[0]) : null
    var chosen = selected ? selected.handler : null
    // Disable the previous owner before enabling the next; never touch a
    // foreign/top-bar handler. These are actual ShellIpc objects, so both the
    // shell socket registry and qs ipc honor the same enabled flag.
    records.forEach(function(r) { if (r.handler && r.handler !== chosen) r.handler.enabled = false })
    var competitor = registered.some(function(h) { return h && h !== chosen && h.enabled && h.target === "omarchy.clock" })
    if (chosen) chosen.enabled = !competitor
    return {pending: !!chosen && competitor, monitor: chosen && !competitor ? selected.monitor : ""}
}
