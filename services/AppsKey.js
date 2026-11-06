.pragma library
.import "Chord.js" as Chord

// The drawer keybinding (show-apps-hotkey), which opens Show Applications. Omarchy binds Super+Alt+Space
// to the stock dock's app grid, and this plugin hides that dock, so the key
// starts there. While the plugin runs, it points the chosen key at Show Apps
// inside the running compositor (`hyprctl eval`, as Omarchy's own shell does
// for monitors), never in a Hyprland file. A Hyprland reload brings the
// configured bindings back, so the service applies it again after each one;
// a change of key, turning it off, or the plugin's cleanup reloads once to
// give the old key back.
var defaultKey = "SUPER + ALT + SPACE"
var description = "Apps (Familiar Dock)"
// The fallback keeps the key working if the binding outlives the plugin.
var command = "omarchy-shell rugobal.familiar-dock showApps || omarchy-shell omarchy.dock apps"

// JSON string escapes are valid Lua for these ASCII strings.
function lua(text) { return JSON.stringify(String(text)) }

// hl.unbind clears the chord in every submap, so state() refuses to take it
// while any binding but Omarchy's own uses it. It finds a binding by the
// words it was written with, in their order ("SUPER + SHIFT + CTRL + SPACE"
// is not "SUPER + CTRL + SHIFT + SPACE"), so each spelling bound on the key
// (probe().spellings) is unbound, then the canonical one.
function take(chord, spellings) {
    var names = (spellings || []).concat([chord]).filter(function(name, i, all) { return all.indexOf(name) === i })
    return names.map(function(name) { return "hl.unbind(" + lua(name) + "); " }).join("") +
        "hl.bind(" + lua(chord) + ", hl.dsp.exec_cmd(" + lua(command) + "), { description = " + lua(description) + " })"
}

// Lists the live bindings, then the lines of the user's own Hyprland files
// (~/.config/hypr, any depth) and of Omarchy's default ones that quote a
// combination. Hyprland reports Lua bindings without their command, so a
// file that names the chord is how a binding is told to be the user's, and
// a line of Omarchy's that names it with the binding's description is how
// it is told to be Omarchy's.
var marker = "@@familiar-dock: user files@@"
var omarchyMarker = "@@familiar-dock: omarchy files@@"
var quotedLine = "/\\+/ && /[\"\\047]/ && !/^[[:space:]]*--/ {print FILENAME \"\\t\" $0}"
var probeScript = [
    'hyprctl binds || exit 1',
    "printf '\\n%s\\n' '" + marker + "'",
    "find -L \"$HOME/.config/hypr\" -name '*.lua' -type f -exec awk '" + quotedLine + "' {} + 2>/dev/null || :",
    "printf '%s\\n' '" + omarchyMarker + "'",
    "find -L \"${OMARCHY_PATH:-/usr/share/omarchy}/default/hypr\" -name '*.lua' -type f -exec awk '" + quotedLine + "' {} + 2>/dev/null || :"
].join("\n")

// Plain `hyprctl binds` output: a line starting with "bind" opens each record,
// then "\tfield: value" lines follow. Omarchy's keybindings menu parses this
// form too, because Hyprland 0.56.0 emits invalid JSON for binds. The letters
// after "bind" are its flags (r: on release, m: a mouse binding).
function parse(text) {
    var records = [], current = null
    String(text || "").split("\n").forEach(function(line) {
        if (/^bind/.test(line)) { current = {flags: line.slice(4).trim()}; records.push(current); return }
        var match = current ? /^\t([a-z_]+): ?(.*)$/.exec(line) : null
        if (match) current[match[1]] = match[2]
    })
    return records
}
// "file\tline" rows: each line's file and its quoted strings.
function lines(text) {
    return String(text || "").split("\n").map(function(row) {
        var tab = row.indexOf("\t")
        if (tab < 0) return null
        var strings = [], pattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g, match
        while ((match = pattern.exec(row.slice(tab + 1)))) strings.push(match[1] !== undefined ? match[1] : match[2])
        return {file: row.slice(0, tab), strings: strings}
    }).filter(function(line) { return line && line.strings.length })
}
// The lines that quote this combination, however they spell it.
function naming(list, chord) {
    var wanted = Chord.parse(chord)
    return wanted ? list.filter(function(line) {
        return line.strings.some(function(s) { var c = Chord.parse(s, true); return !!c && c.mask === wanted.mask && c.key === wanted.key })
    }) : []
}

// For the key wanted:
// "plugin": the plugin's binding is on it. "omarchy": only Omarchy's own
// bindings are on it, in no submap, each named by a line of Omarchy's with
// its description, no more of them than those lines, and no file of the
// user's names it: safe to take. "custom": anything else is there, which is
// never touched. "none": nothing is bound.
function state(records, chord, userFile, omarchyLines) {
    var wanted = Chord.parse(chord)
    if (!wanted) return "none"
    var found = (records || []).filter(function(record) { return Chord.matches(record, wanted) })
    if (!found.length) return "none"
    if (found.some(function(record) { return record.description === description })) return "plugin"
    var owned = omarchyLines || []
    if (userFile || found.length > owned.length) return "custom"
    return found.every(function(record) {
        return !record.submap && owned.some(function(line) { return line.strings.indexOf(record.description) >= 0 })
    }) ? "omarchy" : "custom"
}
// Where the plugin's own binding is now, canonical, or "".
function pluginKey(records) {
    var ours = (records || []).filter(function(record) { return record.description === description })[0]
    return ours ? Chord.ofRecord(ours) || "?" : ""
}

function probe(text, chord) {
    var parts = String(text || "").split("\n" + marker + "\n")
    var files = parts.length > 1 ? parts[1].split(omarchyMarker + "\n") : ["", ""]
    var records = parse(parts[0])
    var user = naming(lines(files[0]), chord), omarchy = naming(lines(files[1] || ""), chord)
    var userFile = user.length ? user[0].file : ""
    var wanted = Chord.parse(chord)
    var on = wanted ? records.filter(function(record) { return Chord.matches(record, wanted) }) : []
    var found = on.filter(function(record) { return record.description !== description })
    // The words each binding on the key was written with, when they are the
    // whole chord, for take().
    var spellings = on.map(function(record) { return String(record.key || "") }).filter(function(key, i, all) {
        var c = Chord.parse(key, true)
        return all.indexOf(key) === i && !!c && c.mask === wanted.mask && c.key === wanted.key
    })
    return {state: state(records, chord, userFile, omarchy), plugin: pluginKey(records), userFile: userFile,
        holder: found.length ? String(found[0].description || "") : "", spellings: spellings}
}

// One reload per change of key: if Hyprland keeps the binding (a reload that
// fails on a config error keeps the old bindings), reloading again would loop.
// A key left at Omarchy's Apps key that nothing binds stays unbound, as when
// the user turned Omarchy's default bindings off; a key the user chose is
// bound when it is free.
function action(chord, seen, restoreTried) {
    if (seen.plugin && seen.plugin !== chord) return restoreTried ? "none" : "restore"
    if (!chord || seen.state === "plugin") return "none"
    return seen.state === "omarchy" || (seen.state === "none" && chord !== defaultKey) ? "take" : "none"
}

// While a key is being recorded in Settings, Hyprland's own bindings would
// take it first (Super+Tab never reaches the window), so they are paused: an
// empty submap whose only binding, Escape, also gives them back.
// A reload drops the submap, so it is defined once per configuration.
var recordSubmap = "familiar-dock-record"
var recordDescription = "Stop recording (Familiar Dock)"
var defineExpression = "hl.define_submap(" + lua(recordSubmap) + ", function() hl.bind(\"ESCAPE\", hl.dsp.submap(\"reset\"), " +
    "{ non_consuming = true, description = " + lua(recordDescription) + " }) end)"
var enterExpression = "hl.dispatch(hl.dsp.submap(" + lua(recordSubmap) + "))"
function pause(defined) { return (defined ? "" : defineExpression + "; ") + enterExpression }
var resumeExpression = "if hl.get_current_submap() == " + lua(recordSubmap) + " then hl.dispatch(hl.dsp.submap(\"reset\")) end"

// Run by the detached cleanup once the plugin is disabled or removed. A reload
// re-reads the user's Hyprland files, so whatever they configure comes back,
// and drops the recording submap, which outlives a drawer key turned off.
var restoreScript = [
    'binds=$(timeout 5s hyprctl binds 2>/dev/null) || binds=""',
    "if [[ $binds == *$'\\tdescription: " + description + "'* || $binds == *$'\\tdescription: " + recordDescription + "'* ]]; then",
    "  timeout 10s hyprctl reload config-only >/dev/null 2>&1 || :",
    "fi"
].join("\n")
