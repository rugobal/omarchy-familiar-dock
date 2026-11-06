# Optional hotkeys

Set `hot-keys: true` in the plugin JSON first. All three binding entry points
(`activateApp`, `showOverlay`, `toggleIntellihide`) return without acting when
it is false. The plugin registers no bindings for them. Its only binding is
the Super+Alt+Space takeover described in the README, made in the running
compositor and never in a file.

Omarchy owns number chords under Super, Super+Shift, Super+Shift+Alt,
Super+Ctrl and Super+Alt. The reviewer verified **Super+Ctrl+Alt+1…0** and
**Super+Ctrl+Alt+I** free. Upstream's `hotkey-prefix-text` choices (`Super`,
`SuperAlt`) therefore cannot be used literally here. The generated upstream
`app-*-hotkey-*`, `shortcut[-text]` and `intellihide-key-toggle[-text]` values
are retained and validated as configuration metadata; Lua owns actual keys.

Paste the following into the user's Lua binding file after reviewing it.
It follows the existing `hl.unbind` then `o.bind` convention. Choose `NUM_ROW`,
`NUM_KEYPAD` or `BOTH` to match `shortcut-num-keys`. Keypad chords and the
Shift variants need the reviewer's compositor check; only the base number
row and I chords above were checked live.

```lua
local panelNumbers = "BOTH"
local function panelBind(key, title, command)
  hl.unbind(key)
  o.bind(key, title, command)
end
for n = 1, 10 do
  local digit = tostring(n % 10)
  if panelNumbers ~= "NUM_KEYPAD" then
    panelBind("SUPER + CTRL + ALT + " .. digit, "Panel app " .. n,
      "omarchy-shell rugobal.familiar-dock activateApp " .. n .. " ''")
    panelBind("SUPER + CTRL + ALT + SHIFT + " .. digit, "Panel Shift app " .. n,
      "omarchy-shell rugobal.familiar-dock activateApp " .. n .. " shift")
  end
  if panelNumbers ~= "NUM_ROW" then
    panelBind("SUPER + CTRL + ALT + KP_" .. digit, "Panel keypad app " .. n,
      "omarchy-shell rugobal.familiar-dock activateApp " .. n .. " kp:")
    panelBind("SUPER + CTRL + ALT + SHIFT + KP_" .. digit, "Panel Shift keypad app " .. n,
      "omarchy-shell rugobal.familiar-dock activateApp " .. n .. " kp:shift")
  end
end
panelBind("SUPER + CTRL + ALT + I", "Toggle panel autohide hold",
  "omarchy-shell rugobal.familiar-dock toggleIntellihide")
```

The free base already includes Ctrl, so adding Ctrl cannot form a distinct
new-window chord. `activateApp 1 ctrl` (or `kp:ctrl`) implements that action;
choose a separate reviewed chord for it. Do not silently overwrite another
Omarchy binding to imitate upstream's Ctrl variant. Likewise assign
`omarchy-shell rugobal.familiar-dock showOverlay` to a separately reviewed chord if
wanted. No free additional chord was supplied in the brief.

The installed socket registry enforces exact arity: **both arguments are
required**, including `''` for the ordinary number-row action. One-argument
`activateApp 1` cannot coexist with its two-argument form in this QML IPC
registry. This is why the example above includes an empty second argument.

`hotkeys-overlay-combo` selects NEVER/TEMPORARILY/ALWAYS. Activation uses
`overlay-timeout`; `showOverlay` uses `shortcut-timeout` and temporarily
reveals hidden panels. `shortcut-overlay-on-secondary` controls secondary
labels. `shortcut-previews` opens multi-window previews on ordinary activation.
Shift uses the configured shift-click action; Ctrl launches a new window.

To undo, remove the snippet and reload the compositor through the normal user
workflow. Setting `hot-keys: false` makes existing binds inert immediately.
