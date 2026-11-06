.pragma library

// A key combination the way Hyprland's Lua config names one: modifiers, then
// one key, joined by " + " ("SUPER + ALT + SPACE"). That canonical form is
// what the settings file keeps and what hl.bind is given. "" means no key.
var modifiers = [
    {name: "SUPER", mask: 64, label: "Super", aliases: ["SUPER", "META", "WIN", "LOGO", "MOD4"]},
    {name: "CTRL", mask: 4, label: "Ctrl", aliases: ["CTRL", "CONTROL"]},
    {name: "ALT", mask: 8, label: "Alt", aliases: ["ALT", "MOD1"]},
    {name: "SHIFT", mask: 1, label: "Shift", aliases: ["SHIFT"]}
]
// Shift alone would take a capital letter away from typing.
var holdMask = 64 | 4 | 8

// Keys with one name each in xkb, so a binding found by name is this key.
var named = {
    SPACE: "Space", TAB: "Tab", RETURN: "Enter", BACKSPACE: "Backspace", DELETE: "Delete", INSERT: "Insert",
    HOME: "Home", END: "End", LEFT: "←", RIGHT: "→", UP: "↑", DOWN: "↓",
    COMMA: ",", PERIOD: ".", SLASH: "/", BACKSLASH: "\\", MINUS: "-", EQUAL: "=", SEMICOLON: ";",
    APOSTROPHE: "'", GRAVE: "`", BRACKETLEFT: "[", BRACKETRIGHT: "]"
}
var aliases = {ENTER: "RETURN"}
// Bindings may name a key by its xkb keycode ("SUPER + code:10", as
// Omarchy's workspace keys do). The key at that place on a US keyboard is
// the one it is taken to be: on another layout a binding may then look
// taken when it is free, never free when it is taken by the same place.
var codeKeys = (function() {
    var keys = {23: "TAB", 65: "SPACE", 36: "RETURN", 22: "BACKSPACE", 119: "DELETE", 118: "INSERT", 110: "HOME", 115: "END",
        113: "LEFT", 114: "RIGHT", 111: "UP", 116: "DOWN", 59: "COMMA", 60: "PERIOD", 61: "SLASH", 51: "BACKSLASH",
        20: "MINUS", 21: "EQUAL", 47: "SEMICOLON", 48: "APOSTROPHE", 49: "GRAVE", 34: "BRACKETLEFT", 35: "BRACKETRIGHT", 95: "F11", 96: "F12"}
    var rows = [[10, "1234567890"], [24, "QWERTYUIOP"], [38, "ASDFGHJKL"], [52, "ZXCVBNM"]]
    rows.forEach(function(row) { for (var i = 0; i < row[1].length; i++) keys[row[0] + i] = row[1][i] })
    for (var f = 1; f <= 10; f++) keys[66 + f] = "F" + f
    return keys
})()
// codes: also accept "code:NN" (bindings in Hyprland, never the setting).
function keyName(token, codes) {
    var code = codes ? /^CODE:(\d+)$/.exec(token) : null
    if (code) return Object.prototype.hasOwnProperty.call(codeKeys, code[1]) ? codeKeys[code[1]] : ""
    var key = aliases[token] || token
    if (/^[A-Z0-9]$/.test(key) || /^F([1-9]|1[0-2])$/.test(key) || Object.prototype.hasOwnProperty.call(named, key)) return key
    return ""
}

// {mask, key} for a combination written any reasonable way ("super+tab",
// "SUPER + TAB"), or null when it is not one this setting can bind.
// codes: as a Hyprland binding, which may name the key "code:NN".
function parse(text, codes) {
    if (typeof text !== "string" || text.length > 64) return null
    var parts = text.split("+").map(function(part) { return part.trim().toUpperCase() })
    if (parts.length < 2 || parts.some(function(part) { return !part })) return null
    var key = keyName(parts.pop(), codes), mask = 0
    if (!key) return null
    for (var i = 0; i < parts.length; i++) {
        var found = modifiers.filter(function(m) { return m.aliases.indexOf(parts[i]) >= 0 })[0]
        if (!found || (mask & found.mask)) return null
        mask |= found.mask
    }
    return mask & holdMask ? {mask: mask, key: key} : null
}
function format(chord) {
    return modifiers.filter(function(m) { return chord.mask & m.mask }).map(function(m) { return m.name }).concat([chord.key]).join(" + ")
}
// The stored form, "" for no key, or null when the text is no combination.
function canonical(text) {
    if (text === "") return ""
    var chord = parse(text)
    return chord ? format(chord) : null
}
// What each key cap shows: ["Super", "Alt", "Space"].
function caps(text) {
    var chord = parse(text)
    if (!chord) return []
    return modifiers.filter(function(m) { return chord.mask & m.mask }).map(function(m) { return m.label })
        .concat([Object.prototype.hasOwnProperty.call(named, chord.key) ? named[chord.key] : chord.key])
}
// The key of a `hyprctl binds` record, by name: Lua bindings report the
// whole chord as the key, as written ("SUPER + SHIFT + code:10").
function recordKey(record) {
    return keyName(String(record && record.key || "").split("+").pop().trim().toUpperCase(), true)
}
// A record is on this combination: its modmask, and its key.
function matches(record, chord) {
    if (!record || !chord) return false
    var key = recordKey(record)
    return !!key && String(record.modmask) === String(chord.mask) && key === chord.key
}
// The combination a record is on, canonical, or "" when it is not one.
function ofRecord(record) {
    var mask = Number(record && record.modmask), key = recordKey(record)
    return key && mask > 0 && (mask & holdMask) && (mask & ~(64 | 4 | 8 | 1)) === 0 ? format({mask: mask, key: key}) : ""
}

// Qt key events, for recording one: Qt.Key_* codes and modifier flags.
var qtModifiers = [{flag: 0x10000000, mask: 64}, {flag: 0x04000000, mask: 4}, {flag: 0x08000000, mask: 8}, {flag: 0x02000000, mask: 1}]
var qtKeys = {
    0x20: "SPACE", 0x01000001: "TAB", 0x01000002: "TAB", 0x01000004: "RETURN", 0x01000005: "RETURN",
    0x01000003: "BACKSPACE", 0x01000007: "DELETE", 0x01000006: "INSERT", 0x01000010: "HOME", 0x01000011: "END",
    0x01000012: "LEFT", 0x01000013: "UP", 0x01000014: "RIGHT", 0x01000015: "DOWN",
    0x2c: "COMMA", 0x2e: "PERIOD", 0x2f: "SLASH", 0x5c: "BACKSLASH", 0x2d: "MINUS", 0x3d: "EQUAL",
    0x3b: "SEMICOLON", 0x27: "APOSTROPHE", 0x60: "GRAVE", 0x5b: "BRACKETLEFT", 0x5d: "BRACKETRIGHT"
}
// Shift, Ctrl, Meta, Alt, Caps Lock, Super L/R, Hyper L/R, AltGr.
var qtModifierKeys = [0x01000020, 0x01000021, 0x01000022, 0x01000023, 0x01000024, 0x01000053, 0x01000054, 0x01000056, 0x01000057, 0x01001103]
// {chord} for a press that makes a combination, else {reason}: "modifier"
// (still being held down), "hold" (no Super, Ctrl or Alt) or "unsupported".
// With Shift held Qt reports the shifted symbol, which differs by layout
// and is not the key Hyprland names: letters stay letters, the digit row is
// read by its place (the xkb keycode, Qt's native scan code on Wayland),
// and other symbols are not recorded.
function fromQt(key, flags, scanCode) {
    if (qtModifierKeys.indexOf(key) >= 0) return {chord: "", reason: "modifier"}
    var symbol = key > 0x20 && key < 0x01000000 && !(key >= 0x41 && key <= 0x5a)
    var digit = /^[0-9]$/.test(codeKeys[scanCode] || "") ? codeKeys[scanCode] : ""
    var name = symbol && (flags & 0x02000000) ? digit
        : (key >= 0x41 && key <= 0x5a) || (key >= 0x30 && key <= 0x39) ? String.fromCharCode(key)
        : key >= 0x01000030 && key <= 0x0100003b ? "F" + (key - 0x01000030 + 1)
        : Object.prototype.hasOwnProperty.call(qtKeys, key) ? qtKeys[key] : ""
    if (!name) return {chord: "", reason: "unsupported"}
    var mask = 0
    qtModifiers.forEach(function(m) { if (flags & m.flag) mask |= m.mask })
    if (!(mask & holdMask)) return {chord: "", reason: "hold"}
    return {chord: format({mask: mask, key: name}), reason: ""}
}
