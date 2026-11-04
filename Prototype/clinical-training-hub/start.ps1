param([int]$Port = 8000)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if (Test-Path -LiteralPath '.env') {
    foreach ($envLine in Get-Content -LiteralPath '.env') {
        if ($envLine -match '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1],$matches[2].Trim().Trim('"').Trim("'"),'Process')
        }
    }
}
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Không tạo được Python environment.' }
}
$pythonPath=Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath '.venv\dependencies-ready')) {
    & $pythonPath -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Cài thư viện Python thất bại.' }
    New-Item -ItemType File -Path '.venv\dependencies-ready' -Force | Out-Null
}
if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Cài thư viện giao diện thất bại.' }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build giao diện thất bại.' }
& $pythonPath -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration thất bại.' }
Write-Host "Mở ứng dụng tại http://127.0.0.1:$Port"
& $pythonPath -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
