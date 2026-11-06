.pragma library
function dimensions(settings, vertical, sourceWidth, sourceHeight) {
    var size = Math.max(24, settings["window-preview-size"]), ratio = settings["window-preview-aspect-ratio-x"] / settings["window-preview-aspect-ratio-y"]
    var maxW = vertical ? size : size * ratio, maxH = vertical ? size / ratio : size
    var scale = sourceWidth > 0 && sourceHeight > 0 ? Math.min(maxW / sourceWidth, maxH / sourceHeight) : 1
    return {width: settings["window-preview-fixed-x"] || !sourceWidth ? maxW : Math.max(24, sourceWidth * scale),
        height: settings["window-preview-fixed-y"] || !sourceHeight ? maxH : Math.max(24, sourceHeight * scale)}
}
