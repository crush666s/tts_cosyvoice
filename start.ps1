param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $repo '.venv-cosyvoice311\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $py)) {
    Write-Error 'Run setup.ps1 first.'
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $repo 'models\CosyVoice3-0.5B\llm.pt'))) {
    Write-Error 'Model missing. Run download_models.ps1 first.'
    exit 1
}

$env:TTS_PROJECT_ROOT = $repo
Push-Location (Join-Path $repo 'app')
try {
    & $py -m uvicorn main:app --host 127.0.0.1 --port $Port
} finally {
    Pop-Location
}
