param(
    [switch]$Mirror
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $repo '.venv-cosyvoice311\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $py)) {
    Write-Error 'Run setup.ps1 first to create the Python environment.'
    exit 1
}

if ($Mirror) {
    $env:HF_ENDPOINT = 'https://hf-mirror.com'
}

$env:TTS_REPO = $repo
& $py -c @"
import os
from pathlib import Path
from huggingface_hub import snapshot_download

repo = Path(os.environ['TTS_REPO'])
target = repo / 'models' / 'CosyVoice3-0.5B'
target.mkdir(parents=True, exist_ok=True)
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir=str(target))
"@
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host 'Model downloaded to models/CosyVoice3-0.5B'
