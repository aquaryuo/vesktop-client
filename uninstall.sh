#!/bin/sh
set -eu

script="https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.sh"

if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$script" | VESKTOP_CLIENT_UNINSTALL=1 sh
elif command -v wget > /dev/null 2>&1; then
    wget -qO- "$script" | VESKTOP_CLIENT_UNINSTALL=1 sh
else
    echo "Install curl or wget, then run this again."
    exit 1
fi
