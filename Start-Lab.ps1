param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8769,
    [switch]$NoOpen
)

$labUrl = "http://127.0.0.1:$Port"
$labSuffix = if ($Port -eq 8769) { '' } else { "-$Port" }
$labAlive = $false
try { $labAlive = (Invoke-WebRequest -Uri $labUrl -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (-not $labAlive) {
    $labProcess = Start-Process -FilePath 'C:/Python314/python.exe' -ArgumentList @('server.py', '--port', $Port) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot "evidence/server$labSuffix.log") -RedirectStandardError (Join-Path $PSScriptRoot "evidence/server-errors$labSuffix.log") -PassThru
    $labProcess.Id | Set-Content (Join-Path $PSScriptRoot "work-server$labSuffix.pid")
    for ($labAttempt=0; $labAttempt -lt 20; $labAttempt++) {
        try { $labAlive = (Invoke-WebRequest -Uri $labUrl -TimeoutSec 1).StatusCode -eq 200 } catch {}
        if ($labAlive) { break }
        Start-Sleep -Milliseconds 200
    }
}
if (-not $labAlive) {
    Write-Error "Luaサーバーの起動に失敗しました。evidence/server-errors$labSuffix.log を確認してください。"
} elseif ($NoOpen) {
    Write-Output $labUrl
} else {
    Start-Process $labUrl
}
