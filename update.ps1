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

"Vencord Location: $(Join-Path $vencord 'dist')"
