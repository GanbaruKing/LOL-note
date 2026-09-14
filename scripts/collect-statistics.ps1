$ErrorActionPreference = 'Stop'
$promptedForRiotKey = $false
try {
    if (-not $env:RIOT_API_KEY) {
        $riotSecret = Read-Host 'Riot API Key（入力は表示されません）' -AsSecureString
        $env:RIOT_API_KEY = ([System.Net.NetworkCredential]::new('', $riotSecret)).Password
        $promptedForRiotKey = $true
    }
    Push-Location -LiteralPath (Join-Path $PSScriptRoot '..')
    try {
        & npm.cmd run stats:collect -- @args
        $collectorExitCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    if ($promptedForRiotKey) { Remove-Item Env:RIOT_API_KEY -ErrorAction SilentlyContinue }
}
exit $collectorExitCode
