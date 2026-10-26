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
        $targets += [pscustomobject]@{
            Name = "Vesktop"
            Files = "vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css" | ForEach-Object { , @($_, (Join-Path $vesktopFiles $_)) }
        }
    }

    $vencordFiles = Join-Path $env:APPDATA "Vencord\dist"
    if (Test-Path (Join-Path $vencordFiles "patcher.js")) {
        $targets += [pscustomobject]@{
            Name = "Discord with Vencord"
            Files = "patcher.js", "preload.js", "renderer.js", "renderer.css" | ForEach-Object { , @($_, (Join-Path $vencordFiles $_)) }
        }
    }

    $equibopAsar = Join-Path $env:APPDATA "equibop\sessionData\equicord.asar"
    $equibopState = Join-Path $env:APPDATA "equibop\state.json"
    $equibopCustom = (Test-Path $equibopState) -and (Get-Content $equibopState -Raw | ConvertFrom-Json).equicordDir
    if ($equibopCustom) {
        Write-Host "Equibop loads Equicord from a custom folder, so it was skipped."
    } elseif (Test-Path $equibopAsar) {
        $targets += [pscustomobject]@{ Name = "Equibop"; Files = , @("equibop.asar", $equibopAsar) }
    }

    $equicordAsar = Join-Path $env:APPDATA "Equicord\equicord.asar"
    if (Test-Path $equicordAsar) {
        $targets += [pscustomobject]@{ Name = "Discord with Equicord"; Files = , @("desktop.asar", $equicordAsar) }
    }

    if (-not $targets) {
        Write-Host "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again."
        return
    }

    if (Get-Process -Name Vesktop, Equibop, Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue) {
        Write-Host "Quit Vesktop, Equibop and Discord first, including from the system tray, then run this again."
        return
    }

    $temp = Join-Path ([IO.Path]::GetTempPath()) "aquaryuo-vencord"
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    try {
        foreach ($target in $targets) {
            foreach ($file in $target.Files) {
                Invoke-WebRequest -UseBasicParsing -Uri "$release/$($file[0])" -OutFile (Join-Path $temp $file[0])
            }
            foreach ($file in $target.Files) {
                Copy-Item -Force -Path (Join-Path $temp $file[0]) -Destination $file[1]
            }
            Write-Host "$($target.Name): installed. Open it and turn on the plugins in Settings."
        }
    } finally {
        Remove-Item -Recurse -Force -Path $temp -ErrorAction SilentlyContinue
    }
}
