# Fixture provenance

`unity-update.txt` is representative text in `dbus-monitor`'s signal format,
with the Unity `Update` string and `a{sv}` payload. It is not a live capture.
An attempted capture on an isolated `dbus-run-session` was blocked by this
sandbox's Unix-socket restriction; the real desktop bus was never used.
To check the listener against real session output, emit a badge and then
clear it with the plugin running and a badge option on:

```sh
gdbus emit --session --object-path /com/canonical/unity/launcherentry/test \
  --signal com.canonical.Unity.LauncherEntry.Update \
  'application://org.gnome.Nautilus.desktop' \
  "{'count': <int64 7>, 'count-visible': <true>, 'progress': <0.42>, 'progress-visible': <true>, 'urgent': <true>}"
omarchy-shell rugobal.familiar-dock debugState | jq '{badgeListener,badges}'
gdbus emit --session --object-path /com/canonical/unity/launcherentry/test \
  --signal com.canonical.Unity.LauncherEntry.Update \
  'application://org.gnome.Nautilus.desktop' \
  "{'count-visible': <false>, 'progress-visible': <false>, 'urgent': <false>}"
```

`icon-edges.json` contains deterministic pixel/contrast cases for the shared
icon sampler and outline tests.
