import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import librosa
import numpy as np
import soundfile
import torch
import torchaudio
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

APP_DIR = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("TTS_PROJECT_ROOT", APP_DIR.parent)).resolve()
DATA_DIR = Path(os.environ.get("TTS_DATA_DIR", APP_DIR / "data")).resolve()
RECORDING_DIR = DATA_DIR / "recordings"
OUTPUT_DIR = DATA_DIR / "outputs"
RECORDING_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(os.environ.get("TTS_TESTS_DIR", ROOT / "tests")).resolve()))
sys.path.insert(0, str(Path(os.environ.get("COSYVOICE_DIR", ROOT / "CosyVoice")).resolve()))
sys.path.insert(0, str(Path(os.environ.get("MATCHA_TTS_DIR", ROOT / "third_party" / "Matcha-TTS")).resolve()))

from cosyvoice.cli.cosyvoice import AutoModel
from metrics import analyze_wav
from styles import REFERENCE_SENTENCE, STYLES
from voice_director import plan

MODEL_DIR = Path(os.environ.get("COSYVOICE_MODEL_DIR", ROOT / "models" / "CosyVoice3-0.5B")).resolve()
PHASES = json.loads((APP_DIR / "phrases.json").read_text(encoding="utf-8"))
PHRASE_MAP = {item["id"]: item for item in PHASES}

model = None
model_ready = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global model, model_ready
    model = AutoModel(model_dir=str(MODEL_DIR), fp16=True)
    model_ready = True
    yield


app = FastAPI(title="CosyVoice 语音交互演示", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(APP_DIR)), name="static")


class ReferenceMeta(BaseModel):
    reference_id: str
    path: str


class SynthRequest(BaseModel):
    reference_id: str
    phrase_id: str
    mode: str = "record"
    style_id: str = "record"
    reference_text: str = REFERENCE_SENTENCE


@app.get("/")
def index():
    return FileResponse(APP_DIR / "index.html")


@app.get("/api/phrases")
def phrases():
    return {"items": PHASES}


@app.get("/api/styles")
def styles():
    return {"items": [{"id": item["id"], "label": item["label"]} for item in STYLES]}


@app.get("/api/status")
def status():
    return {
        "ready": model_ready,
        "cuda": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


@app.post("/api/reference")
async def upload_reference(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")
    reference_id = f"rec_{int(time.time() * 1000)}"
    path = RECORDING_DIR / f"{reference_id}.wav"
    path.write_bytes(data)
    try:
        wav, sr = torchaudio.load(str(path), backend="soundfile")
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        torchaudio.save(str(path), wav, sr)
        y = wav.numpy()[0]
        y_trim, _ = librosa.effects.trim(y, top_db=20, frame_length=512, hop_length=128)
        if len(y_trim) >= int(0.3 * sr):
            y = y_trim
        soundfile.write(str(path), y, sr, subtype="PCM_16")
        duration = round(len(y) / sr, 3)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"invalid wav: {exc}") from exc
    acoustics = analyze_wav(path)
    warnings = []
    if duration < 4:
        warnings.append("参考音频较短，建议提供 5-10 秒清晰人声")
    if acoustics.get("f0_mean_hz") is None:
        warnings.append("未检测到明显语音基频，请确认录音是否包含清晰人声")
    return {
        "reference_id": reference_id,
        "path": str(path),
        "duration_s": duration,
        "rms": acoustics["rms"],
        "f0_mean_hz": acoustics["f0_mean_hz"],
        "warnings": warnings,
    }


@app.post("/api/synthesize")
def synthesize(request: SynthRequest):
    global model
    if not model_ready or model is None:
        raise HTTPException(status_code=503, detail="model not ready")
    phrase = PHRASE_MAP.get(request.phrase_id)
    if phrase is None:
        raise HTTPException(status_code=404, detail="phrase not found")
    ref_path = RECORDING_DIR / f"{request.reference_id}.wav"
    if not ref_path.exists():
        raise HTTPException(status_code=404, detail="reference not found")

    torch.cuda.reset_peak_memory_stats()
    torch.cuda.synchronize()
    start = time.time()
    parts = []
    if request.mode == "reference":
        acoustics = analyze_wav(ref_path)
        if acoustics["duration_s"] < 5 or acoustics.get("f0_mean_hz") is None:
            raise HTTPException(
                status_code=422,
                detail="strict reference mode needs at least 5 seconds of clear speech",
            )
        prompt_text = f"You are a helpful assistant.<|endofprompt|>{request.reference_text or REFERENCE_SENTENCE}"
        for chunk in model.inference_zero_shot(
            phrase["text"], prompt_text, str(ref_path), stream=False
        ):
            parts.append(chunk["tts_speech"])
        style_id = "reference"
    elif request.mode == "style":
        req = plan(request.style_id, phrase["text"], reference_audio=str(ref_path))
        for chunk in model.inference_instruct2(
            phrase["text"], req.instruct_text, str(ref_path), stream=False
        ):
            parts.append(chunk["tts_speech"])
        style_id = request.style_id
    else:
        neutral_instruct = (
            "You are a helpful assistant. "
            "请自然、清晰、准确地读出这句话。<|endofprompt|>"
        )
        for chunk in model.inference_instruct2(
            phrase["text"], neutral_instruct, str(ref_path), stream=False
        ):
            parts.append(chunk["tts_speech"])
        style_id = "record"
    torch.cuda.synchronize()
    gen_s = round(time.time() - start, 3)
    peak_mb = round(torch.cuda.max_memory_allocated() / 1024 / 1024, 1)
    speech = torch.cat(parts, dim=1)
    out_path = OUTPUT_DIR / f"out_{int(time.time() * 1000)}.wav"
    torchaudio.save(str(out_path), speech, model.sample_rate)
    acoustics = analyze_wav(out_path)
    rtf = round(gen_s / acoustics["duration_s"], 3) if acoustics["duration_s"] else None
    return {
        "audio_url": f"/data/outputs/{out_path.name}",
        "style_id": style_id,
        "gen_s": gen_s,
        "rtf": rtf,
        "peak_vram_mb": peak_mb,
        **acoustics,
    }


app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
