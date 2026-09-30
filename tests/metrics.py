import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


def analyze_wav(path):
    data, sr = sf.read(path, dtype="float32", always_2d=True)
    y = data.mean(axis=1)
    duration = len(y) / float(sr)
    f0 = None
    f0_mean = None
    f0_std = None
    try:
        f0, voiced, _ = librosa.pyin(y, fmin=60.0, fmax=500.0, sr=sr)
        voiced_idx = np.flatnonzero(voiced)
        if len(voiced_idx):
            f0_array = f0[voiced_idx]
            f0_mean = float(np.nanmean(f0_array))
            f0_std = float(np.nanstd(f0_array))
    except Exception as exc:
        print("pyin warning", exc)
    rms = float(np.sqrt(np.mean(np.square(y))))
    zcr = float(np.mean(librosa.zero_crossings(y)))
    return {
        "duration_s": round(duration, 3),
        "f0_mean_hz": None if f0_mean is None else round(f0_mean, 1),
        "f0_std_hz": None if f0_std is None else round(f0_std, 1),
        "rms": round(rms, 5),
        "zcr": round(zcr, 5),
        "sr": sr,
    }


def append_summary(path, item):
    rows = []
    if Path(path).exists():
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
    rows.append(item)
    Path(path).write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
