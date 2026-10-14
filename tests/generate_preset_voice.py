"""Generate the built-in reference voices shipped with the demo.

The web page and the WeChat mini program both expose these clips as
"preset" reference voices, so a visitor can hear a result without having
to record anything first.

Run from the repository root:

    .venv-cosyvoice311\\Scripts\\python.exe tests\\generate_preset_voice.py

The script writes `app/presets/<id>.wav` plus `app/presets/presets.json`.
Every clip reads REFERENCE_SENTENCE, which keeps the recording usable in
the strict "mimic the reference prosody" mode.
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

os.environ.setdefault("COSYVOICE_DIR", str(ROOT / "CosyVoice"))
os.environ.setdefault("MATCHA_TTS_DIR", str(ROOT / "third_party" / "Matcha-TTS"))
sys.path.insert(0, str(ROOT / "CosyVoice"))
sys.path.insert(0, str(ROOT / "third_party" / "Matcha-TTS"))

import torch  # noqa: E402
import torchaudio  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402

REFERENCE_SENTENCE = "希望你以后能够做的比我还好呦。"

# Candidate voices. `speed` below 1 stretches the clip so the reference
# clears the 5 second minimum required by the strict prosody mode.
CANDIDATES = [
    {
        "id": "child_peppa",
        "label": "儿童音色",
        "description": "卡通童声，语调上扬活泼",
        "speed": 0.5,
        "instruct": "You are a helpful assistant. 我想体验一下小猪佩奇风格，可以吗？<|endofprompt|>",
    },
    {
        "id": "child_girl",
        "label": "小女孩音色",
        "description": "清亮童声，语气轻快",
        "speed": 0.5,
        "instruct": "You are a helpful assistant. 请用可爱的小女孩的声音，语气活泼一点说这句话。<|endofprompt|>",
    },
]

# The strict "mimic the reference prosody" mode rejects anything shorter
# than 5 seconds, so every preset is padded past that threshold.
MIN_DURATION_S = 6.0


def synthesize(model, instruct, speed, prompt_wav, sample_rate):
    chunks = []
    for out in model.inference_instruct2(
        REFERENCE_SENTENCE,
        instruct,
        str(prompt_wav),
        stream=False,
        speed=speed,
    ):
        chunks.append(out["tts_speech"])
    speech = torch.cat(chunks, dim=1)
    target = int(MIN_DURATION_S * sample_rate)
    if speech.shape[1] < target:
        pad = torch.zeros(1, target - speech.shape[1], dtype=speech.dtype)
        speech = torch.cat([speech, pad], dim=1)
    return speech


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", default=str(ROOT / "models" / "CosyVoice3-0.5B"))
    parser.add_argument("--out-dir", default=str(ROOT / "app" / "presets"))
    parser.add_argument(
        "--prompt-wav",
        default=str(ROOT / "CosyVoice" / "asset" / "zero_shot_prompt.wav"),
        help="voice used as the timbre starting point",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    model = AutoModel(model_dir=args.model_dir, fp16=True)
    manifest = []
    for item in CANDIDATES:
        speech = synthesize(
            model, item["instruct"], item["speed"], args.prompt_wav, model.sample_rate
        )
        target = out_dir / f"{item['id']}.wav"
        torchaudio.save(str(target), speech, model.sample_rate)
        duration = round(speech.shape[1] / model.sample_rate, 2)
        print(f"wrote {target.name} ({duration}s)")
        manifest.append(
            {
                "id": item["id"],
                "label": item["label"],
                "description": item["description"],
                "file": target.name,
                "duration_s": duration,
                "reference_text": REFERENCE_SENTENCE,
            }
        )

    manifest_path = out_dir / "presets.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {manifest_path}")


if __name__ == "__main__":
    main()
