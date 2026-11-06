.pragma library
function parse(text) {
    if (text.length > 65536 || !/interface=com\.canonical\.Unity\.LauncherEntry;\s*member=Update/.test(text)) return null
    var uri = /string "application:\/\/([^"\x00-\x1f/]+)\.desktop"/.exec(text)
    if (!uri || uri[1].length > 256) return null
    var fields = {}, matches, re = /string "(count|count-visible|progress|progress-visible|urgent)"\s+variant\s+(?:int64|uint64|int32|uint32|double|boolean)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|true|false)/g
    while ((matches = re.exec(text))) {
        var key = matches[1], token = matches[2]
        if (key === "urgent" || /visible$/.test(key)) { if (token === "true" || token === "false") fields[key] = token === "true" }
        else { var n = Number(token); if (isFinite(n)) fields[key] = key === "count" ? Math.max(0, Math.min(999999, Math.floor(n))) : Math.max(0, Math.min(1,n)) }
    }
    return {id: uri[1], fields: fields}
}
function merge(previous, update) {
    var out = Object.create(null), keys = Object.keys(previous).slice(-255)
    keys.forEach(function(id) { out[id] = previous[id] })
    var value = {}, before = out[update.id] || {}
    Object.keys(before).forEach(function(k) { value[k] = before[k] })
    Object.keys(update.fields).forEach(function(k) { value[k] = update.fields[k] })
    out[update.id] = value
    return out
}
function enabled(settings) { return !!(settings["progress-show-count"] || settings["progress-show-bar"]) }
