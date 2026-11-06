.pragma library

// Geometry is the visible task model, already filtered by monitor/workspace.
// The dragged slot moves with its run: the adjacent slots of the same app.
// Ungrouped, that is an app's launcher and windows, which the model always
// keeps together, so the run moves as one item and the dragged slot's room
// stays at its own place inside it. Grouped, the run is the slot alone.
function run(items, source) {
    var key = items[source].appKey, first = source, last = source
    while (first > 0 && items[first - 1].appKey === key) first--
    while (last + 1 < items.length && items[last + 1].appKey === key) last++
    return {first: first, last: last}
}
// Where a drag starts and where it goes back to: nothing moved.
function rest(items, source) {
    return {index: run(items, source).first, before: "", order: items.map(function(item, i) { return i }), stays: true}
}
// `index` is where the run goes among the other slots. `room` is where it
// is now (an earlier index), so the slots after it sit one run further on,
// as they are drawn. A slot changes sides only once the run's center passes
// that slot's center where it is seen, and over the room nothing moves.
// Without `room` the other slots are packed. `pointer` is the dragged
// slot's center, which puts the run's center its rank further along.
// A pin stays among the pins. A running app that isn't pinned goes among
// the pins, which pins it ahead of the pin it lands before, or anywhere
// among the running apps, which moves it there for the session, as Dash to
// Panel does. Right after the last pin is the first running place, so it
// is not pinned there either. `pin` says the drop writes the pins;
// otherwise `runBefore` is the running app it goes ahead of ("" for last).
// `stays` says the run is back where it started.
function insertion(items, sizes, source, pointer, pins, room) {
    var span = run(items, source), others = [], moving = [], size = 0, rank = 0
    items.forEach(function(item, i) {
        if (i < span.first || i > span.last) { others.push({item: item, size: sizes[i], index: i}); return }
        moving.push(i)
        if (i < source) rank += sizes[i]
        size += sizes[i]
    })
    var center = pointer - rank - sizes[source] / 2 + size / 2
    var end = 0
    others.forEach(function(row, i) { if (row.item.isFavorite) end = i + 1 })
    var favorite = !!items[source].isFavorite
    var limit = favorite ? end : others.length
    var open = room === undefined || room === null ? -1 : room
    // Each app's slots are one block: an ungrouped app's launcher and its
    // windows. Never offer an insertion between two slots of the same app.
    var offset = 0, index = limit
    for (var i = 0; i < limit;) {
        var first = i, width = 0, id = others[i].item.appKey
        while (i < limit && others[i].item.appKey === id) { width += others[i].size; i++ }
        var shown = open >= 0 && first >= open ? size : 0
        if (center < offset + shown + width / 2) { index = first; break }
        offset += width
    }
    var pin = favorite || index < end
    var runBefore = !pin && index < others.length ? others[index].item.appKey : ""
    var before = ""
    for (var j = index; pin && j < others.length; j++) {
        if (others[j].item.isFavorite && others[j].item.appKey !== items[source].appKey) {
            before = others[j].item.appKey; break
        }
    }
    // Hidden favorites retain their relative order: insert before the next
    // visible favorite, rather than replacing the filtered favorites list.
    var visible = []
    items.forEach(function(item) { if (item.isFavorite && visible.indexOf(item.appKey) < 0) visible.push(item.appKey) })
    var key = items[source].appKey
    if (visible.indexOf(key) >= 0 && pins.indexOf(key) >= 0) {
        var moved = visible.filter(function(k) { return k !== key })
        var at = before ? moved.indexOf(before) : moved.length
        moved.splice(at < 0 ? moved.length : at, 0, key)
        if (JSON.stringify(visible) === JSON.stringify(moved)) before = pins[pins.indexOf(key) + 1] || ""
    }
    var indices = others.map(function(row) { return row.index })
    return {index: index, before: before, pin: pin, runBefore: runBefore,
        order: indices.slice(0, index).concat(moving, indices.slice(index)), stays: index === span.first}
}
// Where the ghost goes for a pointer: its home moved by how far the pointer
// has gone along the panel since the press, so it keeps the point it was
// grabbed by and stays in the panel's row.
function follow(home, press, pointer, vertical) {
    return vertical ? {x: home.x, y: home.y + pointer.y - press.y} : {x: home.x + pointer.x - press.x, y: home.y}
}
// True once a pointer at `p` (taskbar coordinates) is `limit` or more off a
// `width` x `height` taskbar on any side: letting go there puts the button back.
function pulledOff(p, width, height, limit) {
    return Math.max(-p.x, p.x - width, -p.y, p.y - height) >= limit
}
// The slots laid out in `order`: each one's start, and the dragged one's,
// which is the room. The total length never changes.
function arrange(sizes, order, source) {
    var starts = [], offset = 0, placeholder = 0
    order.forEach(function(i) {
        if (i === source) placeholder = offset
        else starts[i] = offset
        offset += sizes[i]
    })
    return {starts: starts, placeholder: placeholder, length: offset}
}
