#!/usr/bin/env python3
"""Expand the checked-in schema key inventory into the configuration audit."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]

form_source = (root/'settings/Descriptors.js').read_text()
form_entries = json.loads(form_source[form_source.index('['):])
form_keys = {entry['key']: entry for entry in form_entries}
form_labels = json.loads((root/'i18n/en.json').read_text())
def form_control(key):
    field = form_keys.get(key)
    if not field: return '— (inert)'
    label = form_labels[field['label']].replace('|', '&#124;')
    paired = key in ['panel-context-menu-titles', 'show-apps-button-context-menu-titles']
    note = ' (Title field in the paired menu editor)' if paired else ''
    return f"`{field['tab']} / {field['group']} / {key}` — {label}{note}"
keys=json.loads((root/'tests/schema-keys.json').read_text())
rows={}; tab='Position'
reference=(root/'docs/settings-reference.md').read_text()
for line in reference.splitlines():
    if line.startswith('### ') and line.endswith(' tab'): tab=line[4:-4]
    if line.startswith('**Intellihide**'): tab='Intellihide'
    if line=='### Internal keys': tab='Internal'
    if not line.startswith('| `'): continue
    cells=line.split('|'); names=re.findall(r'`([^`]+)`',cells[1]); verdict=cells[-2].strip()
    for name in names:
        if name in keys: rows[name]=(tab,verdict)
for key in keys:
    if key in rows: continue
    if key.startswith('app-') and 'hotkey' in key: rows[key]=('Action','Yes: externally installed Lua bindings')
    elif key.startswith('animate-appicon-hover-animation-'): rows[key]=('Style','Yes')
    elif key.startswith('dot-color-'): rows[key]=('Style','Yes')
    else: raise ValueError('Unmapped schema key '+key)
# Expand keys covered by the shared prefix/range rows; never read later tables
# (the user's exact configuration repeats keys without a parity verdict).
output=['# Settings coverage — run 4','',
'The pinned schema contains **247 keys**, rather than the 265 stated in the reference prose. This inventory expands every reference range (including all 60 generated accelerators). Each schema key appears exactly once. Plugin-only extensions follow the table. All keys are type-validated by `services/Config.js`; No/Drop behavior stays inert, except the progress bar explicitly requested for run 3.',
'', 'Coverage names refer to tests in `tests/run.mjs`; visual results require the corresponding fixture and live checklist. A validated key is not a claim of compositor verification.','',
'| Key | Verdict | Status / concrete limitation | Implementation | Coverage | Settings control |', '| --- | --- | --- | --- | --- | --- |']
for key in keys:
    tab,verdict=rows[key]; verdict=verdict.replace('|','/'); status='implemented in run 1'; file='panel/Panel.qml'; test='monitor/layout/icon geometry; '+tab+' fixture'
    if verdict.startswith(('No','Drop')):
        status='inert by design — '+verdict;file='services/Config.js';test='all pinned schema keys including Drop'
    elif tab=='Intellihide':
        status='implemented this run — edge dwell replaces pressure';file='services/Intellihide.qml';test='intellihide state machine; proximity; Intellihide fixture'
    elif tab=='Style':
        file='panel/AppButton.qml';test='icon geometry / indicators / colors; Style fixture'
        if key.startswith('trans-') or key.startswith('panel-'): file='panel/Panel.qml'
        if key=='global-border-radius': status='implemented this run — exact 4px steps on panel, popups and grid';file='panel/PopupFrame.qml';test='numeric validation / live Style fixture'
        if key.startswith('animate-appicon-hover'): status='implemented this run';file='panel/Hover.js';test='hover SIMPLE RIPPLE PLANK tuning; Style fixture'
        if key in ['dot-color-dominant','focus-highlight-dominant']: status='implemented this run — shared sampler/cache';test='silhouette dominant color; Style fixture'
        if key.startswith('trans-dynamic') or key=='trans-use-dynamic-opacity': status='implemented this run';test='proximity filters; Style fixture'
        if key=='appicon-style': verdict='Partial — symbolic theme availability; grayscale effect'
    elif tab=='Behavior':
        status='implemented in run 2';file='services/AppModel.qml';test='grouped/ungrouped / filtering; Behavior fixture'
        if 'preview' in key or key in ['peek-mode','enter-peek-mode-timeout','leave-timeout']: file='panel/PreviewPopup.qml';test='preview sizing / shared fade / exact restoration; Behavior fixture'
        if key=='show-tooltip': file='panel/AppButton.qml';test='bounded plain text; Behavior fixture'
    elif tab=='Action':
        status='implemented in run 2';file='services/WindowActions.qml';test='nine grouped actions / input combinations / scroll / menus; Action fixture'
        if key.startswith(('hot','shortcut','overlay')) or 'hotkey' in key:
            status='implemented this run';file='services/Hotkeys.js';test='hotkeys and overlays off / source / secondary gates; Action fixture'
    elif tab=='Fine-Tune':
        file='panel/AppButton.qml';test='indicator geometry / launch motion; Fine-Tune fixture'
        if key in ['tray-size','tray-padding','status-icon-padding']: status='implemented this run — visible rightBox only';file='panel/Tray.qml';test='hidden tray creates no delegates; live tray size check'
        if key in ['leftbox-size','leftbox-padding']: status='inert by design — leftBox is an empty compatibility container; no hosted left-box widgets to size';file='panel/Panel.qml';test='overflow / hidden elements; Fine-Tune fixture'
        if key=='stockgs-keep-top-panel': status='inert by design — service manifest coexists with stock bar; replacing it requires a separate bar-kind entry point, not a live boolean';file='manifest.json';test='manifest validation; live coexistence'
        if key=='stockgs-force-hotcorner': status='implemented this run — 2px primary corner opens app grid after dwell';file='panel/Panel.qml';test='live Fine-Tune fixture'
        if key=='stockgs-panelbtn-click-only': status='implemented this run — disables hover switching between clock/tray menus';file='panel/Panel.qml';test='live Fine-Tune fixture'
    if key=='panel-element-positions': verdict='Partial — Activities/System menu dropped; left/center boxes empty; tray in rightBox'
    if key=='context-menu-entries':
        status='implemented — fresh/reset defaults match the seed: Terminal → TERMINALSETTINGS (default terminal); System monitor → omarchy-launch-or-focus-tui btop; Files → nautilus --new-window';test='Omarchy default overrides / seed / private-HOME reset; Action fixture'
    if key in ['intellihide-key-toggle','intellihide-key-toggle-text','shortcut','shortcut-text','hotkey-prefix-text'] or 'hotkey-' in key:
        status='inert by design — accelerator metadata; compositor bindings require reviewer-installed Lua; stock prefixes clash (see hotkeys.md)';file='docs/hotkeys.md';test='hotkeys off gate; reviewer Lua checks'
    if key=='progress-show-count': status='implemented this run — Unity counts; notification service exposes no per-app counts through scoped facade';verdict='Partial';file='services/Badges.qml';test='Unity transcript / badges off'
    if key=='progress-show-bar': status='implemented this run — explicit brief overrides legacy Drop; off by default';verdict='Partial';file='services/Badges.qml';test='Unity transcript / progress opt in'
    output.append(f'| `{key}` | {verdict} | {status} | `{file}` | {test} | {form_control(key)} |')
output+=['','Plugin extensions: `favorites` (run 1/2, AppModel/Config/SystemDefaults), `hide-omarchy-dock` (run 1/2, DockLifecycle), `theme-bg-color` and `icon-contrast-outline` (run 2, ThemeBackground/IconColors), `show-scratchpad-windows` (AppModel; off by default, hides windows on Hyprland special workspaces except `special:minimized`), `animate-appicon-hover-macos` (Hover/Taskbar/Panel; off by default, macOS-style Plank: icons make the room they grow by, Show Apps joins the row when it touches the taskbar, and a fit-to-icons panel widens), `show-apps-hotkey` (AppsKey/Chord/HotkeyField/Cleanup; Overview and Position, default Omarchy\'s Super+Alt+Space Apps key, recorded by pressing a combination while Hyprland\'s bindings are paused in an empty submap; binds the key to Show Applications inside the running compositor while the plugin runs, replaces only Omarchy\'s own default binding on it, leaves the key alone when the user\'s own Hyprland files bind it or another binding uses it in any submap, reloads only once per change of key, and reloads Hyprland once on disable to restore the configured binding; no Hyprland file is written), `show-apps-click` (DrawerClick/DrawerClickField; Overview and Position, default open the drawer; a left click on Show Apps opens the drawer, an app, a command, or follows a keybinding by listing its bindings at each click and running the Lua functions Hyprland runs for that key in its own Lua state, outside submaps and never the plugin\'s own drawer key, after checking every one is still there; an app gone, nothing bound or nothing picked opens the drawer; right-click then offers Open the app drawer; no Hyprland file is written), `look-custom` (Looks/LookField; default null, no control of its own: the Overview **Look** row saves the look keys there when leaving a Custom look, so Custom can be picked again; validated key by key). Their tests cover default resolution, ownership, theme choice, outline thresholds and scratchpad filtering.','',
'Pressure keys remain validated and inert. The reveal delay supplies dwell timing, rather than pretending to measure pressure. Maximized clients use Hyprland fullscreen/maximized data, with a monitor-coverage heuristic for ordinary tiled clients, since Hyprland has no GNOME maximized flags. Global radius applies only to plugin surfaces. Blur and physical shortcuts are reviewer-managed.']
output += ['', 'Settings metadata is defined once per key in `settings/FormModel.js` / `Descriptors.js`. Each command/title pair shares one row editor, which writes both arrays together. The element editor exposes the five rendered elements, including `dateMenu` clock visibility; Activities, System menu and empty left/center boxes are omitted, with their saved entries and array positions preserved. Monitor selection, apply-to-all and persistent layout synchronization appear with two or more connected monitors. Plugin-only controls: Style / theme-bg-color, Style / icon-contrast-outline, Style / animate-appicon-hover-macos, Position / show-apps-hotkey, Position / show-apps-click, Fine-Tune / hide-omarchy-dock; Behavior / favorites is a read-only list. Overview / Look sets 19 existing appearance keys at once (`settings/Looks.js`: Windows, macOS, Custom) and is read back from them, not stored.']
(root/'docs/settings-coverage.md').write_text('\n'.join(output)+'\n')
(root/'tests/settings-tabs.json').write_text(json.dumps({k:v[0] for k,v in rows.items()},indent=2)+'\n')
