.pragma library

function linear(channel) { return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4) }
function luminance(rgb) { return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]) }
function contrast(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
function grayscale(data) {
    var result = Array.prototype.slice.call(data)
    // MultiEffect's default saturation weights, in sRGB channel space.
    for (var i = 0; i < result.length; i += 4) {
        var gray = Math.round(0.2125 * data[i] + 0.7154 * data[i + 1] + 0.0721 * data[i + 2])
        result[i] = gray; result[i + 1] = gray; result[i + 2] = gray
    }
    return result
}
function rgb(hex) {
    var m = /^#([a-f0-9]{6})$/i.exec(String(hex))
    return m ? [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255] : null
}
function hex(channels) { return "#" + channels.map(function(c) { return Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0") }).join("") }
function analyze(data, width, height) {
    if (width < 1 || height < 1 || data.length < width * height * 4) throw new Error("Invalid icon pixels")
    var edges = [], bins = {}, dominant = [0, 0, 0], max = 0
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
        var i = (y * width + x) * 4
        if (data[i + 3] < 128) continue
        var color = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
        var edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
            || data[i - 4 + 3] < 128 || data[i + 4 + 3] < 128
            || data[i - width * 4 + 3] < 128 || data[i + width * 4 + 3] < 128
        if (edge) edges.push(luminance(color))
        var key = color.map(function(c) { return Math.floor(c * 15) }).join(",")
        var bin = bins[key] || {count: 0, sum: [0, 0, 0]}
        bin.count++; for (var k = 0; k < 3; k++) bin.sum[k] += color[k]
        bins[key] = bin
        if (bin.count > max) { max = bin.count; dominant = bin.sum.map(function(c) { return c / bin.count }) }
    }
    if (!edges.length) throw new Error("Icon has no silhouette")
    return {edges: edges, dominant: hex(dominant)}
}
function legibility(edges, background) {
    if (!edges || !edges.length) return 1 // Unknown is not a reason to alter an icon.
    var l = typeof background === "number" ? background : luminance(rgb(background))
    return edges.filter(function(edge) { return contrast(edge, l) >= 3 }).length / edges.length
}
function outlineAlpha(edges, background, foreground) {
    if (legibility(edges, background) >= 0.5) return 0
    var bg = rgb(background), fg = rgb(foreground), bgL = luminance(bg)
    if (contrast(luminance(fg), bgL) < 3) return 0
    var low = 0, high = 1
    for (var i = 0; i < 16; i++) {
        var mid = (low + high) / 2
        var blended = fg.map(function(c, k) { return bg[k] + (c - bg[k]) * mid })
        if (contrast(luminance(blended), bgL) >= 3) high = mid
        else low = mid
    }
    return high
}
function palette(text) {
    var result = {}
    String(text).slice(0, 65536).split("\n").forEach(function(line) {
        var m = /^\s*([\w-]+)\s*=\s*["'](#[a-f0-9]{6})["']/i.exec(line)
        if (m) result[m[1]] = m[2].toLowerCase()
    })
    return result
}
function choose(candidates, foreground, samples, dark) {
    var textL = luminance(rgb(foreground)), scores = []
    Object.keys(candidates).forEach(function(role) {
        var color = candidates[role]
        if (!rgb(color)) return
        var bgL = luminance(rgb(color)), text = contrast(textL, bgL)
        scores.push({role: role, color: color, textContrast: text, eligible: text >= 4.5,
            score: samples.filter(function(s) { return s && legibility(s.edges, bgL) >= 0.5 }).length})
    })
    var eligible = scores.filter(function(s) { return s.eligible })
    eligible.sort(function(a, b) {
        return b.score - a.score || (a.role === "bar" ? -1 : b.role === "bar" ? 1 : 0)
            || (dark ? 1 : -1) * (luminance(rgb(a.color)) - luminance(rgb(b.color)))
            || a.role.localeCompare(b.role)
    })
    return {best: eligible[0] || null, scores: scores}
}
function dots(color) {
    var data = new Array(48 * 48 * 4).fill(0), c = rgb(color)
    for (var y = 0; y < 48; y++) for (var x = 0; x < 48; x++) {
        var cx = 8 + Math.round((x - 8) / 16) * 16, cy = 8 + Math.round((y - 8) / 16) * 16
        if (cx < 8 || cx > 40 || cy < 8 || cy > 40 || Math.pow(x - cx, 2) + Math.pow(y - cy, 2) > 16) continue
        var i = (y * 48 + x) * 4
        for (var k = 0; k < 3; k++) data[i + k] = Math.round(c[k] * 255)
        data[i + 3] = 255
    }
    return analyze(data, 48, 48)
}
