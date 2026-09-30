import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from styles import REFERENCE_SENTENCE, STYLES
from voice_director import plan

OUT_DIR = ROOT / "outputs" / "director_mock"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cases = []
    for style in STYLES:
        scenario = style["id"]
        first = plan(scenario, REFERENCE_SENTENCE)
        second = plan(scenario, REFERENCE_SENTENCE)
        payload = first.to_dict()
        check(first == second, f"{scenario} not deterministic")
        check(0.4 <= payload["intensity"] <= 1.0, "intensity out of bounds")
        check(0.85 <= payload["rate"] <= 1.15, "rate out of bounds")
        check(-2.0 <= payload["pitch_shift_st"] <= 2.0, "pitch out of bounds")
        check(0.8 <= payload["pause_scale"] <= 1.3, "pause out of bounds")
        check("<|endofprompt|>" in payload["instruct_text"], "missing prompt terminator")
        cases.append({"scenario": scenario, "request": payload, "valid": True})
    report = {"engine": "director_mock", "passed": True, "cases": cases}
    out_path = OUT_DIR / "summary.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
