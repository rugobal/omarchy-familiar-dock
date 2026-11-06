# Optional panel blur

The panel uses the exact layer namespace **`familiar-dock`**. Edge reveal and
corner strips use `familiar-dock-reveal` and `familiar-dock-corner`; leave those
transparent input strips out of blur rules.

The reviewer can add this to their Hyprland Lua appearance configuration:

```lua
hl.layer_rule({
  match = { namespace = "^familiar-dock$" },
  blur = true,
  ignore_alpha = 0.5,
})
```

Enable a translucent panel background to see the blur. To undo, remove this
rule and reload Hyprland using your normal workflow. The plugin writes no
Hyprland rules; an absent rule means no requested blur and no helper process.
