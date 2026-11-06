import QtQuick
import qs.Commons as Commons
import "." as Local

// One row the window's keyboard cursor can land on: whether the cursor is
// here, what the keys do here (for the legend), whether the search or the
// changed view hides it, and whether it differs from its default. It knows nothing about what the
// row looks like; rows and tiles declare their own children on top of it.
// After OmaControl's ui/NavRow.qml (MIT, see NOTICE.md).
FocusScope {
    id: row
    // The window's navigation controller, or null outside a window (tests).
    property var nav: null
    // A row whose parts are rows of their own does not stop the cursor.
    property bool navigable: true
    property string label: ""
    property string description: ""
    // The heading the row sits under counts as part of it for the search.
    property string groupTitle: ""
    property bool changed: false
    // While a row owns the keyboard (an open list), the window lets it be.
    property bool navBlocking: false
    // [{key, label}] for the legend; labels are catalog keys.
    property var navKeys: []
    property bool showBand: true
    property real bandInset: Commons.Style.space(10)
    readonly property bool cursorHere: !!nav && nav.cursor === row
    signal navActivate()
    signal navStep(int delta)
    signal resetRequested()
    // The settings the row edits. The changed view shows it while any of
    // them is in the view; a row with none (a part of a larger row, a
    // monitor choice) is not the view's to hide.
    property var changeKeys: []
    // A row the search does not match, or the changed view leaves out,
    // leaves the page rather than dimming.
    readonly property bool searchHidden: !!nav && ((nav.searching === true && !nav.rowMatches(label, description, groupTitle))
        || (nav.changedOnly === true && changeKeys.length > 0 && !nav.changedShows(changeKeys)))
    visible: !searchHidden
    width: parent ? parent.width : 0
    opacity: enabled ? 1 : 0.45
    onNavBlockingChanged: if (nav) nav.setNavBlocked(row, navBlocking)
    Component.onCompleted: if (nav && navigable) nav.registerNavRow(row)
    Component.onDestruction: if (nav) nav.unregisterNavRow(row)

    // The cursor: a band reaching into the margin so the text has room.
    // First child, so everything the row declares draws over it.
    Rectangle {
        visible: row.cursorHere && row.showBand
        anchors.fill: parent
        anchors.leftMargin: -row.bandInset
        anchors.rightMargin: -row.bandInset
        anchors.topMargin: -Commons.Style.space(6)
        anchors.bottomMargin: -Commons.Style.space(6)
        radius: Local.Palette.chipRadius
        color: Local.Palette.tint(0.14)
    }
}
