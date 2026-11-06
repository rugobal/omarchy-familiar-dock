import QtQuick
import QtTest
import "settings" as Settings
import "settings/ui" as Kit
import "settings/FormModel.js" as Form
import "services/Config.js" as ConfigLogic
import "Catalog.js" as Catalog

Item {
    id: root
    width: 700; height: 600
    QtObject {
        id: testConfig
        property var raw: ({})
        property var settings: ConfigLogic.validate(raw)
        property bool valid: true
        property var resetSnapshot: null
        property var pendingSettings: null
        property var pendingRemovals: []
        // While set, writes queue as Config.qml's do until its re-read lands.
        property bool deferWrites: false
        property string pendingOperation: "change"
        property string transferMode: ""
        property string backupPath: ""
        property int writes: 0
        function get(key) { return key === "favorites" ? [] : settings[key] }
        function setSetting(key, value) { var changes = {}; changes[key] = value; setSettings(changes) }
        function land() {
            raw = ConfigLogic.withSettings(raw, pendingSettings || {}, pendingRemovals)
            pendingSettings = null; pendingRemovals = []
            settings = ConfigLogic.validate(raw)
            writes++
        }
        function setSettings(changes, removals) {
            if (deferWrites) {
                var next = Object.assign({}, pendingSettings || {}), gone = pendingRemovals.slice()
                Object.keys(changes).forEach(function(key) { next[key] = changes[key]; gone = gone.filter(function(k) { return k !== key }) })
                var drop = removals || []
                drop.forEach(function(key) { delete next[key]; if (gone.indexOf(key) < 0) gone.push(key) })
                pendingSettings = next; pendingRemovals = gone
                return
            }
            // Match Config.qml's read-before-write notification order, rather
            // than only publishing the final settings snapshot.
            pendingSettings = changes
            settings = ConfigLogic.validate(raw)
            pendingSettings = null
            raw = ConfigLogic.withSettings(raw, changes, removals)
            settings = ConfigLogic.validate(raw)
            writes++
        }
    }
    // The window's navigation controller, reduced to what rows ask of it.
    QtObject {
        id: stubNav
        property Item cursor: null
        property bool searching: false
        property string term: ""
        property var rows: []
        property var host: null
        property bool changedOnly: false
        property var changedShown: ({})
        function changedShows(keys) { return keys.some(function(k) { return changedShown[k] === true }) }
        function registerNavRow(row) { rows.push(row) }
        function unregisterNavRow(row) { rows = rows.filter(function(r) { return r !== row }) }
        function setNavBlocked(row, blocking) {}
        function navTakeFocus() {}
        function rowMatches(label, description, group) { return (label + " " + description + " " + group).toLowerCase().indexOf(term) >= 0 }
    }
    QtObject { id: testStrings; function t(key) { return Catalog.entries[key] || key } }
    // The key service, reduced to what the drawer keybinding row asks of it.
    QtObject {
        id: fakeKeys
        property bool paused: false
        property var status: ({key: "SUPER + ALT + SPACE", state: "custom", userFile: "/home/u/.config/hypr/hyprland.lua", holder: "Altscape: next window", error: ""})
        function pause() { paused = true }
        function resume() { paused = false }
    }
    QtObject { id: keysHost; property var appsKeyService: fakeKeys }
    // The drawer click service and the app library, reduced to what the drawer icon row asks of them.
    QtObject {
        id: fakeClick
        property var choices: [{value: "SUPER + SPACE", label: "Launcher: example.cast", description: "Super+Space"}]
        property bool listed: true
        property string failure: ""
        property int refreshes: 0
        property var bound: ["SUPER + SPACE"]
        function refresh() { refreshes++ }
        function runs(chord) { return bound.indexOf(chord) >= 0 }
    }
    QtObject {
        id: fakeApps
        function sortedEntries(filter) { return [{entry: {id: "firefox", name: "Firefox"}}, {entry: {id: "org.gnome.Nautilus", name: "Files"}}] }
    }
    QtObject { id: clickHost; property var appsKeyService: fakeKeys; property var drawerClickService: fakeClick; property var appLibrary: fakeApps }
    QtObject { id: testHost; property var manifest: ({version:"test"}); property var actions: ({settings:function(){}}) }
    Settings.SettingsTabContent {
        id: content
        width: parent.width
        opened: true; tab: "Position"
        host: testHost; config: testConfig; strings: testStrings
        monitors: ["DP-3","DP-4"]; monitor: "DP-3"; primary: "DP-3"; allMonitors: true
    }
    Settings.MonitorControls {
        id: monitorControls
        width: parent.width
        strings: testStrings; monitors: content.monitors
        monitor: content.monitor; allMonitors: content.allMonitors
        onMonitorSelected: function(value) { content.monitor = value }
        onAllMonitorsSelected: function(value) { content.allMonitors = value }
    }
    // Drawn last so a click lands on it while it is open.
    Kit.ChoiceDialog {
        id: choiceDialog
        width: root.width; height: root.height; z: 100
        message: "Import these commands?"
        entries: [{title: "One", text: "a"}, {title: "Two", text: "b"}, {title: "Three", text: "c"}]
        choices: [{text: "Cancel"}, {text: "Skip commands"}, {text: "Import all", destructive: true}]
        property var picked: []
        onCanceled: picked = picked.concat(["cancel"])
        onChosen: function(index) { picked = picked.concat([index]) }
    }
    TestCase {
        name: "SettingsComponents"
        when: windowShown
        function init() {
            content.opened = true; content.monitors = ["DP-3","DP-4"]
            content.nav = null; stubNav.searching = false; stubNav.term = ""; stubNav.rows = []; stubNav.host = null; stubNav.changedOnly = false; stubNav.changedShown = ({}); fakeKeys.paused = false
            fakeClick.failure = ""; fakeClick.listed = true; fakeClick.bound = ["SUPER + SPACE"]; fakeClick.choices = [{value: "SUPER + SPACE", label: "Launcher: example.cast", description: "Super+Space"}]
            content.allMonitors = true; content.monitor = "DP-3"
            choiceDialog.opened = false; choiceDialog.picked = []
            testConfig.raw = ({}); testConfig.settings = ConfigLogic.validate({})
            testConfig.deferWrites = false; testConfig.pendingSettings = null; testConfig.pendingRemovals = []
        }
        function descendants(item, prefix) {
            var result = []
            if (!item) return result
            if (item.objectName.indexOf(prefix) === 0) result.push(item)
            for (var i = 0; i < item.children.length; i++) result = result.concat(descendants(item.children[i],prefix))
            return result
        }
        // Groups are always open now; kept so each tab test reads the same.
        function expandGroups() {}
        function one(prefix) { return descendants(content.item,prefix).filter(function(item) { return item.objectName === prefix })[0] }
        function typeText(text) { for (var i = 0; i < text.length; i++) keyClick(text[i]) }
        function test_tabs_data() { return Form.tabs.map(function(tab) { return {tag:tab,tab:tab} }) }
        function test_tabs(data) {
            var before = testConfig.writes
            content.tab = data.tab
            tryCompare(content,"status",Loader.Ready)
            expandGroups(); wait(20)
            verify(content.item !== null, data.tab+" builds")
            verify(content.height > 0, data.tab+" reserves visible content")
            compare(content.item.y,0, data.tab+" starts at the top")
            var controls = descendants(content.item, data.tab === "About" ? "about:" : "setting:")
            verify(controls.length > 0, data.tab+" contains controls")
            if (data.tab === "About") compare(controls.length,5)
            compare(testConfig.writes,before,"opening every tab/group never saves")
        }
        function test_switch_from_long_form_to_about() {
            content.tab = "Style"; wait(10); expandGroups(); wait(10)
            verify(content.height > 500)
            var longForm = content.height
            content.tab = "About"; wait(10)
            compare(content.item.y,0)
            // About reserves its own height, not the long form's.
            verify(content.height > 0 && content.height < longForm / 2, "About is " + content.height + " of " + longForm)
            verify(descendants(content.item,"about:reset").length === 1)
            content.opened = false; compare(content.height,0); content.opened = true
        }
        function test_monitor_controls_follow_connections() {
            content.tab = "Position"; content.monitors = ["DP-3"]; wait(10)
            compare(descendants(content.item,"setting:panel-element-positions-monitors-sync").length,0)
            compare(descendants(monitorControls,"monitor:single-note")[0].visible,true)
            compare(descendants(monitorControls,"monitor:selector")[0].visible,false)
            compare(descendants(monitorControls,"monitor:apply-all")[0].visible,false)
            content.monitors = ["DP-3","DP-4"]; wait(10)
            compare(descendants(content.item,"setting:panel-element-positions-monitors-sync").length,1)
            compare(descendants(monitorControls,"monitor:single-note")[0].visible,false)
            compare(descendants(monitorControls,"monitor:selector")[0].visible,true)
            compare(descendants(monitorControls,"monitor:apply-all")[0].visible,true)
            var elements = descendants(content.item,"element:").map(function(item) {return item.objectName})
            compare(elements.length,5)
            verify(elements.indexOf("element:activitiesButton") < 0)
            verify(elements.indexOf("element:systemMenu") < 0)
            var field = descendants(content.item,"setting:panel-element-positions").filter(function(item) {return item.objectName === "setting:panel-element-positions"})[0]
            var value = JSON.parse(JSON.stringify(field.current))
            var at = value.findIndex(function(row) {return row.element === "dateMenu"})
            value[at].visible = !value[at].visible
            descendants(field,"element-editor")[0].update(at,"visible",value[at].visible)
            compare(testConfig.raw["panel-element-positions"]["*"][at].visible,value[at].visible)
        }
        function test_menu_pending_edit_flushes_on_close() {
            content.tab = "Action"; wait(10)
            var editor = descendants(content.item,"menu-editor:panel-context-menu-commands")[0]
            editor.addRow(); editor.editRow(0,"entryTitle","Last edit"); editor.editRow(0,"entryCommand","last")
            var before = testConfig.writes
            content.opened = false
            tryCompare(testConfig,"writes",before+1)
            compare(testConfig.raw["panel-context-menu-titles"][0],"Last edit")
            compare(testConfig.raw["panel-context-menu-commands"][0],"last")
            content.opened = true
        }
        function test_menu_rows_keep_focus_and_pairs_data() {
            return ["panel-context-menu-commands","show-apps-button-context-menu-commands","context-menu-entries"].map(function(key) {return {tag:key,key:key}})
        }
        function test_menu_rows_keep_focus_and_pairs(data) {
            content.tab = data.key.indexOf("show-apps") === 0 ? "Position" : "Action"
            wait(10); expandGroups(); wait(10)
            var editor = descendants(content.item,"menu-editor:"+data.key)[0]
            verify(editor !== undefined)
            editor.addRow()
            var input = descendants(editor,"menu-title:0")[0]
            input.forceActiveFocus()
            keySequence("Ctrl+A"); typeText("Example")
            var command = descendants(editor,"menu-command:0")[0]
            command.forceActiveFocus(); keySequence("Ctrl+A"); typeText("printf example")
            var before = testConfig.writes
            wait(250)
            compare(testConfig.writes,before+1)
            var titlesKey = data.key.replace("commands","titles")
            if (data.key === "context-menu-entries") compare(testConfig.raw[data.key][0].title,"Example")
            else {
                compare(testConfig.raw[titlesKey][0],"Example")
                compare(testConfig.raw[data.key][0],"printf example")
            }
            compare(descendants(editor,"menu-title:0")[0],input,"saving keeps the field alive")
            verify(command.activeFocus,"saving keeps keyboard focus")
            compare(command.cursorPosition,14)
            var changes = {}; changes[data.key] = data.key === "context-menu-entries" ? [{title:"External",cmd:"printf example"}] : ["printf example"]
            if (data.key !== "context-menu-entries") changes[titlesKey] = ["External"]
            testConfig.setSettings(changes)
            wait(10)
            compare(input.text,"External","external edits update an open row")
            editor.addRow(); editor.editRow(1,"entryTitle","Second"); editor.editRow(1,"entryCommand","second")
            editor.moveRow(1,-1); editor.removeRow(1); wait(250)
            compare(testConfig.raw[data.key].length,1)
            if (data.key === "context-menu-entries") compare(testConfig.raw[data.key][0].title,"Second")
            else {
                compare(testConfig.raw[titlesKey].length,1)
                compare(testConfig.raw[titlesKey][0],"Second")
            }
        }
            function test_overview_tiles_write_and_reset() {
            content.tab = "Overview"; wait(10)
            var tile = one("tile:intellihide")
            verify(tile !== undefined, "the Intellihide tile is built")
            compare(tile.checked,false); compare(tile.changed,false)
            tile.requested(true)
            compare(testConfig.raw["intellihide"],true)
            compare(tile.checked,true); compare(tile.changed,true)
            tile.resetRequested()
            compare(testConfig.raw["intellihide"],false)
            compare(tile.changed,false)
            verify(one("setting:panel-positions") !== undefined, "Overview carries the panel's shape")
            verify(one("setting:trans-use-custom-opacity") !== undefined, "and whether its opacity is overridden")
            verify(one("setting:trans-panel-opacity") !== undefined, "and how solid it is")
        }
        function test_overview_look_switches_and_brings_back_custom() {
            content.tab = "Overview"; wait(10)
            var look = one("setting:look")
            verify(look !== undefined, "Overview starts with the look")
            verify(descendants(look,"look-choices")[0] !== undefined, "as a row of choices")
            compare(look.current,"windows","the plugin defaults are the Windows look")
            compare(look.options.length,2,"Custom is offered only once something differs")
            testConfig.setSetting("intellihide",true)
            compare(look.current,"custom")
            compare(look.options.length,3)
            look.pick("macos")
            compare(look.current,"macos")
            compare(testConfig.raw["intellihide"],undefined,"the stock Dock does not hide")
            compare(testConfig.raw["animate-appicon-hover"],true,"it magnifies a little")
            compare(testConfig.raw["animate-appicon-hover-animation-zoom"]["PLANK"],1.3)
            compare(testConfig.raw["look-custom"]["intellihide"],true,"leaving Custom saved it")
            look.navStep(-1)
            compare(look.current,"windows")
            compare(look.options.length,3,"a saved Custom stays on offer")
            look.pick("custom")
            compare(look.current,"custom")
            compare(testConfig.raw["intellihide"],true)
            compare(testConfig.raw["panel-element-positions"],undefined)
        }
        function test_overview_look_plans_against_queued_writes() {
            content.tab = "Overview"; wait(10)
            var look = one("setting:look")
            testConfig.deferWrites = true
            // A toggle not yet read back still goes into the saved Custom.
            testConfig.setSetting("intellihide",true)
            look.pick("macos")
            testConfig.land()
            compare(look.current,"macos")
            compare(testConfig.raw["look-custom"]["intellihide"],true)
            // Windows then Custom, both before the first is read back.
            testConfig.deferWrites = true
            look.pick("windows"); look.pick("custom")
            testConfig.land()
            compare(look.current,"custom")
            compare(testConfig.raw["intellihide"],true)
        }
        function test_overview_look_writes_a_debounced_edit_first() {
            content.tab = "Overview"; wait(10)
            var look = one("setting:look"), length = one("setting:panel-lengths")
            length.step(-1)
            look.pick("macos")
            wait(300)
            compare(look.current,"macos","the old edit does not land over the look")
            compare(testConfig.raw["panel-lengths"]["*"],-1)
            compare(testConfig.raw["look-custom"]["panel-lengths"]["*"],99,"and the saved Custom has it")
        }
        function test_overview_show_apps_key_records_a_pressed_combination() {
            stubNav.host = keysHost; content.nav = stubNav
            content.tab = "Overview"; wait(10)
            var row = one("setting:show-apps-hotkey")
            verify(row !== undefined, "Overview has the drawer keybinding")
            var field = descendants(row,"hotkey:show-apps-hotkey")[0], status = descendants(row,"hotkey-status")[0]
            verify(field !== undefined)
            verify(status.text.indexOf("~/.config/hypr/hyprland.lua") >= 0 && status.text.indexOf("Altscape") >= 0, "it says whose the key is")
            row.activate()
            verify(field.recording); verify(fakeKeys.paused, "Hyprland's bindings pause while recording")
            keyClick(Qt.Key_Meta, Qt.MetaModifier)
            compare(field.hint,"","a modifier alone is still being held")
            keyClick(Qt.Key_A)
            verify(field.recording, "a bare key is no combination")
            compare(field.hint,"settings.hotkey.hold")
            keyClick(Qt.Key_Exclam, Qt.MetaModifier | Qt.ShiftModifier)
            verify(field.recording, "a shifted symbol is not taken for a key")
            compare(field.hint,"settings.hotkey.unsupported")
            keyClick(Qt.Key_Tab, Qt.MetaModifier)
            verify(!field.recording); verify(!fakeKeys.paused, "and they come back")
            compare(testConfig.raw["show-apps-hotkey"],"SUPER + TAB")
            verify(row.changed)
            row.activate(); keyClick(Qt.Key_Escape)
            verify(!field.recording); compare(testConfig.raw["show-apps-hotkey"],"SUPER + TAB","Escape cancels")
            row.activate(); keyClick(Qt.Key_Backspace)
            compare(testConfig.raw["show-apps-hotkey"],"","Backspace turns the key off")
            compare(status.text,testStrings.t("settings.hotkey.offNote"))
            var held = fakeKeys.status
            fakeKeys.status = {key: "", state: "plugin", userFile: "", holder: "", error: "reload failed"}
            verify(status.text.indexOf("reload failed") >= 0, "off, a failed restore still shows")
            fakeKeys.status = held
            row.reset()
            compare(testConfig.raw["show-apps-hotkey"],"SUPER + ALT + SPACE")
            // Escape in Hyprland's recording submap ends it here too.
            row.activate(); verify(field.recording)
            fakeKeys.paused = false
            verify(!field.recording)
        }
        function test_overview_drawer_click_picks_what_a_click_does() {
            stubNav.host = clickHost; content.nav = stubNav
            content.tab = "Overview"; wait(10)
            var row = one("setting:show-apps-click")
            verify(row !== undefined, "Overview has the drawer icon click")
            var status = descendants(row,"drawer-click:status")[0], actions = descendants(row,"drawer-click:actions")[0]
            var stored = function() { return JSON.stringify(testConfig.settings["show-apps-click"]) }
            var rows = function(name) { return descendants(row,"drawer-click:" + name).filter(function(i) { return i.objectName === "drawer-click:" + name }).length }
            verify(!status.visible, "opening the drawer needs no word")
            compare(rows("app") + rows("keybinding") + rows("command"),0,"nor a second row")
            var before = fakeClick.refreshes
            actions.changed("keybinding"); wait(10)
            compare(stored(),JSON.stringify({action:"keybinding",app:"",keybinding:"",command:""}))
            compare(rows("keybinding"),1); compare(rows("app") + rows("command"),0,"only the row the action uses")
            compare(status.text,testStrings.t("settings.drawerClick.unset.keybinding"))
            verify(fakeClick.refreshes > before, "the keybindings are listed again")
            var keys = descendants(row,"drawer-click:keybindings")[0]
            compare(keys.options.length,1); compare(keys.options[0].label,"Launcher: example.cast")
            keys.changed("SUPER + SPACE"); wait(10)
            compare(testConfig.raw["show-apps-click"].keybinding,"SUPER + SPACE")
            verify(status.text.indexOf("Super+Space") >= 0 && status.text.indexOf("example.cast") >= 0, "it says what the key does now")
            verify(row.changed)
            fakeClick.choices = []
            compare(status.text,"A click does what Super+Space does now.","bound, with no name to give")
            fakeClick.bound = []
            verify(status.text.indexOf("Nothing is bound to Super+Space") === 0, "and when nothing is")
            fakeClick.failure = "error: familiar-dock: the binding changed"
            verify(status.text.indexOf("the binding changed") >= 0, "a failed click shows")
            actions.changed("app"); wait(10)
            compare(rows("app"),1); compare(rows("keybinding"),0)
            compare(testConfig.raw["show-apps-click"].keybinding,"SUPER + SPACE","the key is kept for later")
            var apps = descendants(row,"drawer-click:apps")[0]
            compare(apps.options.length,2)
            apps.changed("firefox"); wait(10)
            compare(testConfig.raw["show-apps-click"].app,"firefox")
            compare(status.text,"A click opens Firefox.")
            actions.changed("command"); wait(10)
            var input = descendants(row,"drawer-click:input")[0]
            verify(input !== undefined)
            input.text = "notify-send hi"; input.textEdited(); input.editingFinished(); wait(10)
            compare(stored(),JSON.stringify({action:"command",app:"firefox",keybinding:"SUPER + SPACE",command:"notify-send hi"}))
            compare(status.text,testStrings.t("settings.drawerClick.runs"))
            actions.changed("drawer"); wait(10)
            verify(!row.changed, "back on the drawer, the remembered app, key and command are no change")
            row.reset()
            compare(stored(),JSON.stringify({action:"drawer",app:"",keybinding:"",command:""}))
        }
        function test_changed_view_shows_only_its_settings() {
            testConfig.raw = ({"show-apps-click": {action: "command", command: "ls"}, "dot-position": "TOP"})
            testConfig.settings = ConfigLogic.validate(testConfig.raw)
            stubNav.host = clickHost; content.nav = stubNav
            stubNav.changedShown = {"show-apps-click": true, "dot-position": true}; stubNav.changedOnly = true
            content.tab = "Overview"; wait(10)
            verify(one("setting:show-apps-click").visible, "the changed row stays")
            verify(!one("setting:show-apps-hotkey").visible, "its unchanged neighbour goes")
            verify(!one("setting:look").visible, "no look key changed, so no look")
            verify(!one("tile:intellihide").visible); verify(!one("settings-group:Overview").visible, "a group with nothing changed goes, heading and all")
            verify(one("settings-group:Overview-drawer").visible)
            verify(descendants(one("setting:show-apps-click"),"drawer-click:command")[0].visible, "a row's own parts stay with it")
            stubNav.changedShown = {"intellihide": true}
            verify(one("tile:intellihide").visible && one("setting:look").visible, "a look key brings the look with it")
            verify(!one("tile:group-apps").visible)
            content.tab = "Style"; wait(10)
            stubNav.changedShown = {"dot-position": true}
            verify(one("setting:dot-position").visible)
            one("setting:dot-position").reset()
            compare(testConfig.settings["dot-position"],"BOTTOM")
            verify(one("setting:dot-position").visible && !one("setting:dot-position").changed, "reset, it stays, unmarked")
            stubNav.changedOnly = false
            verify(one("setting:dot-style-focused").visible, "leaving shows every setting again")
        }
        function test_changed_field_resets_to_default() {
            content.tab = "Style"; wait(10)
            var field = one("setting:dot-position")
            verify(field !== undefined)
            compare(field.changed,false)
            verify(!descendants(field,"reset:dot-position")[0].visible, "no reset link at the default")
            field.step(1)
            verify(field.changed, "a step away from the default marks the row")
            verify(descendants(field,"reset:dot-position")[0].visible)
            field.reset()
            compare(field.changed,false)
            compare(testConfig.raw["dot-position"],Form.defaultValue(field.field,"*","DP-3"))
        }
        function test_keyboard_steps_numbers_and_toggles() {
            content.tab = "Position"; wait(10)
            var size = one("setting:panel-sizes"), before = size.current
            size.step(1); wait(250)
            compare(size.current,before + 1)
            content.tab = "Behavior"; wait(10)
            var toggle = one("setting:show-favorites")
            var was = toggle.current
            toggle.activate()
            compare(toggle.current,!was)
        }
        function test_search_hides_rows_and_empty_groups() {
            content.nav = stubNav
            content.tab = "Behavior"; wait(10)
            verify(stubNav.rows.length > 0, "rows register with the window")
            stubNav.term = "intellihide"; stubNav.searching = true; wait(10)
            var groups = descendants(content.item,"settings-group:")
            var shown = groups.filter(function(g) { return g.visible }).map(function(g) { return g.objectName })
            verify(shown.indexOf("settings-group:Intellihide") >= 0, "the matching group stays")
            verify(shown.length < groups.length, "groups with no match leave the page")
            compare(one("setting:show-favorites").visible,false)
            stubNav.searching = false; wait(10)
            compare(one("setting:show-favorites").visible,true)
        }
            function test_pending_edit_stays_with_its_monitor() {
            testConfig.raw = {"panel-sizes": {"DP-3":48,"DP-4":80}}; testConfig.settings = ConfigLogic.validate(testConfig.raw)
            content.allMonitors = false; content.monitor = "DP-3"
            content.tab = "Position"; wait(10)
            var size = one("setting:panel-sizes")
            compare(size.current,48)
            size.step(1)
            content.monitor = "DP-4"
            compare(testConfig.raw["panel-sizes"]["DP-3"],49,"switching monitors writes the waiting edit where it was made")
            compare(size.current,80)
            size.step(1); wait(250)
            compare(testConfig.raw["panel-sizes"]["DP-4"],81,"the next edit starts from the new monitor's value")
            compare(testConfig.raw["panel-sizes"]["DP-3"],49)
        }
        function test_choice_dialog() {
            verify(!choiceDialog.visible)
            verify(!choiceDialog.handleKey({key: Qt.Key_Return}), "a closed dialog takes no keys")
            choiceDialog.opened = true; wait(10)
            verify(choiceDialog.visible)
            var titles = descendants(choiceDialog, "choice:title"), texts = descendants(choiceDialog, "choice:text")
            compare(titles.length, 3, "every entry is shown"); compare(texts.length, 3)
            compare(titles[0].text, "One"); compare(texts[2].text, "c")
            verify(!descendants(choiceDialog, "choice:scrollbar")[0].visible, "a short list does not scroll")
            compare(choiceDialog.selectedIndex, 0, "the safe answer is selected when it opens")
            verify(choiceDialog.handleKey({key: Qt.Key_Left})); compare(choiceDialog.selectedIndex, 2)
            verify(choiceDialog.handleKey({key: Qt.Key_Tab})); compare(choiceDialog.selectedIndex, 0)
            verify(choiceDialog.handleKey({key: Qt.Key_Right}))
            verify(choiceDialog.handleKey({key: Qt.Key_Return}))
            compare(choiceDialog.picked, [1])
            verify(choiceDialog.handleKey({key: Qt.Key_Escape}))
            compare(choiceDialog.picked, [1, "cancel"])
            verify(!choiceDialog.handleKey({key: Qt.Key_A}), "other keys pass through")
            mouseClick(descendants(choiceDialog, "choice:2")[0])
            compare(choiceDialog.picked, [1, "cancel", 2])
            mouseClick(choiceDialog, 4, 4)
            compare(choiceDialog.picked, [1, "cancel", 2, "cancel"], "a click outside the card cancels")
            choiceDialog.opened = false; choiceDialog.opened = true
            compare(choiceDialog.selectedIndex, 0, "reopening selects the safe answer again")
            // A list taller than the screen scrolls inside the card, every
            // entry still there, and the card stays on screen.
            var long = []
            for (var i = 0; i < 40; i++) long.push({title: "Entry " + i, text: "command " + i + " " + "x".repeat(200)})
            choiceDialog.entries = long; wait(10)
            var list = descendants(choiceDialog, "choice:list")[0]
            compare(descendants(choiceDialog, "choice:text").length, 40)
            tryVerify(function() { return list.contentHeight > list.height }, 2000, "the list scrolls: " + list.contentHeight + " in " + list.height)
            verify(descendants(choiceDialog, "choice:scrollbar")[0].visible)
            var top = list.mapToItem(choiceDialog, 0, 0).y
            verify(top >= 0 && top + list.height <= choiceDialog.height, "the list stays on screen")
            compare(list.contentY, 0)
            verify(choiceDialog.handleKey({key: Qt.Key_Down})); verify(list.contentY > 0)
            verify(choiceDialog.handleKey({key: Qt.Key_PageDown})); var paged = list.contentY
            verify(paged > list.height * 0.5)
            verify(choiceDialog.handleKey({key: Qt.Key_PageUp})); verify(list.contentY < paged)
            for (var j = 0; j < 100; j++) choiceDialog.handleKey({key: Qt.Key_PageDown})
            compare(list.contentY, list.contentHeight - list.height, "it stops at the last entry")
            choiceDialog.opened = false; choiceDialog.opened = true
            compare(list.contentY, 0, "reopening starts at the top")
            choiceDialog.entries = [{title: "One", text: "a"}, {title: "Two", text: "b"}, {title: "Three", text: "c"}]
        }
        function test_synchronized_layout_reset_is_inert() {
            var control = Form.controls.filter(function(c) { return c.key === "panel-element-positions" })[0]
            var layout = JSON.parse(JSON.stringify(Form.defaultValue(control,"*","DP-3")))
            layout[0].visible = !layout[0].visible
            testConfig.raw = {"panel-element-positions-monitors-sync": true, "panel-element-positions": {"*": layout}}
            testConfig.settings = ConfigLogic.validate(testConfig.raw)
            content.allMonitors = false; content.tab = "Position"; wait(10)
            var field = one("setting:panel-element-positions")
            verify(field.layoutBlocked); verify(field.changed)
            verify(!descendants(field,"reset:panel-element-positions")[0].visible, "no reset link on a synchronized layout")
            var before = testConfig.writes
            field.reset(); field.commit(layout,false)
            compare(testConfig.writes,before,"a synchronized layout is not written for one monitor")
        }
    }
}
