& {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    $release = "https://github.com/aquaryuo/vesktop-client/releases/download/devbuild"
    $sources = "https://codeload.github.com/aquaryuo/vesktop-client/zip/refs/heads/main"
    $guide = "https://github.com/aquaryuo/vesktop-client#built-from-source"
    $officialVencord = "https://github.com/Vendicated/Vencord/releases/download/devbuild"
    $officialEquicord = "https://github.com/Equicord/Equicord/releases/download/latest"
    $uninstall = $env:VESKTOP_CLIENT_UNINSTALL -eq "1"

    $targets = New-Object System.Collections.Generic.List[object]
    $builds = [ordered]@{}
    $skipped = $false

    function Test-Ours($path) {
        (Test-Path $path) -and (Select-String -LiteralPath $path -Pattern "aquaryuo/vesktop-client" -SimpleMatch -Quiet)
    }

    function Add-Target($name, $files, $data, $cli, $variable) {
        $main = $files[0][1]
        if (-not (Test-Path $main) -or ($uninstall -and -not (Test-Ours $main))) { return }
        $targets.Add([pscustomobject]@{ Name = $name; Fresh = -not (Test-Ours $main); Files = $files; Data = $data; Cli = $cli; Variable = $variable; Inject = @() })
    }

    function Invoke-Cli($target, $action, $locations) {
        $cli = Join-Path $temp (Split-Path $target.Cli -Leaf)
        if (-not (Test-Path $cli)) { Invoke-WebRequest -UseBasicParsing -Uri $target.Cli -OutFile $cli }
        Set-Item -Path "Env:$($target.Variable)" -Value $target.Data
        try {
            foreach ($location in $locations) {
                $ErrorActionPreference = "Continue"
                & $cli $action -location $location
                $ErrorActionPreference = "Stop"
                if ($LASTEXITCODE -ne 0) { return $false }
            }
        } finally {
            $ErrorActionPreference = "Stop"
            Remove-Item -Path "Env:$($target.Variable)" -ErrorAction SilentlyContinue
        }
        return $true
    }

    function Get-Files($folder, $names) {
        , @($names | ForEach-Object { , @($_, (Join-Path $folder $_)) })
    }

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
    if (-not $selfBuilt) { Add-Target "Vesktop" (Get-Files $vesktopFiles "vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css") }

    Add-Target "Discord with Vencord" (Get-Files (Join-Path $env:APPDATA "Vencord\dist") "patcher.js", "preload.js", "renderer.js", "renderer.css") (Join-Path $env:APPDATA "Vencord") "https://github.com/Vencord/Installer/releases/latest/download/VencordInstallerCli.exe" "VENCORD_USER_DATA_DIR"

    $discords = @()
    foreach ($branch in Get-ChildItem -Directory -Path $env:LOCALAPPDATA -Filter "Discord*" -ErrorAction SilentlyContinue) {
        $app = Get-ChildItem -Directory -Path $branch.FullName -Filter "app-*" -ErrorAction SilentlyContinue | Sort-Object { [version]($_.Name.Substring(4)) } | Select-Object -Last 1
        $asar = if ($app) { Get-Item -Path (Join-Path $app.FullName "resources\app.asar") -ErrorAction SilentlyContinue }
        if (-not $asar) { continue }
        $loads = $null
        if ($asar.Length -le 65536) {
            $match = [regex]::Match([IO.File]::ReadAllText($asar.FullName), 'require\(("(?:[^"\\]|\\.)*")\)')
            if ($match.Success) { $loads = $match.Groups[1].Value | ConvertFrom-Json }
        }
        $discords += [pscustomobject]@{ Location = $branch.FullName; Loads = $loads }
        if ($loads -and (Split-Path $loads -Leaf) -eq "patcher.js") { [void](Add-Build (Split-Path $loads -Parent) $branch.Name) }
    }

    $equibopState = Join-Path $env:APPDATA "equibop\state.json"
    $equibopCustom = if (Test-Path $equibopState) { (Get-Content $equibopState -Raw | ConvertFrom-Json).equicordDir }
    if ($equibopCustom) {
        if (-not (Add-Build $equibopCustom "Equibop")) {
            Write-Host "Equibop loads Equicord from a custom folder, so it was skipped."
            $skipped = $true
        }
    } else {
        Add-Target "Equibop" (, @("equibop.asar", (Join-Path $env:APPDATA "equibop\sessionData\equicord.asar")))
    }

    Add-Target "Discord with Equicord" (, @("desktop.asar", (Join-Path $env:APPDATA "Equicord\equicord.asar"))) (Join-Path $env:APPDATA "Equicord") "https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli.exe" "EQUICORD_USER_DATA_DIR"

    if (-not $uninstall -and $discords) {
        foreach ($target in @($targets | Where-Object { $_.Cli })) {
            $main = $target.Files[0][1]
            if ($discords | Where-Object { $_.Loads -eq $main }) { continue }
            $free = @($discords | Where-Object { -not $_.Loads })
            if ($free.Count -eq $discords.Count) {
                $target.Inject = @($free.Location)
                foreach ($discord in $free) { $discord.Loads = $main }
            } else {
                Write-Host "$($target.Name): Discord loads its client from somewhere else, so $(Split-Path $main) was left alone."
                [void]$targets.Remove($target)
                $skipped = $true
            }
        }
    }

    if (-not $targets.Count -and -not $builds.Count) {
        if ($uninstall) { Write-Host "None of your apps have these plugins, so there's nothing to uninstall." }
        elseif (-not $skipped) { Write-Host "No Vencord or Equicord install found. Install Vesktop, Equibop, or Vencord or Equicord for the Discord app, open it once, then run this again. If you built Vencord yourself, see $guide" }
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
            $official = $false
            foreach ($file in $target.Files) {
                if ($uninstall -and (Test-Path "$($file[1]).before-plugins")) { continue }
                $base = if (-not $uninstall) { $release } elseif ($file[0] -like "*.asar") { $officialEquicord } else { $officialVencord }
                $official = $uninstall
                Invoke-WebRequest -UseBasicParsing -Uri "$base/$($file[0])" -OutFile (Join-Path $temp $file[0])
            }
            $marker = if ($target.Data) { Join-Path $target.Data "injected.before-plugins" }
            if (-not $uninstall) {
                if ($target.Fresh) {
                    foreach ($file in $target.Files) { if (Test-Path $file[1]) { Copy-Item -Force -Path $file[1] -Destination "$($file[1]).before-plugins" } }
                }
                if ($target.Inject) {
                    Write-Host "$($target.Name): Discord isn't set up to load it, so its official installer is doing that first."
                    if (-not (Invoke-Cli $target "-install" $target.Inject)) {
                        if ($target.Fresh) {
                            foreach ($file in $target.Files) { if (Test-Path "$($file[1]).before-plugins") { Move-Item -Force -Path "$($file[1]).before-plugins" -Destination $file[1] } }
                        }
                        Write-Host "$($target.Name): its installer couldn't set up Discord, so nothing was changed there. Its message is above."
                        continue
                    }
                    Add-Content -Path $marker -Value $target.Inject
                }
            } elseif ($marker -and (Test-Path $marker)) {
                if (-not (Invoke-Cli $target "-uninstall" (Get-Content $marker))) {
                    Write-Host "$($target.Name): its installer couldn't undo the Discord setup, so nothing was changed there. Its message is above."
                    continue
                }
                Remove-Item -Force -Path $marker
            }
            foreach ($file in $target.Files) {
                $backup = "$($file[1]).before-plugins"
                if ($uninstall -and (Test-Path $backup)) {
                    Move-Item -Force -Path $backup -Destination $file[1]
                    continue
                }
                Copy-Item -Force -Path (Join-Path $temp $file[0]) -Destination $file[1]
            }
            if (-not $uninstall) { Write-Host "$($target.Name): installed. Open it and turn on the plugins in Settings." }
            elseif ($official) { Write-Host "$($target.Name): removed the plugins. The build you had before wasn't saved, so it's on the official build now." }
            else { Write-Host "$($target.Name): removed the plugins and put back the build you had before." }
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
            $folders = @(Join-Path $root "src\userplugins")
            if ($betterVencord) { $folders += Join-Path $patchset "src\userplugins" }
            if ($folders | Where-Object { (Test-Path $_) -and (Get-Item $_).LinkType }) {
                Write-Host "$($apps): your Vencord build takes its plugins from a linked folder, so it was skipped."
                continue
            }
            $dist = Join-Path $root "dist"
            $saved = "$dist.before-plugins"
            $present = @($plugins | Where-Object { $name = $_.Name; $folders | Where-Object { Test-Path (Join-Path $_ $name) } })
            if ($uninstall) {
                if (-not $present) {
                    Write-Host "$($apps): your own build doesn't have these plugins, so nothing changed."
                    continue
                }
                foreach ($folder in $folders) { foreach ($plugin in $present) { Remove-Item -Recurse -Force -Path (Join-Path $folder $plugin.Name) -ErrorAction SilentlyContinue } }
                if (Test-Path $saved) {
                    Remove-Item -Recurse -Force -Path $dist
                    Rename-Item -Path $saved -NewName "dist"
                    Write-Host "$($apps): removed the plugins and put back the build you had before."
                    continue
                }
                Write-Host "$($apps): rebuilding your own Vencord in $root without the plugins. This takes a minute."
            } else {
                if (-not $present -and (Test-Path $dist) -and -not (Test-Path $saved)) { Copy-Item -Recurse -Path $dist -Destination $saved }
                foreach ($folder in $folders) {
                    New-Item -ItemType Directory -Force -Path $folder | Out-Null
                    foreach ($plugin in $plugins) {
                        $dest = Join-Path $folder $plugin.Name
                        if (Test-Path $dest) { Remove-Item -Recurse -Force -Path $dest }
                        Copy-Item -Recurse -Path $plugin.FullName -Destination $dest
                    }
                }
                Write-Host "$($apps): rebuilding your own Vencord in $root with the plugins. This takes a minute."
            }

            $current = Join-Path $temp "dist-$([guid]::NewGuid())"
            if (Test-Path $dist) { Copy-Item -Recurse -Path $dist -Destination $current }
            $flags = @()
            if ($betterVencord) {
                $flags += "--standalone"
                $base = Join-Path $patchset "base\$(Split-Path $root -Leaf)"
                $env:VENCORD_HASH = "$(git -C $base rev-parse --short HEAD) (BetterVencord patchset built by $(git -C $patchset rev-parse --short HEAD))"
                $env:EQUICORD_HASH = $env:VENCORD_HASH
                $env:BV_REMOTE = (git -C $patchset remote get-url origin) -replace '^(https://github\.com/|git@github\.com:)' -replace '\.git$'
            }
            $built = $false
            Push-Location $root
            try {
                $ErrorActionPreference = "Continue"
                & $pnpm.Source build @flags
                $built = $LASTEXITCODE -eq 0
            } catch {
                Write-Host $_
            } finally {
                $ErrorActionPreference = "Stop"
                Pop-Location
                Remove-Item -Path Env:VENCORD_HASH, Env:EQUICORD_HASH, Env:BV_REMOTE -ErrorAction SilentlyContinue
            }
            if ($built) {
                if ($uninstall) { Write-Host "$($apps): removed the plugins from your own build." }
                else { Write-Host "$($apps): installed into your own build. Open it and turn on the plugins in Settings. Run this again to update them." }
            } else {
                if (Test-Path $current) {
                    if (Test-Path $dist) { Remove-Item -Recurse -Force -Path $dist }
                    Copy-Item -Recurse -Path $current -Destination $dist
                }
                if ($uninstall) { Write-Host "$($apps): the build failed, so your current build, which still has the plugins, was kept. The errors are above." }
                else { Write-Host "$($apps): the build failed, so your previous build was kept. The errors are above, and $guide has the manual steps." }
            }
        }

        if ($uninstall) {
            foreach ($app in "vesktop", "equibop", "discord", "discordptb", "discordcanary", "discorddevelopment") {
                $fonts = Join-Path $env:APPDATA "$app\QuoteFonts"
                if (Test-Path $fonts) { Remove-Item -Recurse -Force -Path $fonts }
            }
        }
    } finally {
        Remove-Item -Recurse -Force -Path $temp -ErrorAction SilentlyContinue
    }
}
