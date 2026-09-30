import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "outputs"


def load(name):
    path = OUT_DIR / name
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def fmt(value, digits=3):
    return "-" if value is None else f"{value:.{digits}f}"


def main():
    xtts = load("xtts/summary.json")
    cosy = load("cosyvoice3/summary.json")
    e2e = load("e2e_cosyvoice/summary.json")
    mock = load("director_mock/summary.json")

    voices = sorted({row["voice_id"] for rows in (xtts, cosy, e2e) for row in rows})
    styles = sorted({row["style"] for rows in (xtts, cosy, e2e) for row in rows})
    texts = sorted({row["id"] for rows in (xtts, cosy, e2e) for row in rows})

    lines = []
    lines.append("# TTS 风格迁移与语音导演测试报告")
    lines.append("")
    lines.append("测试日期：2026-09-28")
    lines.append("测试硬件：NVIDIA GeForce RTX 2070 8GB，CUDA 12.8，PyTorch 2.6.0+cu126")
    lines.append("")
    lines.append("## 测试矩阵")
    lines.append("")
    lines.append(f"- 参考音色：{len(voices)} 个（{', '.join(voices)}）")
    lines.append(f"- 语音导演风格：{len(styles)} 种")
    lines.append(f"- 每风格文案：{len(texts)} 句（{', '.join(texts)}）")
    lines.append(f"- XTTS 输出：{len(xtts)} 个 WAV")
    lines.append(f"- CosyVoice3 输出：{len(cosy)} 个 WAV")
    lines.append(f"- 导演端到端输出：{len(e2e)} 个 WAV")
    lines.append("")
    lines.append("## 风格路由")
    lines.append("")
    lines.append("语音导演当前可路由 10 种风格：")
    lines.append("")
    for style in styles:
        lines.append(f"- `{style}`")
    lines.append("")
    lines.append("## 性能汇总")
    lines.append("")
    lines.append("| 引擎 | 文件数 | RTF 均值 | RTF 中位数 | 峰值显存均值 |")
    lines.append("| --- | ---: | ---: | ---: | ---: |")
    for engine, rows in [("xtts_v2", xtts), ("cosyvoice3", cosy), ("cosyvoice3_director_e2e", e2e)]:
        rtf = [r["rtf"] for r in rows if r.get("rtf")]
        vram = [r["peak_vram_mb"] for r in rows if r.get("peak_vram_mb")]
        lines.append(
            "| {} | {} | {} | {} | {} MB |".format(
                engine,
                len(rows),
                fmt(statistics.mean(rtf) if rtf else None),
                fmt(statistics.median(rtf) if rtf else None),
                round(statistics.mean(vram), 1) if vram else "-",
            )
        )
    lines.append("")
    lines.append("## 分音色性能")
    lines.append("")
    lines.append("| 引擎 | 音色 | 文件数 | RTF 均值 | 显存均值 |")
    lines.append("| --- | --- | ---: | ---: | ---: |")
    for engine, rows in [("xtts_v2", xtts), ("cosyvoice3", cosy), ("cosyvoice3_director_e2e", e2e)]:
        for voice in voices:
            sub = [r for r in rows if r["voice_id"] == voice]
            rtf = [r["rtf"] for r in sub if r.get("rtf")]
            vram = [r["peak_vram_mb"] for r in sub if r.get("peak_vram_mb")]
            lines.append(
                "| {} | {} | {} | {} | {} MB |".format(
                    engine,
                    voice,
                    len(sub),
                    fmt(statistics.mean(rtf) if rtf else None),
                    round(statistics.mean(vram), 1) if vram else "-",
                )
            )
    lines.append("")
    lines.append("## 文件位置")
    lines.append("")
    lines.append("- XTTS：`E:\\tts\\tests\\outputs\\xtts\\*.wav` 与 `summary.json`")
    lines.append("- CosyVoice3：`E:\\tts\\tests\\outputs\\cosyvoice3\\*.wav` 与 `summary.json`")
    lines.append("- 导演 mock：`E:\\tts\\tests\\outputs\\director_mock\\summary.json`")
    lines.append("- 导演端到端：`E:\\tts\\tests\\outputs\\e2e_cosyvoice\\*.wav` 与 `summary.json`")
    lines.append("- 风格参考音频：`E:\\tts\\tests\\assets\\style_refs\\{voice}\\{style}.wav`")
    lines.append("")
    lines.append("## 说明与限制")
    lines.append("")
    lines.append("- 参考音色来自模型自带的示例音频；真实机器人音色需后续替换为新录制的参考音频。")
    lines.append("- 每个 WAV 的参考音频是同一音色下由 CosyVoice3 先生成的对应风格样本，XTTS 和 CosyVoice3 共用同一批风格参考。")
    lines.append("- 导演端到端使用 instruct 指令控制风格；参数中的 rate/pitch/energy/pause 目前记录在 JSON，尚未全部接入后处理。")
    lines.append("- 当前指标为客观声学与性能指标，未包含 MOS、ASR CER、说话人相似度等主观/自动语义评分。")
    lines.append("- 新增样式数量可通过 `E:\\tts\\tests\\styles.py` 扩展。")

    report = "\n".join(lines) + "\n"
    (OUT_DIR / "REPORT.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
