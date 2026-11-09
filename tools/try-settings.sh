#!/usr/bin/env bash
# Reviewer tool. Never called against the real HOME by automated tests.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mode=${1:-}
case "$mode" in Position|Style|Behavior|Action|Intellihide|Fine-Tune|restore) ;; *) echo "Usage: $0 <Position|Style|Behavior|Action|Intellihide|Fine-Tune|restore>" >&2; exit 2;; esac
state="$HOME/.local/state/familiar-dock"
file="$HOME/.config/omarchy/familiar-dock.json"
# Same privacy rule as services/Lifecycle.js: parents keep the user's umask,
# the state directory is born 0700, and the settings backup written below is
# born 0600. A directory or backup an earlier run left open is closed too.
mkdir -p -- "$(dirname -- "$state")" "$(dirname -- "$file")"
umask 077
mkdir -p -m 700 -- "$state"
chmod 700 -- "$state"
for f in "$state"/* "$state"/.[!.]* "$state"/..?*; do
  [[ -f "$f" && ! -L "$f" ]] || continue
  chmod 600 -- "$f"
done
exec 9>"$state/settings-test.lock"; flock -x 9
backup="$state/settings-under-test.bak"
active="$state/settings-test-active"
if [[ $mode == restore ]]; then
  [[ -f $active ]] || { echo 'No settings test is active.'; exit 0; }
  if [[ -f "$state/settings-test-missing" ]]; then rm -f -- "$file"
  else
    [[ -f $backup ]] || { echo 'Backup missing; leaving test markers untouched.' >&2; exit 1; }
    cp -- "$backup" "$file.familiar-dock-test.tmp"; mv -f -- "$file.familiar-dock-test.tmp" "$file"
  fi
  rm -f -- "$backup" "$active" "$state/settings-test-missing"
else
  if [[ ! -f $active ]]; then
    # Complete the backup before publishing the active transaction marker.
    if [[ -e $file ]]; then cp -- "$file" "$backup.tmp"; mv -f -- "$backup.tmp" "$backup"
    else : > "$state/settings-test-missing"; : > "$backup"; fi
    : > "$active"
  fi
  cp -- "$repo/tests/settings/$mode.json" "$file.familiar-dock-test.tmp"
  mv -f -- "$file.familiar-dock-test.tmp" "$file"
fi
