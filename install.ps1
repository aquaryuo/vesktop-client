& {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    $release = "https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"
    $sources = "https://codeload.github.com/aquaryuo/vesktop-client/zip/refs/heads/main"
    $guide = "https://github.com/aquaryuo/vesktop-client#built-from-source"

    $targets = @()
    $builds = [ordered]@{}
    $skipped = $false

    function Add-Build($dist, $app) {
        $root = Split-Path $dist.TrimEnd("\", "/") -Parent
        if (-not ((Test-Path (Join-Path $root "package.json")) -and (Test-Path (Join-Path $root "src")))) { return $false }
        $root = (Resolve-Path $root).Path
        if (-not $builds.Contains($root)) { $builds[$root] = New-Object System.Collections.Generic.List[string] }
        if (-not $builds[$root].Contains($app)) { $builds[$root].Add($app) }
        return $true
    }

    $vesktopFiles = Join-Path $env:APPDATA "vesktop\sessionData\vencordFiles"
    $vesktopState = Join-Path $env:APPDATA "vesktop\state.json"
    $custom = if (Test-Path $vesktopState) { (Get-Content $vesktopState -Raw | ConvertFrom-Json).vencordDir }
    $selfBuilt = $custom -and (Add-Build $custom "Vesktop")
    if ($custom) { $vesktopFiles = $custom }
    if (-not $selfBuilt -and (Test-Path (Join-Path $vesktopFiles "vencordDesktopMain.js"))) {
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

    foreach ($asar in Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Discord*\app-*\resources\app.asar") -ErrorAction SilentlyContinue) {
        if ($asar.Length -gt 65536) { continue }
        $match = [regex]::Match([IO.File]::ReadAllText($asar.FullName), 'require\(("(?:[^"\\]|\\.)*")\)')
        if (-not $match.Success) { continue }
        $patcher = $match.Groups[1].Value | ConvertFrom-Json
        if ((Split-Path $patcher -Leaf) -eq "patcher.js") { [void](Add-Build (Split-Path $patcher -Parent) $asar.Directory.Parent.Parent.Name) }
    }

    $equibopAsar = Join-Path $env:APPDATA "equibop\sessionData\equicord.asar"
    $equibopState = Join-Path $env:APPDATA "equibop\state.json"
    $equibopCustom = if (Test-Path $equibopState) { (Get-Content $equibopState -Raw | ConvertFrom-Json).equicordDir }
    if ($equibopCustom) {
        if (-not (Add-Build $equibopCustom "Equibop")) {
            Write-Host "Equibop loads Equicord from a custom folder, so it was skipped."
            $skipped = $true
        }
    } elseif (Test-Path $equibopAsar) {
        $targets += [pscustomobject]@{ Name = "Equibop"; Files = , @("equibop.asar", $equibopAsar) }
    }

    $equicordAsar = Join-Path $env:APPDATA "Equicord\equicord.asar"
    if (Test-Path $equicordAsar) {
        $targets += [pscustomobject]@{ Name = "Discord with Equicord"; Files = , @("desktop.asar", $equicordAsar) }
    }

    if (-not $targets -and -not $builds.Count) {
        if (-not $skipped) { Write-Host "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again. If you built Vencord yourself, see $guide" }
        return
    }

    $pnpm = Get-Command pnpm.cmd, pnpm.exe, pnpm -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($builds.Count -and -not $pnpm) {
        Write-Host "You use a Vencord you built yourself, and rebuilding it needs pnpm. Install pnpm, then run this again."
        return
    }

    if (Get-Process -Name Vesktop, Equibop, Discord, DiscordPTB, DiscordCanary, DiscordDevelopment -ErrorAction SilentlyContinue) {
        Write-Host "Quit Vesktop, Equibop and Discord first, including from the system tray, then run this again."
        return
    }

    $temp = Join-Path ([IO.Path]::GetTempPath()) "aquaryuo-vencord"
    if (Test-Path $temp) { Remove-Item -Recurse -Force -Path $temp }
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

        if ($builds.Count) {
            $zip = Join-Path $temp "plugins.zip"
            Invoke-WebRequest -UseBasicParsing -Uri $sources -OutFile $zip
            Expand-Archive -Path $zip -DestinationPath $temp
            $plugins = Get-ChildItem -Directory -Path (Join-Path $temp "vesktop-client-main\plugins") | Where-Object { $_.Name -notlike "_*" }
        }
        foreach ($root in $builds.Keys) {
            $apps = $builds[$root] -join " and "
            $patchset = Split-Path (Split-Path $root -Parent) -Parent
            $betterVencord = (Split-Path (Split-Path $root -Parent) -Leaf) -eq "dist" -and (Test-Path (Join-Path $patchset "scripts\build.ts")) -and (Test-Path (Join-Path $patchset "src\userplugins"))
            $work = if ($betterVencord) { $patchset } else { $root }
            $userplugins = Join-Path $work "src\userplugins"
            if ((Test-Path $userplugins) -and (Get-Item $userplugins).LinkType) {
                Write-Host "$($apps): your Vencord build takes its plugins from a linked folder, so it was skipped."
                continue
            }
            New-Item -ItemType Directory -Force -Path $userplugins | Out-Null
            foreach ($plugin in $plugins) {
                $dest = Join-Path $userplugins $plugin.Name
                if (Test-Path $dest) { Remove-Item -Recurse -Force -Path $dest }
                Copy-Item -Recurse -Path $plugin.FullName -Destination $dest
            }

            Write-Host "$($apps): rebuilding your own Vencord in $work with the plugins. This takes a minute or two."
            $dist = Join-Path $work "dist"
            $backup = "$dist.before-plugins"
            if ($betterVencord -and (Test-Path $dist)) {
                if (Test-Path $backup) { Remove-Item -Recurse -Force -Path $backup }
                Rename-Item -Path $dist -NewName (Split-Path $backup -Leaf)
            }
            $flags = @()
            if ($betterVencord -and (Split-Path $root -Leaf) -eq "Equicord") { $flags += "--equicord" }
            $built = $false
            Push-Location $work
            try {
                $ErrorActionPreference = "Continue"
                if ($betterVencord) { & $pnpm.Source dlx tsx scripts/build.ts @flags } else { & $pnpm.Source build }
                $built = $LASTEXITCODE -eq 0
            } catch {
                Write-Host $_
            } finally {
                $ErrorActionPreference = "Stop"
                Pop-Location
            }
            if ($built) {
                if (Test-Path $backup) { Remove-Item -Recurse -Force -Path $backup }
                Write-Host "$($apps): installed into your own build. Open it and turn on the plugins in Settings. Run this again to update them."
            } else {
                if (Test-Path $backup) {
                    if (Test-Path $dist) { Remove-Item -Recurse -Force -Path $dist }
                    Rename-Item -Path $backup -NewName "dist"
                }
                Write-Host "$($apps): the build failed, so your previous build was kept. The errors are above, and $guide has the manual steps."
            }
        }
    } finally {
        Remove-Item -Recurse -Force -Path $temp -ErrorAction SilentlyContinue
    }
}
