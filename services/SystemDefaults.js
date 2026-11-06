.pragma library

function id(value) {
    var result = String(value || "").trim().replace(/\.desktop$/, "")
    return result && result !== "omarchy-browser" && result.length <= 256 && !/[\x00-\x1f]/.test(result) ? result : ""
}
function terminalIds(text) {
    return String(text || "").slice(0, 65536).split(/\r?\n/).map(function(line) {
        return id(line.replace(/#.*$/, "").trim().split(":")[0])
    }).filter(function(value) { return !!value })
}
function listPaths(configHome, desktop) {
    var paths = []
    String(desktop || "").toLowerCase().split(":").forEach(function(name) {
        if (/^[a-z0-9_-]+$/.test(name)) paths.push(configHome + "/" + name + "-xdg-terminals.list")
    })
    paths.push(configHome + "/xdg-terminals.list")
    return paths.filter(function(p, i) { return paths.indexOf(p) === i })
}
function resolve(payload, lookup) {
    var terminals = []
    ;(payload.lists || []).forEach(function(text) { terminals = terminals.concat(terminalIds(text)) })
    var terminal = terminals.filter(function(value) { return !!lookup(value) })[0] || ""
    var result = []
    ;[id(payload.browser), id(payload.files), terminal].forEach(function(value) {
        var entry = value ? lookup(value) : null
        var installed = entry ? id(entry.id) : ""
        if (installed && result.indexOf(installed) < 0) result.push(installed)
    })
    return result
}
// Only fixed resolver commands. File paths are separate argv elements.
var resolveScript = [
    'set -euo pipefail',
    'if command -v omarchy-cmd-default-browser >/dev/null; then browser=$(omarchy-cmd-default-browser); else browser=$(xdg-settings get default-web-browser); fi',
    'files=$(xdg-mime query default inode/directory)',
    "lists='[]'",
    'for list in "$@"; do',
    '  content=""; [[ ! -r $list ]] || content=$(head -c 65536 -- "$list")',
    '  lists=$(jq -c --arg text "$content" \'. + [$text]\' <<<"$lists")',
    'done',
    'jq -cn --arg browser "$browser" --arg files "$files" --argjson lists "$lists" \'{browser:$browser,files:$files,lists:$lists}\''
].join("\n")
