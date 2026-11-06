.pragma library
function value(settings, name, type, fallback) {
    var dict = settings["animate-appicon-hover-animation-" + name] || {}
    return dict[type] === undefined ? fallback : dict[type]
}
// How far an icon's slot lies from the pointer before the hover lets it
// go, as in Dash to Panel: half the extent, counted in this slot's size.
function reach(settings, size) {
    var type = settings["animate-appicon-hover-animation-type"]
    return Math.max(0, value(settings, "extent", type, 1)) / 2 * size
}
// How strongly the hover moves an icon, 0 to 1. SIMPLE lifts only the
// hovered icon. RIPPLE and PLANK fall off with the pointer's distance from
// the slot's center (`difference`, pointer minus center along the panel;
// null while the pointer is off the taskbar), so the effect glides as the
// pointer moves instead of jumping from icon to icon.
function level(settings, hovered, difference, size) {
    if (!settings["animate-appicon-hover"]) return 0
    var type = settings["animate-appicon-hover-animation-type"]
    if (type === "SIMPLE") return hovered ? 1 : 0
    if (difference === null || difference === undefined) return 0
    var max = reach(settings, size), distance = Math.abs(difference)
    if (max <= 0 || distance > max) return 0
    return Math.pow((max - distance) / max, Math.max(0.1, value(settings, "convexity", type, 1)))
}
// The longest a motion the user sets may run: Omarchy keeps motion under 300ms.
var maxMotion = 250
// The motion at a level. `side` is -1 for an icon before the pointer, so
// RIPPLE's rotation tips the icons on each side away from it.
function transform(settings, weight, size, side) {
    var type = settings["animate-appicon-hover-animation-type"]
    if (!settings["animate-appicon-hover"] || !(weight > 0)) return {zoom: 1, travel: 0, rotation: 0, duration: Math.min(maxMotion, value(settings, "duration", type, 160))}
    return {zoom: 1 + (value(settings, "zoom", type, 1) - 1) * weight,
        travel: size * value(settings, "travel", type, 0) * weight,
        rotation: value(settings, "rotation", type, 0) * weight * (side < 0 ? -1 : 1),
        duration: Math.min(maxMotion, value(settings, "duration", type, 160))}
}
// PLANK spreads the icons away from the pointer, by Dash to Panel's curve:
// barely under the pointer, at most a tenth of the reach (times the zoom)
// for icons beyond it, so the far ones keep still while the pointer moves.
// The whole button moves, so what is clicked is what is drawn there.
function stretch(settings, difference, size) {
    if (!settings["animate-appicon-hover"] || settings["animate-appicon-hover-animation-type"] !== "PLANK") return 0
    if (difference === null || difference === undefined) return 0
    var max = reach(settings, size), distance = Math.abs(difference)
    if (max <= 0) return 0
    var shift = distance <= max ? distance / (2 + 8 * distance / max) : max / 10
    return value(settings, "zoom", "PLANK", 1) * (difference > 0 ? -shift : shift)
}
function limitOffset(offset, center, size, extent) {
    // Clamp paint, never slots: magnification cannot feed back into allocation.
    var half = Math.min(size, extent) / 2
    return Math.max(half - center, Math.min(extent - half - center, offset))
}
function clearance(settings, thickness, icon, crossSize) {
    if (!settings["animate-appicon-hover"]) return 0
    var motion = transform(settings, 1, thickness, 1), zoom = Math.max(1, motion.zoom)
    // Rotation interpolates from zero (plus the urgent dance's 10 degrees).
    // The square's largest projection occurs at 45 degrees, even if the final
    // configured angle is larger. Reserve the whole path, not just its endpoint.
    var angle = Math.min(45, Math.abs(motion.rotation) + 10) * Math.PI / 180
    var half = icon * zoom * (Math.cos(angle) + Math.sin(angle)) / 2
    var travel = Math.max(0, motion.travel) + icon * (zoom - 1) / 2
    return Math.ceil(Math.max(0, half + travel - crossSize / 2))
}
// macOS-style Plank (a plugin option): the row makes exactly as much room as
// its icons grow, so none overlap, and the panel widens with them.
function macos(settings) {
    return !!settings["animate-appicon-hover"] && settings["animate-appicon-hover-animation-type"] === "PLANK" &&
        !!settings["animate-appicon-hover-macos"]
}
// Lays out `slots` ([{start, size, icon}] at rest, in order along the panel,
// gaps allowed) around a pointer at `pointer` on the same axis (null: none).
// Each slot grows by its icon's growth. The spot under the pointer stays
// under it, so the row grows away from the pointer on both sides. Returns
// per slot its level and growth, and the shift that centers its rest box in
// its grown one, plus how far the row now reaches past its rest ends.
function dock(settings, slots, pointer) {
    var n = slots.length, levels = [], growth = [], shift = [], i
    var none = {level: [], growth: [], shift: [], before: 0, after: 0}
    for (i = 0; i < n; i++) { none.level.push(0); none.growth.push(0); none.shift.push(0) }
    if (!macos(settings) || pointer === null || pointer === undefined || !n) return none
    var top = value(settings, "zoom", "PLANK", 1)
    for (i = 0; i < n; i++) {
        levels.push(level(settings, false, pointer - slots[i].start - slots[i].size / 2, slots[i].size))
        growth.push(slots[i].icon * (top - 1) * levels[i])
    }
    function end(j) { return slots[j].start + slots[j].size }
    // Anchor the slot under the pointer (or the gap, or the row's end, it's
    // over) so the pointer keeps the same spot; lay the rest out from it.
    var starts = new Array(n), k = -1
    for (i = 0; i < n; i++) if (slots[i].start <= pointer) k = i
    if (k < 0) { k = 0; starts[0] = slots[0].start }
    else if (pointer <= end(k)) starts[k] = pointer - (pointer - slots[k].start) / slots[k].size * (slots[k].size + growth[k])
    else starts[k] = slots[k].start - growth[k]
    for (i = k + 1; i < n; i++) starts[i] = starts[i - 1] + slots[i - 1].size + growth[i - 1] + slots[i].start - end(i - 1)
    for (i = k - 1; i >= 0; i--) starts[i] = starts[i + 1] - (slots[i + 1].start - end(i)) - slots[i].size - growth[i]
    for (i = 0; i < n; i++) shift.push(starts[i] + growth[i] / 2 - slots[i].start)
    return {level: levels, growth: growth, shift: shift, before: slots[0].start - starts[0],
        after: starts[n - 1] + slots[n - 1].size + growth[n - 1] - end(n - 1)}
}
// The hover animation's duration in ms, for motion that keeps pace with it.
function duration(settings) { return transform(settings, 0, 0, 1).duration }
