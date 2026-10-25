$vencord = Join-Path $PSScriptRoot "vencord"
$link = Join-Path $vencord "src\userplugins"

function Run($exe) {
    & $exe @args
    if ($LASTEXITCODE) { throw "$exe $args failed with exit code $LASTEXITCODE" }
}

if (Test-Path (Join-Path $vencord ".git")) {
    Run git -C $vencord pull --ff-only
} else {
    Run git clone --filter=blob:none https://github.com/Vendicated/Vencord $vencord
}

if (-not (Test-Path $link)) {
    New-Item -ItemType Junction -Path $link -Target (Join-Path $PSScriptRoot "plugins") -ErrorAction Stop | Out-Null
}

$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
Push-Location $vencord
try {
    Run corepack pnpm install --frozen-lockfile
    Run corepack pnpm build
} finally {
    Pop-Location
}

$pkg = Join-Path $vencord "dist\package.json"
if (-not (Test-Path $pkg)) { Set-Content -Path $pkg -Value "{}" -Encoding ascii }

foreach ($name in "node_modules", "packages") {
    $path = Join-Path $PSScriptRoot $name
    if (-not (Test-Path $path)) {
        New-Item -ItemType Junction -Path $path -Target (Join-Path $vencord $name) -ErrorAction Stop | Out-Null
    }
}

"Vencord Location: $(Join-Path $vencord 'dist')"
