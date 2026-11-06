.pragma library
function step(previous, delta, delay, now) {
    if (!isFinite(delta) || !delta) return {state: previous, direction: 0}
    previous = previous || {time: -Infinity, remainder: 0}
    if (now - previous.time < delay) return {state: previous, direction: 0}
    var total = (previous.remainder * delta < 0 ? 0 : previous.remainder) + Math.max(-120, Math.min(120, delta))
    var direction = Math.abs(total) >= 120 ? (total > 0 ? 1 : -1) : 0
    return {state: {time: direction ? now : previous.time, remainder: direction ? 0 : total}, direction: direction}
}
