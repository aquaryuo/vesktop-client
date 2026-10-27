#!/bin/sh
set -eu

release="https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"

if [ "$(id -u)" -eq 0 ]; then
    echo "Run this as your normal user, not with sudo."
    exit 1
fi

case "$(uname -s)" in
    Darwin) config="$HOME/Library/Application Support" ;;
    *) config="${XDG_CONFIG_HOME:-$HOME/.config}" ;;
esac

if command -v curl > /dev/null 2>&1; then
    fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget > /dev/null 2>&1; then
    fetch() { wget -qO "$2" "$1"; }
else
    echo "Install curl or wget, then run this again."
    exit 1
fi

targets=""
add() {
    targets="$targets$1|$2|$3
"
}

state_value() {
    [ -f "$1" ] || return 0
    sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -n 1
}

vesktop() {
    [ -d "$1" ] || return 0
    files="$1/sessionData/vencordFiles"
    custom=$(state_value "$1/state.json" vencordDir)
    [ -n "$custom" ] && files="$custom"
    [ -f "$files/vencordDesktopMain.js" ] || return 0
    for file in vencordDesktopMain.js vencordDesktopPreload.js vencordDesktopRenderer.js vencordDesktopRenderer.css; do
        add "Vesktop" "$file" "$files/$file"
    done
}

equibop() {
    [ -d "$1" ] || return 0
    if [ -n "$(state_value "$1/state.json" equicordDir)" ]; then
        echo "Equibop loads Equicord from a custom folder, so it was skipped."
        return 0
    fi
    [ -f "$1/sessionData/equicord.asar" ] || return 0
    add "Equibop" equibop.asar "$1/sessionData/equicord.asar"
}

vesktop "$config/vesktop"
for dir in "$HOME"/.var/app/*/config/vesktop; do vesktop "$dir"; done
equibop "$config/equibop"
for dir in "$HOME"/.var/app/*/config/equibop; do equibop "$dir"; done

if [ -f "$config/Vencord/dist/patcher.js" ]; then
    for file in patcher.js preload.js renderer.js renderer.css; do
        add "Discord with Vencord" "$file" "$config/Vencord/dist/$file"
    done
fi
if [ -f "$config/Equicord/equicord.asar" ]; then
    add "Discord with Equicord" desktop.asar "$config/Equicord/equicord.asar"
fi

if [ -z "$targets" ]; then
    echo "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again."
    exit 1
fi

if command -v pgrep > /dev/null 2>&1 && pgrep -ix 'vesktop|equibop|discord|discordptb|discordcanary|discord ptb|discord canary' > /dev/null 2>&1; then
    echo "Quit Vesktop, Equibop and Discord first, then run this again."
    exit 1
fi

temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT

while IFS='|' read -r name asset dest; do
    [ -n "$asset" ] || continue
    [ -f "$temp/$asset" ] && continue
    fetch "$release/$asset" "$temp/$asset" || { echo "Couldn't download $asset. Check your connection and run this again."; exit 1; }
done <<EOF
$targets
EOF

installed=""
while IFS='|' read -r name asset dest; do
    [ -n "$asset" ] || continue
    cp "$temp/$asset" "$dest" || { echo "Couldn't replace $dest."; exit 1; }
    case "$installed" in
        *"|$name|"*) ;;
        *) installed="$installed|$name|" ;;
    esac
done <<EOF
$targets
EOF

printf '%s\n' "$installed" | tr '|' '\n' | sed '/^$/d' | while read -r name; do
    echo "$name: installed. Open it and turn on the plugins in Settings."
done
