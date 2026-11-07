.pragma library
.import "Lifecycle.js" as Lifecycle

function targets(windows, visibleWorkspaces, exceptAddress, opacity) {
    var out = {}
    windows.forEach(function(w) {
        if (!w.minimized && w.address !== exceptAddress && visibleWorkspaces.indexOf(w.workspaceId) >= 0)
            out[w.address.indexOf("0x") === 0 ? w.address : "0x" + w.address] = Math.max(0, Math.min(1, opacity))
    })
    return out
}
function combined(owners) {
    var result = {}
    Object.keys(owners).forEach(function(owner) {
        var map = owners[owner]
        Object.keys(map).forEach(function(addr) { result[addr] = result[addr] === undefined ? map[addr] : Math.min(result[addr], map[addr]) })
    })
    return result
}
function frame(start, end, progress) {
    var result = {}
    Object.keys(start).concat(Object.keys(end)).forEach(function(addr) {
        var a = start[addr] === undefined ? 1 : start[addr], b = end[addr] === undefined ? 1 : end[addr]
        var value = a + (b - a) * (1 - Math.pow(1 - progress, 3))
        if (value < 1 || end[addr] !== undefined) result[addr] = value
    })
    return result
}
function prune(saved, alive) {
    var result = {}
    Object.keys(saved).forEach(function(addr) { if (alive.indexOf(addr) >= 0) result[addr] = saved[addr] })
    return result
}

var script = [
    "set -euo pipefail",
    "state_home=$1; mode=$2; token=$3; desired=$4; goals=${5:-$desired}",
    "state=\"$state_home/.local/state/familiar-dock\"",
    Lifecycle.privateState,
    "exec 9>\"$state/fader.lock\"",
    "flock -x 9",
    "# The detached removal cleanup takes over whatever is faded, but only while",
    "# the plugin is off: checked under this lock, an instance enabled since",
    "# then keeps the fade its own init took over.",
    "if [[ $mode == removal ]]; then",
    "  jq -e 'type == \"object\" and ((any(.plugins[]?; .id == \"rugobal.familiar-dock\") | not) or ((.disabledPlugins // [] | index(\"rugobal.familiar-dock\")) != null))' \"$state_home/.config/omarchy/shell.json\" >/dev/null || exit 0",
    "fi",
    "file=\"$state/faded.json\"",
    "saved='{}'; owner=''; session=${HYPRLAND_INSTANCE_SIGNATURE:-unknown}",
    "[[ ! -f $state/fader-owner ]] || owner=$(cat \"$state/fader-owner\")",
    "if [[ -s $file ]]; then",
    "  jq -e 'type == \"object\" and (.windows | type == \"object\")' \"$file\" >/dev/null || exit 1",
    "  owner=$(jq -r '.owner // \"\"' \"$file\")",
    "  oldSession=$(jq -r '.session // \"\"' \"$file\")",
    "  if [[ $session == \"$oldSession\" ]]; then saved=$(jq -c '.windows' \"$file\"); fi",
    "fi",
    "[[ $mode == init || $mode == removal || $owner == \"$token\" ]] || exit 0",
    "clients=$(hyprctl clients -j) || exit 1",
    "saved=$(jq -c --argjson clients \"$clients\" 'with_entries(select(.key as $a | any($clients[]; .address == $a)))' <<<\"$saved\")",
    "if [[ $mode != step ]]; then desired='{}'; goals='{}'; fi",
    "# Capture both properties before touching either. Never guess an original opacity.",
    "while IFS= read -r addr; do",
    "  [[ $addr =~ ^0x[0-9a-fA-F]+$ ]] || continue",
    "  jq -e --arg a \"$addr\" 'any(.[]; .address == $a)' <<<\"$clients\" >/dev/null || continue",
    "  if ! jq -e --arg a \"$addr\" 'has($a)' <<<\"$saved\" >/dev/null; then",
    "    a=$(hyprctl getprop \"address:$addr\" opacity -j) || continue",
    "    b=$(hyprctl getprop \"address:$addr\" opacity_inactive -j) || continue",
    "    # hyprctl versions expose the scalar directly or under the property/value key.",
    "    a=$(jq -cer 'if type == \"object\" then (.opacity // .value // .float) else . end | tonumber | select(. >= 0 and . <= 1)' <<<\"$a\") || continue",
    "    b=$(jq -cer 'if type == \"object\" then (.opacity_inactive // .value // .float) else . end | tonumber | select(. >= 0 and . <= 1)' <<<\"$b\") || continue",
    "    saved=$(jq -c --arg a \"$addr\" --argjson x \"$a\" --argjson y \"$b\" '.[$a]={opacity:$x,opacity_inactive:$y}' <<<\"$saved\")",
    "  fi",
    "done < <(jq -r 'keys[]' <<<\"$desired\")",
    "write_state() {",
    "  printf '%s' \"$token\" > \"$state/fader-owner.tmp\" && mv -f \"$state/fader-owner.tmp\" \"$state/fader-owner\"",
    "  if [[ $saved == '{}' ]]; then rm -f \"$file\"; return; fi",
    "  jq -n --arg owner \"$token\" --arg session \"$session\" --argjson windows \"$saved\" '{owner:$owner,session:$session,windows:$windows}' > \"$file.tmp\"",
    "  mv -f \"$file.tmp\" \"$file\"",
    "}",
    "# Write-ahead journal survives a crash between a dispatch and its reply.",
    "write_state",
    "batch=\"\"",
    "updated=$saved",
    "while IFS=$'\\t' read -r addr opacity inactive; do",
    "  [[ $addr =~ ^0x[0-9a-fA-F]+$ && $opacity =~ ^[0-9.eE+-]+$ && $inactive =~ ^[0-9.eE+-]+$ ]] || continue",
    "  # Frame factors describe progress; endpoints are absolute opacities, not multipliers.",
    "  next=$(jq -c --arg a \"$addr\" --argjson desired \"$desired\" --argjson goals \"$goals\" '",
    "    .[$a] as $s | ($desired[$a] // 1) as $f | ($goals[$a] // 1) as $g |",
    "    ($s.factor // 1) as $last |",
    "    (if $last == $g then 1 else (($f - $last) / ($g - $last) | if . < 0 then 0 elif . > 1 then 1 else . end) end) as $p |",
    "    ($s.current // $s.opacity) as $x | ($s.current_inactive // $s.opacity_inactive) as $y |",
    "    {factor:$f, current:($x + ((if $g == 1 then $s.opacity else $g end) - $x) * $p),",
    "     current_inactive:($y + ((if $g == 1 then $s.opacity_inactive else $g end) - $y) * $p)}' <<<\"$saved\")",
    "  IFS=$'\\t' read -r x y < <(jq -r '[.current,.current_inactive] | @tsv' <<<\"$next\")",
    "  updated=$(jq -c --arg a \"$addr\" --argjson next \"$next\" '.[$a] += $next' <<<\"$updated\")",
    "  batch+=\"dispatch hl.dsp.window.set_prop({ prop = \\\"opacity\\\", value = \\\"$x\\\", window = \\\"address:$addr\\\" });\"",
    "  batch+=\"dispatch hl.dsp.window.set_prop({ prop = \\\"opacity_inactive\\\", value = \\\"$y\\\", window = \\\"address:$addr\\\" });\"",
    "done < <(jq -r 'to_entries[] | [.key,.value.opacity,.value.opacity_inactive] | @tsv' <<<\"$saved\")",
    "if [[ -n $batch ]]; then",
    "  reply=$(hyprctl --batch \"$batch\") || exit 1",
    "  # Do not discard the journal on a compositor error (hyprctl may exit zero).",
    "  if grep -Eiq 'invalid|error|failed' <<<\"$reply\"; then exit 1; fi",
    "fi",
    "saved=$(jq -c --argjson desired \"$desired\" 'with_entries(select(.key as $a | $desired | has($a)))' <<<\"$updated\")",
    "write_state",
    "jq -c 'keys' <<<\"$saved\"",
    ""
].join("\n")
