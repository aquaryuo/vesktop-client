$env:VESKTOP_CLIENT_UNINSTALL = "1"
try {
    Invoke-RestMethod https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.ps1 | Invoke-Expression
} finally {
    Remove-Item Env:VESKTOP_CLIENT_UNINSTALL -ErrorAction SilentlyContinue
}
