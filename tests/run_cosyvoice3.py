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
from voice_director import STYLE_REFS_DIR

MODEL_DIR = REPO_ROOT / "models" / "CosyVoice3-0.5B"
OUT_DIR = ROOT / "outputs" / "cosyvoice3"
PROMPT_TEXT = f"You are a helpful assistant.<|endofprompt|>{REFERENCE_SENTENCE}"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = OUT_DIR / "summary.json"
    if summary_path.exists():
        summary_path.unlink()
    from cosyvoice.cli.cosyvoice import AutoModel

    load_start = time.time()
    cosyvoice = AutoModel(model_dir=str(MODEL_DIR), fp16=True)
    load_s = round(time.time() - load_start, 2)
    print("CosyVoice model loaded", load_s, "cuda", torch.cuda.is_available())

    warmup_path = OUT_DIR / "_warmup.wav"
    warmup_voice = VOICES[0]
    warmup_style = STYLES[0]
    warmup_text = TEXTS[0]
    warmup_ref = str(STYLE_REFS_DIR / warmup_voice["id"] / f"{warmup_style['id']}.wav")
    for chunk in cosyvoice.inference_zero_shot(
        warmup_text["text"], PROMPT_TEXT, warmup_ref, stream=False
    ):
        warmup_speech = chunk["tts_speech"]
    torchaudio.save(str(warmup_path), warmup_speech, cosyvoice.sample_rate)
    warmup_path.unlink(missing_ok=True)

    for voice in VOICES:
        for style in STYLES:
            ref_wav = str(STYLE_REFS_DIR / voice["id"] / f"{style['id']}.wav")
            for item in TEXTS:
                out_path = OUT_DIR / f"{voice['id']}_{style['id']}_{item['id']}.wav"
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.synchronize()
                gen_start = time.time()
                parts = []
                for chunk in cosyvoice.inference_zero_shot(
                    item["text"], PROMPT_TEXT, ref_wav, stream=False
                ):
                    parts.append(chunk["tts_speech"])
                torch.cuda.synchronize()
                gen_s = round(time.time() - gen_start, 3)
                peak_mb = round(torch.cuda.max_memory_allocated() / 1024 / 1024, 1)
                speech = torch.cat(parts, dim=1)
                torchaudio.save(str(out_path), speech, cosyvoice.sample_rate)
                acoustics = analyze_wav(out_path)
                rtf = round(gen_s / acoustics["duration_s"], 3) if acoustics["duration_s"] else None
                record = {
                    "engine": "cosyvoice3",
                    "voice_id": voice["id"],
                    "voice_label": voice["label"],
                    "style": style["id"],
                    "style_label": style["label"],
                    "reference_audio": ref_wav,
                    "id": item["id"],
                    "text": item["text"],
                    "output": str(out_path),
                    "load_s": load_s,
                    "gen_s": gen_s,
                    "rtf": rtf,
                    "peak_vram_mb": peak_mb,
                    **acoustics,
                }
                print(json.dumps(record, ensure_ascii=False))
                append_summary(summary_path, record)


if __name__ == "__main__":
    main()
