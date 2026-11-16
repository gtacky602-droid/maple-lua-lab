$labUrl = 'http://127.0.0.1:8769'
$labAlive = $false
try { $labAlive = (Invoke-WebRequest -Uri $labUrl -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (-not $labAlive) {
    $labProcess = Start-Process -FilePath 'C:/Python314/python.exe' -ArgumentList @('server.py') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'evidence/server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'evidence/server-errors.log') -PassThru
    $labProcess.Id | Set-Content (Join-Path $PSScriptRoot 'work-server.pid')
    for ($labAttempt=0; $labAttempt -lt 20; $labAttempt++) {
        try { $labAlive = (Invoke-WebRequest -Uri $labUrl -TimeoutSec 1).StatusCode -eq 200 } catch {}
        if ($labAlive) { break }
        Start-Sleep -Milliseconds 200
    }
}
if ($labAlive) { Start-Process $labUrl } else { Write-Error 'Luaサーバーの起動に失敗しました。evidence/server-errors.log を確認してください。' }
