# Live fixture review

From the repo, run `tools/try-settings.sh Style` (or Position, Behavior, Action,
Intellihide, Fine-Tune), then `tools/try-settings.sh restore`. Every fixture is a
complete copy of the seed plus only that tab's settings. The transaction saves
the real original once, even across tab changes, and restore is byte-exact.
An originally missing file is removed again. Restore **before** uninstalling.
The active marker protects the backup during removal. Automated tests use only
a private repository-local HOME.

Mutually exclusive options cannot all appear at once. While the backup is active,
edit the selected tab's keys in the live JSON and use this review matrix; the
coverage table lists every key and concrete unsupported cases. Restore afterward.

| Tab | Initial visible effect | Additional cases to exercise live |
| --- | --- | --- |
| Position | Left edge, 64px, 75%, start anchored, wider Show Desktop | All four edges; 100 and -1 lengths; START/MIDDLE/END; named monitor overrides and sync off; element visibility/order/centered/centerMonitor; Show Apps custom icon and context commands; Show Desktop divider and hover timing. |
| Style | PLANK magnification, dominant colors, rounded gradient/border, proximity alpha | SIMPLE/RIPPLE/PLANK and each type's duration/convexity/extent/rotation/travel/zoom; NORMAL/SYMBOLIC/GRAYSCALE; all indicator edges and seven shapes; focused/unfocused count colors and overrides; explicit focus/hover/pressed colors; custom background/opacity; ALL/FOCUSED/MAXIMIZED dynamic proximity, distance, target/time; margins and padding. Turn gradients off to compare base opacity. Trigger urgency from an app. |
| Behavior | Separate window titles and launchers, bottom preview headers | Group on/off, launcher/favorite/running filters and taskbar lock; title widths/font/weight/minimized ink; isolation and secondary pins; preview aspect/fixed axes/padding/time/title/icon/opacity; hide-immediate, middle close, tooltips, peek delay/opacity and leave timeout. Badges need an app emitting Unity signals. |
| Action | Click previews, Shift closes, middle launches; panel scroll changes volume | Every click/middle/Shift action (Ctrl always new window); panel/icon scroll actions and throttles/workspace popup; custom context menu commands and desktop actions; hotkey gate, number source, NEVER/TEMPORARILY/ALWAYS, secondary overlays/timeouts/previews. Physical bindings require docs/hotkeys.md. |
| Intellihide | Overlap hide, bounded edge dwell, notification/fullscreen reveal | Compare unconditional autohide, panel-overlap and any-monitor-window modes; ALL/FOCUSED/MAXIMIZED; pointer off/limit on/off; revealed hover and limit; start/close/reveal/animation timings; only-secondary; urgency; fullscreen refusal/Overlay reveal; persisted hold via hotkey. Menus, previews, calendar and grid must keep it revealed. Pressure remains inert. |
| Fine-Tune | No launch/switch animation, primary hot corner, click-only menus | Temporarily make rightBox visible in a **separate Position test** to inspect tray-size/tray-padding/status-icon-padding. The Fine-Tune file itself retains the seed layout (tray hidden); edit these sizing values while testing the tray. leftBox has no hosted content, so its sizes are inert. Stock bar replacement is unavailable with this service manifest. Compare hover-switching an already-open menu to the clock with click-only false/true. |

The Fine-Tune tray prerequisite necessarily crosses tabs and is intentionally
not baked into that fixture. Settings without a supported host or compositor
capability have explicit reasons in docs/settings-coverage.md.
