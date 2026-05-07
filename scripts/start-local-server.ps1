$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$node = "C:\Program Files\nodejs\node.exe"
$serverScript = Join-Path $repo "scripts\serve-static.mjs"
$logDir = Join-Path $repo "logs"
$logFile = Join-Path $logDir "local-server.log"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

"$(Get-Date -Format o) Starting Horario local server" | Out-File -FilePath $logFile -Append -Encoding utf8

Set-Location $repo
& $node $serverScript *>> $logFile
