param(
    [switch]$Mirror
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $repo '.venv-cosyvoice311'
$py = Join-Path $venv 'Scripts\python.exe'
$pypiIndex = if ($Mirror) { 'https://pypi.tuna.tsinghua.edu.cn/simple' } else { 'https://pypi.org/simple' }
$torchIndex = if ($Mirror) { 'https://mirror.sjtu.edu.cn/pytorch-wheels/cu126' } else { 'https://download.pytorch.org/whl/cu126' }

Write-Host 'Creating Python 3.11 environment...'
if (Get-Command uv -ErrorAction SilentlyContinue) {
    & uv venv $venv --python 3.11
} else {
    & python -m venv $venv
}

& $py -m pip install --upgrade pip
& $py -m pip install "setuptools<81" --index-url $pypiIndex

Write-Host 'Installing CUDA PyTorch (2.6 + cu126)...'
& $py -m pip install torch==2.6.0+cu126 torchaudio==2.6.0+cu126 --index-url $torchIndex
& $py -m pip install openai-whisper==20231117 --no-build-isolation --index-url $pypiIndex

Write-Host 'Installing project requirements...'
& $py -m pip install -r (Join-Path $repo 'requirements.txt') --index-url $pypiIndex

if (-not (Test-Path -LiteralPath (Join-Path $repo 'CosyVoice\cosyvoice'))) {
    Write-Host 'Cloning CosyVoice repository...'
    & git clone --depth 1 https://github.com/QwenAudio/CosyVoice.git (Join-Path $repo 'CosyVoice')
}

Write-Host 'Preparing Matcha-TTS source...'
$downloadDir = Join-Path $repo 'downloads'
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
& $py -m pip download matcha-tts==0.0.7.2 --no-deps --no-binary :all: -d $downloadDir --index-url $pypiIndex
$tar = Get-ChildItem -Path $downloadDir -Filter 'matcha-tts-0.0.7.2.tar.gz' | Select-Object -First 1
if (-not $tar) {
    Write-Error 'matcha-tts sdist not found after download.'
    exit 1
}
$matchaDir = Join-Path $repo 'third_party\Matcha-TTS'
New-Item -ItemType Directory -Path $matchaDir -Force | Out-Null
& tar -xzf $tar.FullName -C $matchaDir --strip-components=1

Write-Host ''
Write-Host 'Setup finished.'
Write-Host 'Next: run download_models.ps1 [-Mirror]'
Write-Host 'Then: start.ps1 [-Port 8000]'
