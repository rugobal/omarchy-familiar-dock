.pragma library
function initial(now) { return {shown: true, pending: null, deadline: 0, started: now} }
// All times are monotonic inputs supplied by the host. No QML or compositor calls.
function step(previous, input, settings, now) {
    var state = {shown: previous.shown, pending: previous.pending, deadline: previous.deadline, started: previous.started}
    var enabled = settings.intellihide && !(input.primary && settings["intellihide-only-secondary"])
    var allowed = !input.fullscreen || settings["intellihide-show-in-fullscreen"]
    var hold = input.popup || input.held || input.notification || input.reveal ||
        (settings["intellihide-revealed-hover"] && previous.shown && input.hover)
    var shown = !enabled || (allowed && (hold || now - state.started < settings["intellihide-enable-start-delay"] ||
        ((settings["intellihide-hide-from-windows"] || settings["intellihide-hide-from-monitor-windows"]) && !input.overlap)))
    if (input.fullscreen && !allowed) shown = false
    var reason = !enabled ? "disabled" : !allowed ? "fullscreen" : hold ? "held" : shown ? "clear" : "overlap-or-autohide"
    if (shown === state.shown) { state.pending = null; state.deadline = 0 }
    else {
        if (state.pending !== shown) {
            state.pending = shown
            state.deadline = now + (!enabled || !allowed ? 0 : settings[shown ? "intellihide-reveal-delay" : "intellihide-close-delay"])
        }
        if (now >= state.deadline) { state.shown = shown; state.pending = null }
    }
    state.enabled = enabled; state.reason = reason
    return state
}
