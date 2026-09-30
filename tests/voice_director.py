from dataclasses import asdict, dataclass
from pathlib import Path

from styles import STYLE_MAP, STYLES

STYLE_REFS_DIR = Path(__file__).resolve().parent / "assets" / "style_refs"


@dataclass
class SpeechRequest:
    scenario: str
    text: str
    style: str
    style_label: str
    reference_audio: str
    intensity: float
    rate: float
    pitch_shift_st: float
    energy: float
    pause_scale: float
    instruct_text: str

    def to_dict(self):
        return asdict(self)


SCENARIO_TO_STYLE = {
    "confirm": "calm_confirm",
    "alert": "serious_alert",
    "warm": "warm_encourage",
}


def clamp(value, low, high):
    return max(low, min(high, value))


def plan(style_or_scenario, text, reference_audio=None):
    style_id = SCENARIO_TO_STYLE.get(style_or_scenario, style_or_scenario)
    if style_id not in STYLE_MAP:
        raise KeyError(f"unknown style: {style_id}")
    rule = STYLE_MAP[style_id]
    request = SpeechRequest(
        scenario=style_or_scenario,
        text=text,
        style=style_id,
        style_label=rule["label"],
        reference_audio=reference_audio or str(STYLE_REFS_DIR / f"{style_id}.wav"),
        intensity=clamp(rule["intensity"], 0.4, 1.0),
        rate=clamp(rule["rate"], 0.85, 1.15),
        pitch_shift_st=clamp(rule["pitch_shift_st"], -2.0, 2.0),
        energy=clamp(rule["energy"], 0.85, 1.15),
        pause_scale=clamp(rule["pause_scale"], 0.8, 1.3),
        instruct_text=f"You are a helpful assistant. {rule['instruct']}<|endofprompt|>",
    )
    return request


def all_styles():
    return [plan(style["id"], "") for style in STYLES]
