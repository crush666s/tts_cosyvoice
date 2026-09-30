import json
import sys
import time
from pathlib import Path

import torch
import torchaudio

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "CosyVoice"))
sys.path.insert(0, str(REPO_ROOT / "third_party" / "Matcha-TTS"))

from corpus import TEXTS, VOICES
from metrics import analyze_wav, append_summary
from styles import REFERENCE_SENTENCE, STYLES
from voice_director import plan

MODEL_DIR = REPO_ROOT / "models" / "CosyVoice3-0.5B"
OUT_DIR = ROOT / "outputs" / "e2e_cosyvoice"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = OUT_DIR / "summary.json"
    if summary_path.exists():
        summary_path.unlink()
    from cosyvoice.cli.cosyvoice import AutoModel

    cosyvoice = AutoModel(model_dir=str(MODEL_DIR), fp16=True)
    warmup_req = plan(STYLES[0]["id"], REFERENCE_SENTENCE)
    for chunk in cosyvoice.inference_instruct2(
        REFERENCE_SENTENCE,
        warmup_req.instruct_text,
        VOICES[0]["path"],
        stream=False,
    ):
        warmup_speech = chunk["tts_speech"]
    torchaudio.save(str(OUT_DIR / "_warmup.wav"), warmup_speech, cosyvoice.sample_rate)
    Path(OUT_DIR / "_warmup.wav").unlink(missing_ok=True)

    for voice in VOICES:
        for style in STYLES:
            for item in TEXTS:
                request = plan(style["id"], item["text"], reference_audio=voice["path"])
                out_path = OUT_DIR / f"{voice['id']}_{style['id']}_{item['id']}.wav"
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.synchronize()
                start = time.time()
                parts = []
                for chunk in cosyvoice.inference_instruct2(
                    item["text"],
                    request.instruct_text,
                    voice["path"],
                    stream=False,
                ):
                    parts.append(chunk["tts_speech"])
                torch.cuda.synchronize()
                gen_s = round(time.time() - start, 3)
                peak_mb = round(torch.cuda.max_memory_allocated() / 1024 / 1024, 1)
                speech = torch.cat(parts, dim=1)
                torchaudio.save(str(out_path), speech, cosyvoice.sample_rate)
                acoustics = analyze_wav(out_path)
                rtf = round(gen_s / acoustics["duration_s"], 3) if acoustics["duration_s"] else None
                record = {
                    "engine": "cosyvoice3_director_e2e",
                    "voice_id": voice["id"],
                    "voice_label": voice["label"],
                    "style": style["id"],
                    "style_label": style["label"],
                    "id": item["id"],
                    "text": item["text"],
                    "request": request.to_dict(),
                    "output": str(out_path),
                    "gen_s": gen_s,
                    "rtf": rtf,
                    "peak_vram_mb": peak_mb,
                    **acoustics,
                }
                print(json.dumps(record, ensure_ascii=False))
                append_summary(summary_path, record)


if __name__ == "__main__":
    main()
