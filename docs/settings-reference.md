# Dash to Panel settings reference

Every key of the Dash to Panel GNOME extension, as it maps onto Omarchy. Familiar Dock keeps these setting names, so this is also the reference for `~/.config/omarchy/familiar-dock.json`. What the plugin actually implements, key by key, is in [settings-coverage.md](settings-coverage.md).

All 265 keys of `org.gnome.shell.extensions.dash-to-panel`, from the schema at the pinned commit, grouped the way the preferences window shows them. Dash to Panel v74 has the same keys and defaults. Related keys share a row. Keys marked **legacy** are in the schema, but no code in the extension reads them anymore.

**On Omarchy** column:

- **Yes**: Quickshell and Hyprland can match it closely.
- **Partial**: possible with a workaround or with less fidelity; the reason is given.
- **No**: Hyprland or Wayland does not allow it; a replacement is suggested.
- **Drop**: GNOME-only or internal; nothing to build.

Per-monitor keys (`panel-positions`, `panel-sizes`, `panel-lengths`, `panel-anchors`, `panel-element-positions`) are JSON strings keyed by monitor id (`vendor-serial`). On Omarchy, key them by Hyprland monitor name (`DP-1`, `eDP-1`), with `"*"` for "all monitors".

### Position tab

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `panel-positions` | JSON per monitor | `{}` = bottom | Screen edge per monitor: `TOP`, `BOTTOM`, `LEFT`, `RIGHT` | Yes: layer-shell anchors |
| `panel-position` | enum | `BOTTOM` | Old global edge, migrated into `panel-positions` | Drop (legacy) |
| `panel-sizes` | JSON per monitor | `{}` = 48 | Panel thickness in px (slider marks 22, 32, 48, 64, 96, 128) | Yes |
| `panel-size` | int | `48` | Old global thickness | Drop (legacy) |
| `panel-lengths` | JSON per monitor | `{}` = 100 | Percent of the edge the panel spans; `-1` = shrink to fit its content (dock look) | Yes |
| `panel-anchors` | JSON per monitor | `{}` = `MIDDLE` | Where a shorter panel sits: `START`, `MIDDLE`, `END` | Yes |
| `panel-element-positions` | JSON per monitor | `{}` = default order | Order, visibility and position of the nine elements. Positions: `stackedTL` (packed at start), `stackedBR` (packed at end), `centered` (centered among its neighbors), `centerMonitor` (centered on the monitor) | Yes for Show Apps, taskbar, clock, Show Desktop. Partial for the rest; see the parity matrix |
| `panel-element-positions-monitors-sync` | bool | `true` | Use one element layout on every monitor | Yes |
| `primary-monitor` | string | `''` = GNOME primary | Which monitor holds the main panel | Yes: a Hyprland monitor name |
| `multi-monitors` | bool | `true` | Show a panel on every monitor | Yes: one panel per screen |
| `show-activities-button` | bool | `false` | Old toggle; Activities visibility now lives in `panel-element-positions` | Drop (legacy) |
| `show-apps-icon-file` | string | `''` | Custom image for the Show Apps button | Yes |
| `show-apps-icon-side-padding` | int | `8` | Side padding of the Show Apps button, px | Yes |
| `show-apps-override-escape` | bool | `true` | Escape in the app grid goes straight to the desktop | Drop: the launcher handles Escape |
| `show-apps-button-context-menu-commands`, `show-apps-button-context-menu-titles` | string lists | `[]` | Extra commands in the Show Apps right-click menu, matched by index | Yes |
| `showdesktop-button-width` | int | `8` | Show Desktop strip width, px | Yes |
| `desktop-line-use-custom-color`, `desktop-line-custom-color` | bool, color | `false`, `rgba(200,200,200,0.2)` | Color of the strip's 1 px divider line | Yes |
| `show-showdesktop-hover`, `show-showdesktop-delay`, `show-showdesktop-time` | bool, ms, ms | `false`, `1000`, `300` | Hovering the strip fades every window to transparent after the delay, over the given time | Partial: per-window opacity through Hyprland; the fade may step rather than glide |

**Intellihide** (options dialog on the Position tab)

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `intellihide` | bool | `false` | Auto-hide the panel | Yes |
| `intellihide-hide-from-windows` | bool | `false` | Hide only when a window touches the panel; otherwise stay | Yes: window geometry from Hyprland |
| `intellihide-behaviour` | enum | `FOCUSED_WINDOWS` | Which windows count: `ALL_WINDOWS`, `FOCUSED_WINDOWS` (the focused app's), `MAXIMIZED_WINDOWS` | Yes |
| `intellihide-hide-from-monitor-windows` | bool | `false` | Count only windows on this panel's monitor | Yes |
| `intellihide-use-pointer`, `intellihide-use-pointer-limit-size` | bool, bool | `true`, `false` | Reveal when the pointer reaches the edge; optionally only along the panel's length | Yes: a thin always-present edge strip |
| `intellihide-revealed-hover`, `intellihide-revealed-hover-limit-size` | bool, bool | `true`, `false` | Stay revealed while the pointer is over it | Yes |
| `intellihide-use-pressure`, `intellihide-pressure-threshold`, `intellihide-pressure-time` | bool, px, ms | `false`, `100`, `1000` | Reveal only after pushing the pointer into the edge | No: Wayland clients get no pointer barriers. Use a dwell time on the edge strip instead |
| `intellihide-show-in-fullscreen` | bool | `false` | Allow revealing over fullscreen windows | Partial: Hyprland 0.57 puts Top-layer surfaces below fullscreen windows, so switch the panel to the Overlay layer while revealed |
| `intellihide-show-on-notification` | bool | `false` | Reveal briefly when an app wants attention | Yes: `HyprlandToplevel.urgent` |
| `intellihide-only-secondary` | bool | `false` | Auto-hide only on secondary monitors | Yes |
| `intellihide-animation-time`, `intellihide-close-delay`, `intellihide-reveal-delay`, `intellihide-enable-start-delay` | ms | `200`, `400`, `0`, `2000` | Slide time, delay before hiding, delay before revealing, grace period after login | Yes |
| `intellihide-key-toggle`, `intellihide-key-toggle-text` | key | `<Super>i` | Shortcut to toggle the panel | Yes: a Hyprland bind that calls the panel; pick a key Omarchy does not use |
| `intellihide-persisted-state` | int | `-1` | Remembers a toggled state across restarts | Yes: a state file |

### Style tab

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `appicon-margin` | int | `8` | Space around each app button, px (marks 0 to 32) | Yes |
| `appicon-padding` | int | `4` | Padding inside each app button; the icon fills the rest | Yes |
| `global-border-radius` | int 0 to 5 | `0` | Corner rounding, in steps of 4 px, for the panel, previews and menus | Yes |
| `appicon-style` | enum | `NORMAL` | Icons as `NORMAL`, `SYMBOLIC` or `GRAYSCALE` | Partial: grayscale is a color effect; symbolic needs the theme's `-symbolic` icons |
| `animate-appicon-hover`, `animate-appicon-hover-animation-type` | bool, enum | `false`, `SIMPLE` | Animate icons under the pointer: `SIMPLE` (lift), `RIPPLE` (neighbors grow too), `PLANK` (dock-style magnify) | Yes; `RIPPLE` and `PLANK` need a custom row layout |
| `animate-appicon-hover-animation-duration`, `-convexity`, `-extent`, `-rotation`, `-travel`, `-zoom` | dicts by type | duration `{SIMPLE:160, RIPPLE:130, PLANK:100}`, convexity `{RIPPLE:2, PLANK:1}`, extent `{RIPPLE:4, PLANK:4}`, rotation `{SIMPLE:0, RIPPLE:10, PLANK:0}`, travel `{SIMPLE:0.30, RIPPLE:0.40, PLANK:0}`, zoom `{SIMPLE:1, RIPPLE:1.25, PLANK:2}` | Tuning per animation type | Yes |
| `highlight-appicon-hover`, `highlight-appicon-hover-background-color`, `highlight-appicon-pressed-background-color`, `highlight-appicon-hover-border-radius` | bool, color, color, px | `true`, `rgba(238,238,236,0.1)`, `rgba(238,238,236,0.18)`, `0` | Background behind a hovered or pressed icon | Yes |
| `dot-position` | enum | `BOTTOM` | Edge of the button the running indicators sit on | Yes |
| `dot-style-focused`, `dot-style-unfocused` | enum | `METRO`, `METRO` | Indicator style: `DOTS`, `SQUARES`, `DASHES`, `SEGMENTED`, `SOLID`, `CILIORA`, `METRO` (geometry in "What Dash to Panel is") | Yes |
| `dot-size` | int | `3` | Indicator thickness, px | Yes |
| `dot-color-dominant` | bool | `false` | Color indicators with the icon's dominant color | Yes: sample the icon's colors |
| `dot-color-override`, `dot-color-1` to `dot-color-4` | bool, colors | `false`, `#5294e2` each | Own indicator colors for 1, 2, 3 and 4+ windows, instead of the theme's | Yes |
| `dot-color-unfocused-different`, `dot-color-unfocused-1` to `dot-color-unfocused-4` | bool, colors | `false`, `#5294e2` each | A second color set for unfocused apps | Yes |
| `focus-highlight`, `focus-highlight-dominant`, `focus-highlight-color`, `focus-highlight-opacity` | bool, bool, color, % | `true`, `false`, `#EEEEEE`, `25` | Background behind the focused app's button | Yes |
| `trans-use-custom-bg`, `trans-bg-color` | bool, color | `false`, `#000` | Panel background color instead of the theme's | Yes |
| `trans-use-custom-opacity`, `trans-panel-opacity` | bool, 0 to 1 | `false`, `0.4` | Panel background opacity | Yes |
| `trans-use-dynamic-opacity`, `trans-dynamic-behavior`, `trans-dynamic-distance`, `trans-dynamic-anim-target`, `trans-dynamic-anim-time` | bool, enum, px, 0 to 1, ms | `false`, `ALL_WINDOWS`, `20`, `0.8`, `300` | Change opacity when windows come within the distance of the panel; which windows count (`ALL_WINDOWS`, `FOCUSED_WINDOWS`, `MAXIMIZED_WINDOWS`), target opacity, fade time | Yes: window geometry from Hyprland |
| `trans-use-custom-gradient`, `trans-gradient-top-color`, `trans-gradient-top-opacity`, `trans-gradient-bottom-color`, `trans-gradient-bottom-opacity` | bool, color, 0 to 1, color, 0 to 1 | `false`, `#000`, `0`, `#000`, `0.2` | Vertical gradient over the background | Yes |
| `trans-use-border`, `trans-border-width`, `trans-border-use-custom-color`, `trans-border-custom-color` | bool, px, bool, color | `false`, `1`, `false`, `rgba(200,200,200,0.2)` | Line along the panel's inner edge | Yes |
| `panel-top-bottom-margins`, `panel-side-margins` | px | `0`, `0` | Gap between panel and screen edges (floating look) | Yes: layer-shell margins |
| `panel-top-bottom-padding`, `panel-side-padding` | px | `0`, `0` | Space inside the panel around its content | Yes |

### Behavior tab

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `show-favorites` | bool | `true` | Show pinned apps | Yes: the plugin keeps its own pinned list (no GNOME favorites) |
| `show-favorites-all-monitors` | bool | `true` | Pinned apps on every panel, not only the primary | Yes |
| `show-running-apps` | bool | `true` | Show running apps that are not pinned | Yes |
| `taskbar-locked` | bool | `false` | Lock the taskbar: no drag to reorder or pin | Yes |
| `group-apps` | bool | `true` | One button per app; when off, one button per window with its title | Yes |
| `group-apps-label-font-size`, `group-apps-label-font-weight`, `group-apps-label-font-color`, `group-apps-label-font-color-minimized` | px, enum, color, color | `14`, `inherit`, `#dddddd`, `#dddddd` | Title text of ungrouped buttons; weight is `inherit`, `normal`, `lighter`, `bold` or `bolder` | Yes |
| `group-apps-label-max-width`, `group-apps-use-fixed-width` | px, bool | `160`, `true` | Title width; fixed makes every button that wide | Yes |
| `group-apps-underline-unfocused` | bool | `true` | Ungrouped: indicators on unfocused windows too | Yes |
| `group-apps-use-launchers` | bool | `false` | Ungrouped: pinned apps stay as separate launcher icons | Yes |
| `show-window-previews` | bool | `true` | Hovering a button opens window previews | Yes: live window capture |
| `show-window-previews-timeout`, `leave-timeout` | ms | `400`, `100` | Hover delay before opening, delay before closing | Yes |
| `window-preview-size`, `window-preview-padding` | px | `240`, `8` | Thumbnail size and spacing | Yes |
| `window-preview-aspect-ratio-x`, `window-preview-aspect-ratio-y`, `window-preview-fixed-x`, `window-preview-fixed-y` | int, int, bool, bool | `16`, `9`, `false`, `true` | Thumbnail frame ratio and which side is held fixed | Yes |
| `window-preview-animation-time` | ms | `260` | Preview open and close animation | Yes |
| `window-preview-show-title`, `window-preview-title-position` | bool, enum | `true`, `TOP` | Window title on each preview, `TOP` or `BOTTOM` | Yes |
| `window-preview-manual-styling`, `window-preview-title-font-color`, `window-preview-title-font-size`, `window-preview-title-font-weight` | bool, color, px, enum | `false`, `#dddddd`, `14`, `inherit` | Own title styling instead of the theme's | Yes |
| `window-preview-use-custom-icon-size`, `window-preview-custom-icon-size` | bool, px | `false`, `16` | App icon size in the preview header | Yes |
| `preview-use-custom-opacity`, `preview-custom-opacity` | bool, % | `true`, `80` | Preview background opacity | Yes |
| `preview-middle-click-close` | bool | `true` | Middle-click a preview to close that window | Yes |
| `window-preview-hide-immediate-click` | bool | `false` | Clicking an icon closes previews without animation | Yes |
| `peek-mode`, `enter-peek-mode-timeout`, `peek-mode-opacity` | bool, ms, % | `true`, `500`, `40` | Resting on a preview shows that window and fades all others to the given opacity | Partial: per-window opacity through Hyprland; a window on another workspace or hidden cannot be shown in place |
| `show-tooltip` | bool | `true` | App name tooltip on hover (when previews are not shown) | Yes |
| `isolate-workspaces` | bool | `false` | List only windows on the current workspace | Yes |
| `isolate-monitors`, `isolate-monitors-with-single-panel` | bool, bool | `false`, `false` | Each panel lists only its monitor's windows; optionally even with one panel | Yes |
| `progress-show-count` | bool | `true` | Count badge on icons (from app badges and notifications) | Partial: needs a listener for apps' badge signals; few apps send them |
| `progress-show-bar` | bool | `true` | Progress bar on icons | Drop (legacy): the current code draws no progress bar |
| `overview-click-to-exit`, `hide-overview-on-startup` | bool | `false`, `false` | GNOME overview behavior | Drop |

### Action tab

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `click-action` | enum | `CYCLE-MIN` | Left click on a running app. `RAISE`: show all its windows · `MINIMIZE`: minimize if focused · `LAUNCH`: new window · `CYCLE`: cycle windows · `CYCLE-MIN`: cycle, then minimize all · `QUIT`: close all · `TOGGLE-SHOWPREVIEW`: one window toggles it, more open previews · `TOGGLE-CYCLE`: one window toggles, more cycle · `TOGGLE-SPREAD`: one window toggles, more spread them out | Yes, except minimize steps (Partial: Hyprland has no minimize; see the platform mapping) and `TOGGLE-SPREAD` (Partial: no GNOME window spread; use previews) |
| `shift-click-action`, `middle-click-action`, `shift-middle-click-action` | enum | `MINIMIZE`, `LAUNCH`, `LAUNCH` | Same choices for the other buttons; Ctrl+click always opens a new window | Yes |
| `customize-click`, `minimize-shift`, `activate-single-window` | bool | `true`, `true`, `true` | Old click toggles | Drop (legacy) |
| `scroll-panel-action` | enum | `SWITCH_WORKSPACE` | Scroll on empty panel: `NOTHING`, `SWITCH_WORKSPACE`, `CYCLE_WINDOWS`, `PASS_THROUGH`, `CHANGE_VOLUME` | Yes; `PASS_THROUGH` has nothing to pass to, treat as `NOTHING` |
| `scroll-panel-delay`, `scroll-panel-show-ws-popup` | ms, bool | `0`, `true` | Minimum time between scroll steps; show the workspace popup | Yes |
| `scroll-icon-action`, `scroll-icon-delay` | enum, ms | `CYCLE_WINDOWS`, `0` | Scroll on an app button: `NOTHING`, `CYCLE_WINDOWS`, `PASS_THROUGH` | Yes |
| `hot-keys` | bool | `false` | Super+1 to 0 activate the first ten apps (Shift: the shift-click action, Ctrl: new window) | Partial: Omarchy already uses Super+number for workspaces, so pick another prefix |
| `hotkey-prefix-text`, `shortcut-num-keys` | enum, enum | `Super`, `BOTH` | Prefix `Super` or `SuperAlt`; number row, keypad or both | Yes |
| `app-hotkey-1` to `-10`, `app-shift-hotkey-1` to `-10`, `app-ctrl-hotkey-1` to `-10`, and the `-kp-` versions of each (60 keys) | key lists | `<Super>1` to `<Super>0`, with Shift and Ctrl variants and `KP_1` to `KP_0` | Generated from the prefix; not edited by hand | Yes: generate Hyprland binds that call the panel |
| `hotkeys-overlay-combo`, `overlay-timeout` | enum, ms | `TEMPORARILY`, `750` | Number labels on icons while hotkeys are used: `NEVER`, `TEMPORARILY`, `ALWAYS` | Yes |
| `shortcut`, `shortcut-text`, `shortcut-timeout` | key, ms | `<Super>q`, `2000` | Shortcut that shows the panel with number labels | Yes; Super+Q closes windows on Omarchy, so pick another combo |
| `shortcut-overlay-on-secondary`, `shortcut-previews` | bool, bool | `false`, `false` | Labels on secondary panels; hotkey on a multi-window app opens previews | Yes |
| `secondarymenu-contains-appmenu` | bool | `true` | App right-click menu includes the app's own actions | Yes: desktop-file actions |
| `secondarymenu-contains-showdetails` | bool | `false` | "App Details" opens GNOME Software | Drop, or open a package-info command |
| `context-menu-entries` | JSON list | Omarchy: Terminal (`TERMINALSETTINGS`), System monitor (`omarchy-launch-or-focus-tui btop`), Files (`nautilus --new-window`) | Entries in the panel and Show Apps right-click menu; `TERMINALSETTINGS` means the default terminal. Fresh installs and reset use the same entries as the seed | Yes: map to Omarchy's terminal and tools |
| `panel-context-menu-commands`, `panel-context-menu-titles` | string lists | `[]` | Extra commands in the panel right-click menu | Yes |

### Fine-Tune tab

| Key | Type | Default | What it does | On Omarchy |
| --- | --- | --- | --- | --- |
| `tray-size`, `leftbox-size` | px | `0` = automatic | Tray icon size here; 0 fits the panel, up to 24px. The empty left box has no sizing behavior | Partial: only if the panel hosts them (the tray is hidden by default) |
| `tray-padding`, `leftbox-padding`, `status-icon-padding` | px | `-1` = theme | Padding of tray items, left box items and the system menu icon | Partial: same |
| `animate-app-switch`, `animate-window-launch` | bool | `true`, `true` | Animate indicators on open, close and switch; animate a new window's button | Yes |
| `stockgs-keep-top-panel` | bool | `false` | Keep GNOME's top bar and add this panel as a second bar | Yes, reinterpreted: `true` = run beside omarchy-shell's top bar; `false` = ship as a kind `"bar"` plugin that replaces `omarchy.bar` and must host what it showed |
| `stockgs-keep-dash` | bool | `false` | Keep GNOME's dash in the overview | Drop |
| `stockgs-panelbtn-click-only` | bool | `false` | Top-bar menus open on click only, not on hover | Yes, for the panel's own menus |
| `stockgs-force-hotcorner` | bool | `false` | Keep GNOME's Activities hot corner | Partial: no hot corners in Hyprland; a corner strip can run a command |

### Internal keys

| Key | Default | What it does | On Omarchy |
| --- | --- | --- | --- |
| `target-prefs-page`, `prefs-opened` | `''`, `false` | Which settings page to open; whether settings are open | Drop |
| `extension-version` | `65` | Last installed version, for migrations | Drop; version the plugin's own config file instead |
