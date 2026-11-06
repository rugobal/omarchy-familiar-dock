.pragma library
// null means invalid: callers must leave settings unchanged.
function boolean(value) {
    var text = String(value).trim().toLowerCase()
    if (["true", "1", "on", "yes"].indexOf(text) >= 0) return true
    if (["false", "0", "off", "no"].indexOf(text) >= 0) return false
    return null
}
