from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TEXTS = [
    {
        "id": "confirm",
        "text": "药液温度已经稳定，可以开始加样。",
        "style": "平静确认",
    },
    {
        "id": "alert",
        "text": "检测到压力异常，请立即停止操作。",
        "style": "严肃提醒",
    },
    {
        "id": "warm",
        "text": "好的，我马上为您处理这个问题。",
        "style": "温和安抚",
    },
]

VOICES = [
    {
        "id": "zh_sample",
        "path": str(ROOT / "models" / "XTTS-v2" / "samples" / "zh-cn-sample.wav"),
        "label": "XTTS 中文示例音色",
        "prompt_text": (
            "You are a helpful assistant.<|endofprompt|>希望你以后能够做的比我还好呦。"
        ),
    },
    {
        "id": "cosy_zero",
        "path": str(ROOT / "CosyVoice" / "asset" / "zero_shot_prompt.wav"),
        "label": "CosyVoice 零样本示例音色",
        "prompt_text": (
            "You are a helpful assistant.<|endofprompt|>希望你以后能够做的比我还好呦。"
        ),
    },
    {
        "id": "cosy_cross",
        "path": str(ROOT / "CosyVoice" / "asset" / "cross_lingual_prompt.wav"),
        "label": "CosyVoice 跨语种示例音色",
        "prompt_text": (
            "You are a helpful assistant.<|endofprompt|>希望你以后能够做的比我还好呦。"
        ),
    },
]
