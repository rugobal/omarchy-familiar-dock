.pragma library
function position(edge, width, height, popupWidth, popupHeight, gap) {
    if (edge === "LEFT") return {x: width + gap, y: (height - popupHeight) / 2}
    if (edge === "RIGHT") return {x: -popupWidth - gap, y: (height - popupHeight) / 2}
    return {x: (width - popupWidth) / 2, y: edge === "BOTTOM" ? -popupHeight - gap : height + gap}
}
