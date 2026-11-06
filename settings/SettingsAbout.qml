pragma ComponentBehavior: Bound
import QtQuick
import qs.Ui as Ui
import qs.Commons as Commons
import "FormModel.js" as Form
import "ui" as Kit

// What this is, then the file behind it: open it, carry it elsewhere, or
// start over.
Column {
    id: root
    required property var host
    required property var config
    required property var strings
    property var nav: null
    signal resetRequested()
    readonly property bool idle: config.valid && config.pendingSettings === null && !config.transferMode && !config.importReview
    readonly property string version: String((host.manifest ? host.manifest.version : "0.1.0") || "0.1.0").slice(0,64)
    spacing: Commons.Style.space(26)
    // The name, large, on its own card.
    Rectangle {
        width: parent.width
        implicitHeight: hero.implicitHeight + Commons.Style.space(36)
        height: implicitHeight
        radius: Kit.Palette.cardRadius
        color: Kit.Palette.card
        border.width: Commons.Style.spacing.hairline
        border.color: Kit.Palette.divider
        Rectangle {
            id: badge
            x: Commons.Style.space(18)
            anchors.verticalCenter: parent.verticalCenter
            width: Commons.Style.space(52); height: width
            radius: Kit.Palette.cardRadius
            color: Kit.Palette.accent
            Text {
                textFormat: Text.PlainText
                anchors.centerIn: parent
                text: ""
                color: Kit.Palette.onAccent
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.title
            }
        }
        Column {
            id: hero
            anchors.left: badge.right
            anchors.leftMargin: Commons.Style.space(16)
            anchors.right: parent.right
            anchors.rightMargin: Commons.Style.space(18)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Commons.Style.space(3)
            Text {
                objectName: "about:version"
                textFormat: Text.PlainText
                width: parent.width; wrapMode: Text.WordWrap
                text: root.strings.t("settings.version").arg(root.version)
                color: Kit.Palette.foreground
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.title
                font.bold: true
            }
            Text {
                textFormat: Text.PlainText
                width: parent.width; wrapMode: Text.WordWrap
                text: root.strings.t("settings.about.tagline")
                color: Kit.Palette.muted
                font.family: Kit.Palette.fontFamily
                font.pixelSize: Commons.Style.font.caption
            }
        }
    }
    Kit.Group {
        id: file
        title: Form.safe(root.strings.t("settings.about.file"))
        Kit.ActionRow {
            objectName: "about:openFile"
            nav: root.nav
            label: Form.safe(root.strings.t("settings.openFile"))
            description: "~/.config/omarchy/familiar-dock.json"
            groupTitle: file.title
            buttonText: Form.safe(root.strings.t("settings.about.open"))
            onTriggered: root.host.actions.settings()
        }
    }
    Kit.Group {
        id: transfer
        title: Form.safe(root.strings.t("settings.transfer"))
        note: root.strings.t("settings.importHelp")
        Kit.NavRow {
            id: pathRow
            nav: root.nav
            label: Form.safe(root.strings.t("settings.about.path"))
            description: root.strings.t("settings.pathHint")
            groupTitle: transfer.title
            navKeys: [{key: "↵", label: "settings.key.edit"}]
            implicitHeight: chosenPath.implicitHeight
            onNavActivate: { chosenPath.forceActiveFocus(); chosenPath.selectAll() }
            Ui.TextField {
                id: chosenPath
                width: parent.width
                placeholderText: root.strings.t("settings.pathHint")
                maximumLength: 4096
                selectByMouse: true
                hasCursor: pathRow.cursorHere
                foreground: Kit.Palette.foreground
                accent: Kit.Palette.accent
                font.family: Kit.Palette.fontFamily
            }
        }
        Kit.ActionRow {
            objectName: "about:export"
            nav: root.nav
            label: Form.safe(root.strings.t("settings.export"))
            description: root.strings.t("settings.about.exportHelp")
            groupTitle: transfer.title
            buttonText: Form.safe(root.strings.t("settings.export"))
            actionEnabled: root.idle
            onTriggered: root.config.transfer("export", chosenPath.text)
        }
        Kit.ActionRow {
            objectName: "about:import"
            nav: root.nav
            label: Form.safe(root.strings.t("settings.import"))
            description: root.strings.t("settings.about.importShort")
            groupTitle: transfer.title
            buttonText: Form.safe(root.strings.t("settings.import"))
            actionEnabled: root.idle
            onTriggered: root.config.transfer("import", chosenPath.text)
        }
    }
    Kit.Group {
        id: start
        title: Form.safe(root.strings.t("settings.about.start"))
        Kit.ActionRow {
            objectName: "about:reset"
            nav: root.nav
            label: Form.safe(root.strings.t("settings.reset"))
            description: root.config.backupPath.length > 0
                ? root.strings.t("settings.backupPath").arg(root.config.backupPath)
                : root.strings.t("settings.about.resetHelp")
            groupTitle: start.title
            buttonText: Form.safe(root.strings.t("settings.about.resetButton"))
            destructive: true
            actionEnabled: root.config.valid && root.config.pendingSettings === null && root.config.resetSnapshot === null && !root.config.importReview
            onTriggered: root.resetRequested()
        }
    }
}
