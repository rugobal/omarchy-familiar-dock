.pragma library
.import "Chord.js" as Chord
.import "AppsKey.js" as AppsKey

// What a click on the drawer icon does (show-apps-click): open the app
// drawer, open an app, do what a keybinding does, or run a command. The
// setting remembers the app, the keybinding and the command it was given,
// so going back to one finds it again; only the one the action names counts.
var actions = ["drawer", "app", "keybinding", "command"]
var defaults = {action: "drawer", app: "", keybinding: "", command: ""}

function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v) }
// A desktop entry id, as Quickshell's DesktopEntries names one ("firefox",
// "org.telegram.desktop"): kept as given, since ".desktop" can be part of it.
function appId(v) {
    if (typeof v !== "string") return ""
    var id = v.trim()
    return id.length <= 256 && !/[\x00-\x1f\/]/.test(id) ? id : ""
}
// The ids to look an app up by: the id, then, for one written with its
// file's ending ("firefox.desktop"), the id without it.
function appIds(id) {
    return /\.desktop$/.test(id) && id.length > 8 ? [id, id.slice(0, -8)] : [id]
}
// The stored form, keys in this order, so Settings can compare values whole.
function normalize(v) {
    if (!object(v)) v = {}
    var chord = Chord.canonical(v.keybinding)
    return {
        action: actions.indexOf(v.action) >= 0 ? v.action : "drawer",
        app: appId(v.app),
        keybinding: chord || "",
        command: typeof v.command === "string" && v.command.length <= 4096 && v.command.indexOf("\0") < 0 ? v.command : ""
    }
}
// What the click does, for "changed" and reset: the action and its target.
function effective(v) {
    var n = normalize(v), out = {action: n.action}
    if (n.action !== "drawer") out[n.action] = n[n.action]
    return out
}
// {kind, target}: what to do now. An action with nothing picked opens the drawer.
function plan(v) {
    var n = normalize(v)
    var target = n.action === "drawer" ? "" : n[n.action]
    if (n.action === "command") target = target.trim() ? target : ""
    return target ? {kind: n.action, target: target} : {kind: "drawer", target: "", unset: n.action !== "drawer"}
}

// Following a keybinding. Every Lua binding is a function Hyprland keeps in
// its Lua registry; `hyprctl binds` reports it as dispatcher __lua with the
// registry slot as arg, and runs that function when the key is pressed.
// A click lists the bindings again, finds the ones the key runs, and runs
// the same functions in the same Lua state. A reload frees every slot and
// fills them again, in any order, so the listing keeps the functions it
// saw (`keep`, in the same request: nothing runs between the two), and a
// click runs a slot only while it still holds that very function.
function usable(record) {
    return !record.submap && record.description !== AppsKey.description && !/m/.test(record.flags || "")
}
// What pressing the key runs: its bindings outside any submap, but not the
// plugin's own drawer key; press bindings rather than release ones.
function presses(records, chord) {
    var wanted = Chord.parse(chord)
    if (!wanted) return []
    var on = (records || []).filter(function(r) { return usable(r) && Chord.matches(r, wanted) })
    var pressed = on.filter(function(r) { return !/r/.test(r.flags || "") })
    return pressed.length ? pressed : on
}
// Registry slots, or null when a binding is not a Lua function (none is in
// a Lua config; a Hyprland plugin's could be).
function slots(list) {
    var out = list.map(function(r) { return r.dispatcher === "__lua" && /^[0-9]{1,9}$/.test(String(r.arg)) ? Number(r.arg) : null })
    return out.length && out.every(function(slot) { return slot !== null }) ? out : null
}
var keptName = "__familiar_dock_click"
// No ";" in it: `hyprctl --batch` splits on those.
var keep = "local seen = {} for k, v in pairs(debug.getregistry()) do " +
    "if type(k) == \"number\" and type(v) == \"function\" then seen[k] = v end end " + keptName + " = seen"
var forget = keptName + " = nil"
// One request: the bindings, then the functions they name kept.
var listing = "binds ; eval " + keep
// The batch's reply ends with the eval's own: "ok" once the functions are kept.
function kept(text) {
    var lines = String(text || "").trim().split("\n")
    return lines[lines.length - 1].trim() === "ok"
}
// Lua for `hyprctl eval`: every slot is checked before any runs, so a key
// rebound since the listing runs nothing rather than half of something.
// Then each runs on its own, as Hyprland runs a key's bindings: one that
// fails does not stop the rest, and the failures are reported after.
function expression(list) {
    return "local r, seen = debug.getregistry(), " + keptName + "; " + keptName + " = nil; local s = {" + list.join(", ") + "}; " +
        "for _, i in ipairs(s) do if not seen or type(r[i]) ~= \"function\" or r[i] ~= seen[i] then error(\"familiar-dock: the binding changed\") end end; " +
        "local failed = {}; for _, i in ipairs(s) do local ok, e = pcall(r[i]); if not ok then failed[#failed + 1] = tostring(e) end end; " +
        "if #failed > 0 then error(\"familiar-dock: \" .. table.concat(failed, \"; \")) end"
}

// The keybindings Settings offers: each key with a description outside any
// submap, the plugin's own drawer key aside, by what it does.
function choices(records) {
    var byChord = {}, list = []
    ;(records || []).forEach(function(r) {
        if (!usable(r) || !r.description || r.dispatcher !== "__lua") return
        var chord = Chord.ofRecord(r)
        if (!chord) return
        if (!byChord[chord]) { byChord[chord] = {chord: chord, names: []}; list.push(byChord[chord]) }
        if (byChord[chord].names.indexOf(r.description) < 0) byChord[chord].names.push(r.description)
    })
    return list.map(function(c) { return {value: c.chord, label: c.names.join(" · ").slice(0, 256), description: Chord.caps(c.chord).join("+")} })
        .sort(function(a, b) { return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : a.label.toLowerCase() > b.label.toLowerCase() ? 1 : 0 })
}
// What a chord does now, from the choices: "" when nothing a click can run.
function naming(list, chord) {
    var found = (list || []).filter(function(c) { return c.value === chord })[0]
    return found ? found.label : ""
}
