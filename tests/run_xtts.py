import json
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from corpus import TEXTS, VOICES
from metrics import analyze_wav, append_summary
from styles import STYLES
from voice_director import STYLE_REFS_DIR

MODEL_DIR = REPO_ROOT / "models" / "XTTS-v2"
OUT_DIR = ROOT / "outputs" / "xtts"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = OUT_DIR / "summary.json"
    if summary_path.exists():
        summary_path.unlink()
    from TTS.api import TTS

    load_start = time.time()
    tts = TTS(
        model_path=str(MODEL_DIR),
        config_path=str(MODEL_DIR / "config.json"),
        gpu=True,
    )
    load_s = round(time.time() - load_start, 2)
    print("XTTS model loaded", load_s, "cuda", torch.cuda.is_available())

    warmup_voice = VOICES[0]
    warmup_style = STYLES[0]
    warmup_text = TEXTS[0]
    warmup_path = OUT_DIR / "_warmup.wav"
    tts.tts_to_file(
        text=warmup_text["text"],
        speaker_wav=str(STYLE_REFS_DIR / warmup_voice["id"] / f"{warmup_style['id']}.wav"),
        language="zh-cn",
        file_path=str(warmup_path),
        split_sentences=False,
    )
    warmup_path.unlink(missing_ok=True)

    for voice in VOICES:
        for style in STYLES:
            ref_wav = str(STYLE_REFS_DIR / voice["id"] / f"{style['id']}.wav")
            for item in TEXTS:
                out_path = OUT_DIR / f"{voice['id']}_{style['id']}_{item['id']}.wav"
                torch.cuda.reset_peak_memory_stats()
                torch.cuda.synchronize()
                gen_start = time.time()
                tts.tts_to_file(
                    text=item["text"],
                    speaker_wav=ref_wav,
                    language="zh-cn",
                    file_path=str(out_path),
                    split_sentences=False,
                )
                torch.cuda.synchronize()
                gen_s = round(time.time() - gen_start, 3)
                peak_mb = round(torch.cuda.max_memory_allocated() / 1024 / 1024, 1)
                acoustics = analyze_wav(out_path)
                rtf = round(gen_s / acoustics["duration_s"], 3) if acoustics["duration_s"] else None
                record = {
                    "engine": "xtts_v2",
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
