& {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    $release = "https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"

    $targets = @()

    $vesktopFiles = Join-Path $env:APPDATA "vesktop\sessionData\vencordFiles"
    $vesktopState = Join-Path $env:APPDATA "vesktop\state.json"
    if (Test-Path $vesktopState) {
        $custom = (Get-Content $vesktopState -Raw | ConvertFrom-Json).vencordDir
        if ($custom) { $vesktopFiles = $custom }
    }
    if (Test-Path (Join-Path $vesktopFiles "vencordDesktopMain.js")) {
        $targets += [pscustomobject]@{ Name = "Vesktop"; Dir = $vesktopFiles; Files = @("vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css") }
    }

    $discordFiles = Join-Path $env:APPDATA "Vencord\dist"
    if (Test-Path (Join-Path $discordFiles "patcher.js")) {
        $targets += [pscustomobject]@{ Name = "Discord"; Dir = $discordFiles; Files = @("patcher.js", "preload.js", "renderer.js", "renderer.css") }
    }

    if (-not $targets) {
        Write-Host "No Vencord install found. Install Vesktop, or Vencord for the Discord app, open it once, then run this again."
        return
    }

    if (Get-Process -Name Vesktop, Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue) {
        Write-Host "Quit Vesktop and Discord first, including from the system tray, then run this again."
        return
    }

    $temp = Join-Path ([IO.Path]::GetTempPath()) "aquaryuo-vencord"
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    try {
        foreach ($target in $targets) {
            foreach ($file in $target.Files) {
                Invoke-WebRequest -UseBasicParsing -Uri "$release/$file" -OutFile (Join-Path $temp $file)
            }
            foreach ($file in $target.Files) {
                Copy-Item -Force -Path (Join-Path $temp $file) -Destination (Join-Path $target.Dir $file)
            }
            Write-Host "$($target.Name): installed. Open it and turn on the plugins in Settings > Vencord > Plugins."
        }
    } finally {
        Remove-Item -Recurse -Force -Path $temp -ErrorAction SilentlyContinue
    }
}
