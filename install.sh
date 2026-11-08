#!/bin/sh
set -eu

release="https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"
sources="https://codeload.github.com/aquaryuo/vesktop-client/tar.gz/refs/heads/main"
guide="https://github.com/aquaryuo/vesktop-client#built-from-source"
skipped=""
builds=""

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

add_build() {
    root=$(dirname "${1%/}")
    if [ ! -f "$root/package.json" ] || [ ! -d "$root/src" ]; then
        return 1
    fi
    root=$(cd "$root" && pwd -P)
    builds="$builds$root|$2
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
    if [ -n "$custom" ] && add_build "$custom" Vesktop; then
        return 0
    fi
    [ -n "$custom" ] && files="$custom"
    [ -f "$files/vencordDesktopMain.js" ] || return 0
    for file in vencordDesktopMain.js vencordDesktopPreload.js vencordDesktopRenderer.js vencordDesktopRenderer.css; do
        add "Vesktop" "$file" "$files/$file"
    done
}

equibop() {
    [ -d "$1" ] || return 0
    custom=$(state_value "$1/state.json" equicordDir)
    if [ -n "$custom" ]; then
        if ! add_build "$custom" Equibop; then
            echo "Equibop loads Equicord from a custom folder, so it was skipped."
            skipped=1
        fi
        return 0
    fi
    [ -f "$1/sessionData/equicord.asar" ] || return 0
    add "Equibop" equibop.asar "$1/sessionData/equicord.asar"
}

discord() {
    [ -f "$1" ] || return 0
    [ "$(wc -c < "$1" | tr -d ' ')" -lt 65536 ] || return 0
    patcher=$(LC_ALL=C grep -ao 'require("[^"]*")' "$1" | head -n 1 | sed 's/^require("//; s/")$//; s/\\\\/\\/g')
    case "$patcher" in
        */patcher.js) add_build "$(dirname "$patcher")" Discord || true ;;
    esac
}

vesktop "$config/vesktop"
for dir in "$HOME"/.var/app/*/config/vesktop; do vesktop "$dir"; done
equibop "$config/equibop"
for dir in "$HOME"/.var/app/*/config/equibop; do equibop "$dir"; done

for asar in /Applications/Discord*.app/Contents/Resources/app.asar "$HOME"/Applications/Discord*.app/Contents/Resources/app.asar \
    /usr/share/[Dd]iscord*/resources/app.asar /usr/lib/[Dd]iscord*/resources/app.asar /usr/lib64/[Dd]iscord*/resources/app.asar \
    /opt/[Dd]iscord*/resources/app.asar "$HOME"/.local/share/[Dd]iscord*/resources/app.asar "$HOME"/.dvm/[Dd]iscord*/resources/app.asar \
    /var/lib/flatpak/app/com.discordapp.*/current/active/files/discord*/resources/app.asar \
    "$HOME"/.local/share/flatpak/app/com.discordapp.*/current/active/files/discord*/resources/app.asar; do
    discord "$asar"
done

if [ -f "$config/Vencord/dist/patcher.js" ]; then
    for file in patcher.js preload.js renderer.js renderer.css; do
        add "Discord with Vencord" "$file" "$config/Vencord/dist/$file"
    done
fi
if [ -f "$config/Equicord/equicord.asar" ]; then
    add "Discord with Equicord" desktop.asar "$config/Equicord/equicord.asar"
fi

if [ -z "$targets" ] && [ -z "$builds" ]; then
    [ -n "$skipped" ] || echo "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again. If you built Vencord yourself, see $guide"
    exit 1
fi

if [ -n "$builds" ] && ! command -v pnpm > /dev/null 2>&1; then
    echo "You use a Vencord you built yourself, and rebuilding it needs pnpm. Install pnpm, then run this again."
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

[ -n "$builds" ] || exit 0

fetch "$sources" "$temp/plugins.tar.gz" || { echo "Couldn't download the plugins. Check your connection and run this again."; exit 1; }
tar -xzf "$temp/plugins.tar.gz" -C "$temp"
plugins="$temp/vesktop-client-main/plugins"

printf '%s' "$builds" | cut -d'|' -f1 | sort -u | while IFS= read -r root; do
    [ -n "$root" ] || continue
    apps=$(printf '%s' "$builds" | awk -F'|' -v r="$root" '$1 == r { print $2 }' | sort -u | paste -sd, - | sed 's/,/ and /g')
    patchset=$(dirname "$(dirname "$root")")
    work=$root
    betterVencord=""
    flags=""
    if [ "$(basename "$(dirname "$root")")" = dist ] && [ -f "$patchset/scripts/build.ts" ] && [ -d "$patchset/src/userplugins" ]; then
        work=$patchset
        betterVencord=1
        if [ "$(basename "$root")" = Equicord ]; then flags=--equicord; fi
    fi
    if [ -L "$work/src/userplugins" ]; then
        echo "$apps: your Vencord build takes its plugins from a linked folder, so it was skipped."
        continue
    fi
    mkdir -p "$work/src/userplugins"
    for plugin in "$plugins"/*/; do
        name=$(basename "$plugin")
        case "$name" in _*) continue ;; esac
        rm -rf "$work/src/userplugins/$name"
        cp -R "$plugins/$name" "$work/src/userplugins/$name"
    done

    echo "$apps: rebuilding your own Vencord in $work with the plugins. This takes a minute or two."
    backup="$work/dist.before-plugins"
    if [ -n "$betterVencord" ] && [ -d "$work/dist" ]; then
        rm -rf "$backup"
        mv "$work/dist" "$backup"
    fi
    if [ -n "$betterVencord" ]; then
        set -- pnpm dlx tsx scripts/build.ts $flags
    else
        set -- pnpm build
    fi
    if (cd "$work" && "$@" < /dev/null); then
        rm -rf "$backup"
        echo "$apps: installed into your own build. Open it and turn on the plugins in Settings. Run this again to update them."
    else
        if [ -d "$backup" ]; then
            rm -rf "$work/dist"
            mv "$backup" "$work/dist"
        fi
        echo "$apps: the build failed, so your previous build was kept. The errors are above, and $guide has the manual steps."
    fi
done
