#!/bin/sh
set -eu

release="https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"
sources="https://codeload.github.com/aquaryuo/vesktop-client/tar.gz/refs/heads/main"
guide="https://github.com/aquaryuo/vesktop-client#built-from-source"
official_vencord="https://github.com/Vendicated/Vencord/releases/download/devbuild"
official_equicord="https://github.com/Equicord/Equicord/releases/download/latest"
uninstall="${VESKTOP_CLIENT_UNINSTALL:-}"
skipped=""
builds=""
discords=""
inject_vencord=""
inject_equicord=""
vencord_cli=""
equicord_cli=""

if [ "$(id -u)" -eq 0 ]; then
    echo "Run this as your normal user, not with sudo."
    exit 1
fi

case "$(uname -s)" in
    Darwin) config="$HOME/Library/Application Support" ;;
    *) config="${XDG_CONFIG_HOME:-$HOME/.config}" ;;
esac

case "$(uname -s)-$(uname -m)" in
    Darwin-*)
        vencord_cli="https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli-darwin"
        equicord_cli="https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli-universal" ;;
    Linux-x86_64)
        vencord_cli="https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli-linux"
        equicord_cli="https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli-linux" ;;
    Linux-aarch64 | Linux-arm64)
        equicord_cli="https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli-linux-arm64" ;;
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
    targets="$targets$1|$2|$3|$fresh
"
}

ours() {
    [ -f "$1" ] && LC_ALL=C grep -aqF "aquaryuo/vesktop-client" "$1"
}

wanted() {
    [ -f "$1" ] || return 1
    if ours "$1"; then
        fresh=""
    else
        [ -z "$uninstall" ] || return 1
        fresh=1
    fi
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
    wanted "$files/vencordDesktopMain.js" || return 0
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
    wanted "$1/sessionData/equicord.asar" || return 0
    add "Equibop" equibop.asar "$1/sessionData/equicord.asar"
}

discord() {
    [ -f "$1" ] || return 0
    case "$1" in
        *.app/Contents/Resources/app.asar) location=${1%/Contents/Resources/app.asar} ;;
        *) location=$(dirname "$(dirname "$1")") ;;
    esac
    patcher=""
    [ "$(wc -c < "$1" | tr -d ' ')" -lt 65536 ] && patcher=$(LC_ALL=C grep -ao 'require("[^"]*")' "$1" | head -n 1 | sed 's/^require("//; s/")$//; s/\\\\/\\/g')
    discords="$discords$location|$patcher
"
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

if wanted "$config/Vencord/dist/patcher.js"; then
    for file in patcher.js preload.js renderer.js renderer.css; do
        add "Discord with Vencord" "$file" "$config/Vencord/dist/$file"
    done
fi
if wanted "$config/Equicord/equicord.asar"; then
    add "Discord with Equicord" desktop.asar "$config/Equicord/equicord.asar"
fi

drop() {
    targets=$(printf '%s' "$targets" | grep -v "^$1|" || true)
    [ -z "$targets" ] || targets="$targets
"
}

plan_inject() {
    inject_list=""
    case "$targets" in *"$1|"*) ;; *) return 0 ;; esac
    if printf '%s' "$discords" | awk -F'|' -v p="$2" '$2 == p { f = 1 } END { exit !f }'; then
        return 0
    fi
    if printf '%s' "$discords" | awk -F'|' 'NF && $2 != "" { f = 1 } END { exit f }'; then
        inject_list=$(printf '%s' "$discords" | awk -F'|' 'NF && $2 == "" { print $1 }')
        discords=$(printf '%s' "$discords" | awk -F'|' -v p="$2" 'BEGIN { OFS = "|" } NF { if ($2 == "") $2 = p; print }')
        discords="$discords
"
    else
        echo "$1: Discord loads its client from somewhere else, so $(dirname "$2") was left alone."
        drop "$1"
        skipped=1
    fi
}

if [ -z "$uninstall" ] && [ -n "$discords" ]; then
    plan_inject "Discord with Vencord" "$config/Vencord/dist/patcher.js"
    inject_vencord=$inject_list
    plan_inject "Discord with Equicord" "$config/Equicord/equicord.asar"
    inject_equicord=$inject_list
fi

if [ -z "$targets" ] && [ -z "$builds" ]; then
    if [ -n "$uninstall" ]; then
        echo "None of your apps have these plugins, so there's nothing to uninstall."
    elif [ -z "$skipped" ]; then
        echo "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again. If you built Vencord yourself, see $guide"
    fi
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

while IFS='|' read -r name asset dest fresh; do
    [ -n "$asset" ] || continue
    [ -f "$temp/$asset" ] && continue
    base=$release
    if [ -n "$uninstall" ]; then
        [ -f "$dest.before-plugins" ] && continue
        case "$asset" in
            *.asar) base=$official_equicord ;;
            *) base=$official_vencord ;;
        esac
    fi
    fetch "$base/$asset" "$temp/$asset" || { echo "Couldn't download $asset. Check your connection and run this again."; exit 1; }
done <<EOF
$targets
EOF

restore() {
    while IFS='|' read -r name asset dest fresh; do
        [ "$name" = "$1" ] || continue
        [ ! -f "$dest.before-plugins" ] || mv -f "$dest.before-plugins" "$dest"
    done <<EOF
$targets
EOF
}

run_cli() {
    [ -n "$6" ] || return 0
    if [ -z "$2" ]; then
        echo "$1: its installer has no build for this system, so it was skipped."
        [ "$5" = -uninstall ] || restore "$1"
        drop "$1"
        return 0
    fi
    [ "$5" = -uninstall ] || echo "$1: Discord isn't set up to load it, so its official installer is doing that first."
    cli="$temp/$(basename "$2")"
    if [ ! -f "$cli" ]; then
        fetch "$2" "$cli" || { echo "Couldn't download the installer for $1. Check your connection and run this again."; exit 1; }
        chmod +x "$cli"
    fi
    if printf '%s\n' "$6" | while IFS= read -r location; do
        [ -n "$location" ] || continue
        env "$3=$4" "$cli" "$5" -location "$location" < /dev/null || exit 1
    done; then
        if [ "$5" = -uninstall ]; then
            rm -f "$4/injected.before-plugins"
        else
            printf '%s\n' "$6" >> "$4/injected.before-plugins"
        fi
    else
        if [ "$5" = -uninstall ]; then
            echo "$1: its installer couldn't undo the Discord setup, so nothing was changed there. Its message is above."
        else
            restore "$1"
            echo "$1: its installer couldn't set up Discord, so nothing was changed there. Its message is above."
        fi
        drop "$1"
    fi
}

if [ -z "$uninstall" ]; then
    while IFS='|' read -r name asset dest fresh; do
        if [ -n "$asset" ] && [ -n "$fresh" ] && [ -f "$dest" ]; then
            cp "$dest" "$dest.before-plugins" || { echo "Couldn't save a copy of $dest."; exit 1; }
        fi
    done <<EOF
$targets
EOF
    run_cli "Discord with Vencord" "$vencord_cli" VENCORD_USER_DATA_DIR "$config/Vencord" -install "$inject_vencord"
    run_cli "Discord with Equicord" "$equicord_cli" EQUICORD_USER_DATA_DIR "$config/Equicord" -install "$inject_equicord"
else
    case "$targets" in *"Discord with Vencord|"*)
        [ ! -f "$config/Vencord/injected.before-plugins" ] || run_cli "Discord with Vencord" "$vencord_cli" VENCORD_USER_DATA_DIR "$config/Vencord" -uninstall "$(cat "$config/Vencord/injected.before-plugins")" ;;
    esac
    case "$targets" in *"Discord with Equicord|"*)
        [ ! -f "$config/Equicord/injected.before-plugins" ] || run_cli "Discord with Equicord" "$equicord_cli" EQUICORD_USER_DATA_DIR "$config/Equicord" -uninstall "$(cat "$config/Equicord/injected.before-plugins")" ;;
    esac
fi

done_names=""
official=""
while IFS='|' read -r name asset dest fresh; do
    [ -n "$asset" ] || continue
    if [ -n "$uninstall" ] && [ -f "$dest.before-plugins" ]; then
        mv -f "$dest.before-plugins" "$dest" || { echo "Couldn't restore $dest."; exit 1; }
    else
        [ -z "$uninstall" ] || official="$official|$name|"
        cp "$temp/$asset" "$dest" || { echo "Couldn't replace $dest."; exit 1; }
    fi
    case "$done_names" in
        *"|$name|"*) ;;
        *) done_names="$done_names|$name|" ;;
    esac
done <<EOF
$targets
EOF

printf '%s\n' "$done_names" | tr '|' '\n' | sed '/^$/d' | while read -r name; do
    if [ -z "$uninstall" ]; then
        echo "$name: installed. Open it and turn on the plugins in Settings."
    else
        case "$official" in
            *"|$name|"*) echo "$name: removed the plugins. The build you had before wasn't saved, so it's on the official build now." ;;
            *) echo "$name: removed the plugins and put back the build you had before." ;;
        esac
    fi
done

if [ -n "$uninstall" ]; then
    for dir in "$config"/vesktop "$config"/equibop "$config"/discord "$config"/discordptb "$config"/discordcanary "$config"/discorddevelopment \
        "$HOME"/.var/app/*/config/vesktop "$HOME"/.var/app/*/config/equibop "$HOME"/.var/app/*/config/discord; do
        rm -rf "$dir/QuoteFonts"
    done
fi

[ -n "$builds" ] || exit 0

fetch "$sources" "$temp/plugins.tar.gz" || { echo "Couldn't download the plugins. Check your connection and run this again."; exit 1; }
tar -xzf "$temp/plugins.tar.gz" -C "$temp"
plugins="$temp/vesktop-client-main/plugins"

printf '%s' "$builds" | cut -d'|' -f1 | sort -u | while IFS= read -r root; do
    [ -n "$root" ] || continue
    apps=$(printf '%s' "$builds" | awk -F'|' -v r="$root" '$1 == r { print $2 }' | sort -u | paste -sd, - | sed 's/,/ and /g')
    patchset=$(dirname "$(dirname "$root")")
    folders="$root/src/userplugins"
    betterVencord=""
    if [ "$(basename "$(dirname "$root")")" = dist ] && [ -f "$patchset/scripts/build.ts" ] && [ -d "$patchset/src/userplugins" ]; then
        betterVencord=1
        folders="$folders
$patchset/src/userplugins"
    fi
    if printf '%s\n' "$folders" | while IFS= read -r folder; do [ ! -L "$folder" ] || exit 1; done; then :; else
        echo "$apps: your Vencord build takes its plugins from a linked folder, so it was skipped."
        continue
    fi
    dist="$root/dist"
    saved="$dist.before-plugins"
    present=""
    for plugin in "$plugins"/*/; do
        name=$(basename "$plugin")
        case "$name" in _*) continue ;; esac
        if printf '%s\n' "$folders" | while IFS= read -r folder; do [ ! -d "$folder/$name" ] || exit 1; done; then :; else present="$present $name"; fi
    done
    if [ -n "$uninstall" ]; then
        if [ -z "$present" ]; then
            echo "$apps: your own build doesn't have these plugins, so nothing changed."
            continue
        fi
        printf '%s\n' "$folders" | while IFS= read -r folder; do
            for name in $present; do rm -rf "$folder/$name"; done
        done
        if [ -d "$saved" ]; then
            rm -rf "$dist"
            mv "$saved" "$dist"
            echo "$apps: removed the plugins and put back the build you had before."
            continue
        fi
        echo "$apps: rebuilding your own Vencord in $root without the plugins. This takes a minute."
    else
        if [ -z "$present" ] && [ -d "$dist" ] && [ ! -d "$saved" ]; then cp -R "$dist" "$saved"; fi
        printf '%s\n' "$folders" | while IFS= read -r folder; do
            mkdir -p "$folder"
            for plugin in "$plugins"/*/; do
                name=$(basename "$plugin")
                case "$name" in _*) continue ;; esac
                rm -rf "$folder/$name"
                cp -R "$plugins/$name" "$folder/$name"
            done
        done
        echo "$apps: rebuilding your own Vencord in $root with the plugins. This takes a minute."
    fi

    current="$temp/dist-$(basename "$root")-$$"
    rm -rf "$current"
    [ ! -d "$dist" ] || cp -R "$dist" "$current"
    if [ -n "$betterVencord" ]; then
        hash="$(git -C "$patchset/base/$(basename "$root")" rev-parse --short HEAD) (BetterVencord patchset built by $(git -C "$patchset" rev-parse --short HEAD))"
        remote=$(git -C "$patchset" remote get-url origin | sed 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
        set -- env VENCORD_HASH="$hash" EQUICORD_HASH="$hash" BV_REMOTE="$remote" pnpm build --standalone
    else
        set -- pnpm build
    fi
    if (cd "$root" && "$@" < /dev/null); then
        if [ -n "$uninstall" ]; then
            echo "$apps: removed the plugins from your own build."
        else
            echo "$apps: installed into your own build. Open it and turn on the plugins in Settings. Run this again to update them."
        fi
    else
        if [ -d "$current" ]; then
            rm -rf "$dist"
            cp -R "$current" "$dist"
        fi
        if [ -n "$uninstall" ]; then
            echo "$apps: the build failed, so your current build, which still has the plugins, was kept. The errors are above."
        else
            echo "$apps: the build failed, so your previous build was kept. The errors are above, and $guide has the manual steps."
        fi
    fi
done
