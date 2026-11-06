.pragma library

var omitted = ["activitiesButton", "leftBox", "centerBox", "systemMenu"]
function indices(value) {
    var result = []
    value.forEach(function(row, index) { if (omitted.indexOf(row.element) < 0) result.push(index) })
    return result
}
function update(value, index, property, nextValue) {
    var next = JSON.parse(JSON.stringify(value))
    if (indices(value).indexOf(index) >= 0 && ["visible","position"].indexOf(property) >= 0) next[index][property] = nextValue
    return next
}
function move(value, index, delta) {
    var next = JSON.parse(JSON.stringify(value)), visible = indices(value), at = visible.indexOf(index), target = at + delta
    if (at < 0 || target < 0 || target >= visible.length) return next
    // Swap only rendered entries. Omitted entries retain both their original
    // contents and array indices when visible elements cross them.
    var other = visible[target], row = next[index]; next[index] = next[other]; next[other] = row
    return next
}
