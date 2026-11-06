.pragma library

// GSettings defaults at dash-to-panel c3aed93; JSON-valued strings are decoded.
// Omarchy overrides a few: its commands, and the starter setup in
// config/familiar-dock.seed.json (the Windows look), so a missing file, a
// reset and the "changed" marks all mean that setup. The defaults from
// before the starter became them: config/dash-to-panel.defaults.json.
var values = {
  "panel-element-positions-monitors-sync": true,
  "panel-positions": {},
  "panel-element-positions": {},
  "panel-lengths": {},
  "panel-anchors": {},
  "panel-sizes": {},
  "desktop-line-use-custom-color": true,
  "desktop-line-custom-color": "rgb(0,0,0)",
  "dot-position": "BOTTOM",
  "appicon-style": "NORMAL",
  "dot-style-focused": "DASHES",
  "dot-style-unfocused": "METRO",
  "dot-color-dominant": false,
  "dot-color-override": false,
  "dot-color-1": "#5294e2",
  "dot-color-2": "#5294e2",
  "dot-color-3": "#5294e2",
  "dot-color-4": "#5294e2",
  "dot-color-unfocused-different": false,
  "dot-color-unfocused-1": "#5294e2",
  "dot-color-unfocused-2": "#5294e2",
  "dot-color-unfocused-3": "#5294e2",
  "dot-color-unfocused-4": "#5294e2",
  "dot-size": 3,
  "focus-highlight": true,
  "focus-highlight-dominant": false,
  "focus-highlight-color": "#EEEEEE",
  "focus-highlight-opacity": 25,
  "stockgs-keep-top-panel": true,
  "stockgs-panelbtn-click-only": false,
  "stockgs-force-hotcorner": false,
  "taskbar-locked": false,
  "panel-top-bottom-margins": 0,
  "panel-side-margins": 0,
  "panel-top-bottom-padding": 0,
  "panel-side-padding": 0,
  "trans-use-custom-bg": false,
  "trans-bg-color": "#000",
  "trans-use-custom-opacity": false,
  "trans-use-dynamic-opacity": false,
  "trans-panel-opacity": 0.4,
  "trans-dynamic-behavior": "ALL_WINDOWS",
  "trans-dynamic-distance": 20,
  "trans-dynamic-anim-target": 0.8,
  "trans-dynamic-anim-time": 300,
  "trans-use-custom-gradient": false,
  "trans-gradient-top-color": "#000",
  "trans-gradient-top-opacity": 0,
  "trans-gradient-bottom-color": "#000",
  "trans-gradient-bottom-opacity": 0.2,
  "trans-use-border": false,
  "trans-border-width": 1,
  "trans-border-use-custom-color": false,
  "trans-border-custom-color": "rgba(200,200,200,0.2)",
  "intellihide": false,
  "intellihide-hide-from-windows": false,
  "intellihide-hide-from-monitor-windows": false,
  "intellihide-behaviour": "FOCUSED_WINDOWS",
  "intellihide-use-pointer": true,
  "intellihide-use-pointer-limit-size": false,
  "intellihide-revealed-hover": true,
  "intellihide-revealed-hover-limit-size": false,
  "intellihide-use-pressure": false,
  "intellihide-pressure-threshold": 100,
  "intellihide-pressure-time": 1000,
  "intellihide-show-in-fullscreen": false,
  "intellihide-show-on-notification": false,
  "intellihide-only-secondary": false,
  "intellihide-animation-time": 200,
  "intellihide-close-delay": 400,
  "intellihide-reveal-delay": 0,
  "intellihide-key-toggle-text": "<Super>i",
  "intellihide-key-toggle": [
    "<Super>i"
  ],
  "intellihide-persisted-state": -1,
  "intellihide-enable-start-delay": 2000,
  "show-apps-icon-file": "",
  "show-apps-icon-side-padding": 8,
  "show-apps-button-context-menu-commands": [],
  "show-apps-button-context-menu-titles": [],
  "panel-context-menu-commands": [],
  "panel-context-menu-titles": [],
  "showdesktop-button-width": 10,
  "show-showdesktop-hover": true,
  "show-showdesktop-delay": 1000,
  "show-showdesktop-time": 300,
  "show-window-previews": true,
  "show-tooltip": true,
  "show-running-apps": true,
  "show-favorites": true,
  "show-window-previews-timeout": 400,
  "peek-mode": true,
  "window-preview-show-title": true,
  "window-preview-manual-styling": false,
  "window-preview-title-position": "TOP",
  "window-preview-title-font-color": "#dddddd",
  "window-preview-title-font-size": 14,
  "window-preview-use-custom-icon-size": false,
  "window-preview-custom-icon-size": 16,
  "window-preview-animation-time": 260,
  "window-preview-title-font-weight": "inherit",
  "window-preview-size": 180,
  "window-preview-fixed-x": false,
  "window-preview-fixed-y": true,
  "window-preview-padding": 8,
  "window-preview-aspect-ratio-x": 16,
  "window-preview-aspect-ratio-y": 9,
  "window-preview-hide-immediate-click": false,
  "isolate-workspaces": false,
  "group-apps": true,
  "group-apps-label-font-size": 14,
  "group-apps-label-font-weight": "inherit",
  "group-apps-label-font-color": "#dddddd",
  "group-apps-label-font-color-minimized": "#dddddd",
  "group-apps-label-max-width": 160,
  "group-apps-use-fixed-width": true,
  "group-apps-underline-unfocused": true,
  "group-apps-use-launchers": false,
  "primary-monitor": "",
  "multi-monitors": true,
  "isolate-monitors": false,
  "isolate-monitors-with-single-panel": false,
  "show-favorites-all-monitors": true,
  "click-action": "CYCLE-MIN",
  "shift-click-action": "MINIMIZE",
  "middle-click-action": "LAUNCH",
  "shift-middle-click-action": "LAUNCH",
  "scroll-panel-action": "SWITCH_WORKSPACE",
  "context-menu-entries": [
    {
      "title": "Terminal",
      "cmd": "TERMINALSETTINGS"
    },
    {
      "title": "System monitor",
      "cmd": "omarchy-launch-or-focus-tui btop"
    },
    {
      "title": "Files",
      "cmd": "nautilus --new-window"
    }
  ],
  "scroll-panel-delay": 0,
  "scroll-panel-show-ws-popup": true,
  "scroll-icon-action": "CYCLE_WINDOWS",
  "scroll-icon-delay": 0,
  "leave-timeout": 100,
  "enter-peek-mode-timeout": 500,
  "peek-mode-opacity": 40,
  "preview-middle-click-close": true,
  "preview-use-custom-opacity": true,
  "preview-custom-opacity": 80,
  "tray-size": 0,
  "leftbox-size": 0,
  "global-border-radius": 0,
  "appicon-margin": 4,
  "appicon-padding": 4,
  "tray-padding": -1,
  "leftbox-padding": -1,
  "status-icon-padding": -1,
  "animate-app-switch": true,
  "animate-window-launch": true,
  "animate-appicon-hover": false,
  "animate-appicon-hover-animation-type": "SIMPLE",
  "animate-appicon-hover-animation-convexity": {
    "RIPPLE": 2,
    "PLANK": 1
  },
  "animate-appicon-hover-animation-duration": {
    "SIMPLE": 160,
    "RIPPLE": 130,
    "PLANK": 100
  },
  "animate-appicon-hover-animation-extent": {
    "RIPPLE": 4,
    "PLANK": 4
  },
  "animate-appicon-hover-animation-rotation": {
    "SIMPLE": 0,
    "RIPPLE": 10,
    "PLANK": 0
  },
  "animate-appicon-hover-animation-travel": {
    "SIMPLE": 0.3,
    "RIPPLE": 0.4,
    "PLANK": 0
  },
  "animate-appicon-hover-animation-zoom": {
    "SIMPLE": 1,
    "RIPPLE": 1.25,
    "PLANK": 2
  },
  "highlight-appicon-hover": true,
  "highlight-appicon-hover-background-color": "rgba(238, 238, 236, 0.1)",
  "highlight-appicon-pressed-background-color": "rgba(238, 238, 236, 0.18)",
  "highlight-appicon-hover-border-radius": 0,
  "secondarymenu-contains-appmenu": true,
  "shortcut-text": "<Super>q",
  "shortcut": [
    "<Super>q"
  ],
  "shortcut-timeout": 2000,
  "overlay-timeout": 750,
  "hotkeys-overlay-combo": "TEMPORARILY",
  "hot-keys": false,
  "hotkey-prefix-text": "Super",
  "shortcut-overlay-on-secondary": false,
  "shortcut-previews": false,
  "shortcut-num-keys": "BOTH",
  "app-ctrl-hotkey-1": [
    "<Ctrl><Super>1"
  ],
  "app-ctrl-hotkey-2": [
    "<Ctrl><Super>2"
  ],
  "app-ctrl-hotkey-3": [
    "<Ctrl><Super>3"
  ],
  "app-ctrl-hotkey-4": [
    "<Ctrl><Super>4"
  ],
  "app-ctrl-hotkey-5": [
    "<Ctrl><Super>5"
  ],
  "app-ctrl-hotkey-6": [
    "<Ctrl><Super>6"
  ],
  "app-ctrl-hotkey-7": [
    "<Ctrl><Super>7"
  ],
  "app-ctrl-hotkey-8": [
    "<Ctrl><Super>8"
  ],
  "app-ctrl-hotkey-9": [
    "<Ctrl><Super>9"
  ],
  "app-ctrl-hotkey-10": [
    "<Ctrl><Super>0"
  ],
  "app-shift-hotkey-1": [
    "<Shift><Super>1"
  ],
  "app-shift-hotkey-2": [
    "<Shift><Super>2"
  ],
  "app-shift-hotkey-3": [
    "<Shift><Super>3"
  ],
  "app-shift-hotkey-4": [
    "<Shift><Super>4"
  ],
  "app-shift-hotkey-5": [
    "<Shift><Super>5"
  ],
  "app-shift-hotkey-6": [
    "<Shift><Super>6"
  ],
  "app-shift-hotkey-7": [
    "<Shift><Super>7"
  ],
  "app-shift-hotkey-8": [
    "<Shift><Super>8"
  ],
  "app-shift-hotkey-9": [
    "<Shift><Super>9"
  ],
  "app-shift-hotkey-10": [
    "<Shift><Super>0"
  ],
  "app-hotkey-1": [
    "<Super>1"
  ],
  "app-hotkey-2": [
    "<Super>2"
  ],
  "app-hotkey-3": [
    "<Super>3"
  ],
  "app-hotkey-4": [
    "<Super>4"
  ],
  "app-hotkey-5": [
    "<Super>5"
  ],
  "app-hotkey-6": [
    "<Super>6"
  ],
  "app-hotkey-7": [
    "<Super>7"
  ],
  "app-hotkey-8": [
    "<Super>8"
  ],
  "app-hotkey-9": [
    "<Super>9"
  ],
  "app-hotkey-10": [
    "<Super>0"
  ],
  "app-ctrl-hotkey-kp-1": [
    "<Ctrl><Super>KP_1"
  ],
  "app-ctrl-hotkey-kp-2": [
    "<Ctrl><Super>KP_2"
  ],
  "app-ctrl-hotkey-kp-3": [
    "<Ctrl><Super>KP_3"
  ],
  "app-ctrl-hotkey-kp-4": [
    "<Ctrl><Super>KP_4"
  ],
  "app-ctrl-hotkey-kp-5": [
    "<Ctrl><Super>KP_5"
  ],
  "app-ctrl-hotkey-kp-6": [
    "<Ctrl><Super>KP_6"
  ],
  "app-ctrl-hotkey-kp-7": [
    "<Ctrl><Super>KP_7"
  ],
  "app-ctrl-hotkey-kp-8": [
    "<Ctrl><Super>KP_8"
  ],
  "app-ctrl-hotkey-kp-9": [
    "<Ctrl><Super>KP_9"
  ],
  "app-ctrl-hotkey-kp-10": [
    "<Ctrl><Super>KP_0"
  ],
  "app-shift-hotkey-kp-1": [
    "<Shift><Super>KP_1"
  ],
  "app-shift-hotkey-kp-2": [
    "<Shift><Super>KP_2"
  ],
  "app-shift-hotkey-kp-3": [
    "<Shift><Super>KP_3"
  ],
  "app-shift-hotkey-kp-4": [
    "<Shift><Super>KP_4"
  ],
  "app-shift-hotkey-kp-5": [
    "<Shift><Super>KP_5"
  ],
  "app-shift-hotkey-kp-6": [
    "<Shift><Super>KP_6"
  ],
  "app-shift-hotkey-kp-7": [
    "<Shift><Super>KP_7"
  ],
  "app-shift-hotkey-kp-8": [
    "<Shift><Super>KP_8"
  ],
  "app-shift-hotkey-kp-9": [
    "<Shift><Super>KP_9"
  ],
  "app-shift-hotkey-kp-10": [
    "<Shift><Super>KP_0"
  ],
  "app-hotkey-kp-1": [
    "<Super>KP_1"
  ],
  "app-hotkey-kp-2": [
    "<Super>KP_2"
  ],
  "app-hotkey-kp-3": [
    "<Super>KP_3"
  ],
  "app-hotkey-kp-4": [
    "<Super>KP_4"
  ],
  "app-hotkey-kp-5": [
    "<Super>KP_5"
  ],
  "app-hotkey-kp-6": [
    "<Super>KP_6"
  ],
  "app-hotkey-kp-7": [
    "<Super>KP_7"
  ],
  "app-hotkey-kp-8": [
    "<Super>KP_8"
  ],
  "app-hotkey-kp-9": [
    "<Super>KP_9"
  ],
  "app-hotkey-kp-10": [
    "<Super>KP_0"
  ],
  "progress-show-count": false,
  "theme-bg-color": "auto",
  "icon-contrast-outline": false,
  "favorites": null,
  "hide-omarchy-dock": true,
  "show-scratchpad-windows": false,
  "animate-appicon-hover-macos": false,
  "show-apps-hotkey": "SUPER + ALT + SPACE",
  "show-apps-click": {
    "action": "drawer",
    "app": "",
    "keybinding": "",
    "command": ""
  },
  "look-custom": null
}

var enums = {
  "theme-bg-color": ["auto", "bar", "background", "dark_background", "darker_background", "lighter_background"],
  "dot-position": [
    "BOTTOM",
    "TOP",
    "LEFT",
    "RIGHT"
  ],
  "appicon-style": [
    "NORMAL",
    "SYMBOLIC",
    "GRAYSCALE"
  ],
  "dot-style-focused": [
    "DOTS",
    "SQUARES",
    "DASHES",
    "SEGMENTED",
    "SOLID",
    "CILIORA",
    "METRO"
  ],
  "dot-style-unfocused": [
    "DOTS",
    "SQUARES",
    "DASHES",
    "SEGMENTED",
    "SOLID",
    "CILIORA",
    "METRO"
  ],
  "trans-dynamic-behavior": [
    "ALL_WINDOWS",
    "FOCUSED_WINDOWS",
    "MAXIMIZED_WINDOWS"
  ],
  "intellihide-behaviour": [
    "ALL_WINDOWS",
    "FOCUSED_WINDOWS",
    "MAXIMIZED_WINDOWS"
  ],
  "window-preview-title-position": [
    "BOTTOM",
    "TOP",
    "LEFT",
    "RIGHT"
  ],
  "window-preview-title-font-weight": [
    "inherit",
    "normal",
    "lighter",
    "bold",
    "bolder"
  ],
  "group-apps-label-font-weight": [
    "inherit",
    "normal",
    "lighter",
    "bold",
    "bolder"
  ],
  "click-action": [
    "RAISE",
    "MINIMIZE",
    "LAUNCH",
    "CYCLE",
    "CYCLE-MIN",
    "QUIT",
    "TOGGLE-SHOWPREVIEW",
    "TOGGLE-CYCLE",
    "TOGGLE-SPREAD"
  ],
  "shift-click-action": [
    "RAISE",
    "MINIMIZE",
    "LAUNCH",
    "CYCLE",
    "CYCLE-MIN",
    "QUIT",
    "TOGGLE-SHOWPREVIEW",
    "TOGGLE-CYCLE",
    "TOGGLE-SPREAD"
  ],
  "middle-click-action": [
    "RAISE",
    "MINIMIZE",
    "LAUNCH",
    "CYCLE",
    "CYCLE-MIN",
    "QUIT",
    "TOGGLE-SHOWPREVIEW",
    "TOGGLE-CYCLE",
    "TOGGLE-SPREAD"
  ],
  "shift-middle-click-action": [
    "RAISE",
    "MINIMIZE",
    "LAUNCH",
    "CYCLE",
    "CYCLE-MIN",
    "QUIT",
    "TOGGLE-SHOWPREVIEW",
    "TOGGLE-CYCLE",
    "TOGGLE-SPREAD"
  ],
  "scroll-panel-action": [
    "NOTHING",
    "SWITCH_WORKSPACE",
    "CYCLE_WINDOWS",
    "PASS_THROUGH",
    "CHANGE_VOLUME"
  ],
  "scroll-icon-action": [
    "NOTHING",
    "SWITCH_WORKSPACE",
    "CYCLE_WINDOWS",
    "PASS_THROUGH",
    "CHANGE_VOLUME"
  ],
  "animate-appicon-hover-animation-type": [
    "SIMPLE",
    "RIPPLE",
    "PLANK"
  ],
  "hotkeys-overlay-combo": [
    "NEVER",
    "TEMPORARILY",
    "ALWAYS"
  ],
  "hotkey-prefix-text": [
    "Super",
    "SuperAlt"
  ],
  "shortcut-num-keys": [
    "NUM_ROW",
    "NUM_KEYPAD",
    "BOTH"
  ]
}

var integerKeys = ["dot-size", "focus-highlight-opacity", "panel-top-bottom-margins", "panel-side-margins", "panel-top-bottom-padding", "panel-side-padding", "trans-dynamic-distance", "trans-dynamic-anim-time", "trans-border-width", "intellihide-pressure-threshold", "intellihide-pressure-time", "intellihide-animation-time", "intellihide-close-delay", "intellihide-reveal-delay", "intellihide-persisted-state", "intellihide-enable-start-delay", "show-apps-icon-side-padding", "showdesktop-button-width", "show-showdesktop-delay", "show-showdesktop-time", "show-window-previews-timeout", "window-preview-title-font-size", "window-preview-custom-icon-size", "window-preview-animation-time", "window-preview-size", "window-preview-padding", "window-preview-aspect-ratio-x", "window-preview-aspect-ratio-y", "group-apps-label-font-size", "group-apps-label-max-width", "scroll-panel-delay", "scroll-icon-delay", "leave-timeout", "enter-peek-mode-timeout", "peek-mode-opacity", "preview-custom-opacity", "tray-size", "leftbox-size", "global-border-radius", "appicon-margin", "appicon-padding", "tray-padding", "leftbox-padding", "status-icon-padding", "highlight-appicon-hover-border-radius", "shortcut-timeout", "overlay-timeout"]

// The starter layout, the Windows look: taskbar centered on the monitor,
// no tray. Upstream's own is in config/dash-to-panel.defaults.json.
var elementLayout = [
  {
    "element": "showAppsButton",
    "visible": true,
    "position": "stackedTL"
  },
  {
    "element": "activitiesButton",
    "visible": false,
    "position": "centered"
  },
  {
    "element": "leftBox",
    "visible": true,
    "position": "stackedTL"
  },
  {
    "element": "taskbar",
    "visible": true,
    "position": "centerMonitor"
  },
  {
    "element": "centerBox",
    "visible": true,
    "position": "centered"
  },
  {
    "element": "rightBox",
    "visible": false,
    "position": "stackedBR"
  },
  {
    "element": "dateMenu",
    "visible": true,
    "position": "stackedBR"
  },
  {
    "element": "systemMenu",
    "visible": false,
    "position": "stackedBR"
  },
  {
    "element": "desktopButton",
    "visible": true,
    "position": "stackedBR"
  }
]

// Legacy and GNOME-only keys are type-validated and deliberately inert.
var inertValues = {
  "panel-position": "BOTTOM",
  "panel-size": 48,
  "stockgs-keep-dash": false,
  "show-apps-override-escape": true,
  "show-activities-button": false,
  "overview-click-to-exit": false,
  "hide-overview-on-startup": false,
  "customize-click": true,
  "minimize-shift": true,
  "activate-single-window": true,
  "secondarymenu-contains-showdetails": false,
  "progress-show-bar": false,
  "target-prefs-page": "",
  "prefs-opened": false,
  "extension-version": 65
}
