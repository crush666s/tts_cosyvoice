# CosyVoice TTS 语音风格工作台

基于 CosyVoice 3 的本地语音生成演示项目。用户先录制一段参考音频，再从预置语段中选择要输出的内容，由 CosyVoice 生成语音。

## 功能

- 浏览器录音，自动转成 24kHz 单声道 WAV。
- 50 条预置输出语段，覆盖问候、确认、报警、安抚、操作指导、提问、道歉、状态播报等场景。
- 三种生成模式：
  - 自然朗读：参考音频提供音色，标准自然语调输出。
  - 导演风格：参考音频提供音色，叠加 10 种预置风格。
  - 模仿参考语调：参考音频提供音色与韵律，要求至少 5 秒清晰人声。
- 录音上传前自动裁剪静音并做质量检查。
- 支持麦克风输入设备选择、实时电平提示、70Hz 高通滤波。

## 环境要求

- Windows 10/11
- Python 3.11
- NVIDIA GPU，建议 8GB 以上显存
- 使用 Chrome 或 Edge 访问页面

## 快速开始

在 PowerShell 中从项目根目录执行：

```powershell
.\setup.ps1
.\download_models.ps1
.\start.ps1
```

国内网络下载较慢时：

```powershell
.\setup.ps1 -Mirror
.\download_models.ps1 -Mirror
```

启动完成后访问：

```text
http://127.0.0.1:8000
```

## 手动安装说明

`setup.ps1` 会完成以下工作：

1. 创建 `.venv-cosyvoice311`。
2. 安装 Python 依赖和 CUDA 版 PyTorch。
3. 克隆 CosyVoice 仓库到 `CosyVoice/`。
4. 解压 Matcha-TTS 源码到 `third_party/Matcha-TTS`。
5. 安装 `openai-whisper` 供 CosyVoice 文本前端使用。

`download_models.ps1` 会把模型下载到：

```text
models/CosyVoice3-0.5B
```

## 目录结构

```text
app/
  index.html
  style.css
  app.js
  main.py
  phrases.json
tests/
  metrics.py
  styles.py
  voice_director.py
  run_xtts.py
  run_cosyvoice3.py
  run_director_mock.py
  run_e2e_cosyvoice.py
requirements.txt
setup.ps1
start.ps1
download_models.ps1
```

## 配置环境变量

以下环境变量可覆盖默认路径：

| 变量 | 默认值 |
| --- | --- |
| `TTS_PROJECT_ROOT` | 仓库根目录 |
| `TTS_DATA_DIR` | `app/data` |
| `COSYVOICE_DIR` | `<root>/CosyVoice` |
| `MATCHA_TTS_DIR` | `<root>/third_party/Matcha-TTS` |
| `COSYVOICE_MODEL_DIR` | `<root>/models/CosyVoice3-0.5B` |

## 隐私与录音安全

- 录音和生成音频保存在 `app/data/`，已在 `.gitignore` 中忽略。
- 如果部署到远程服务器，浏览器必须通过 HTTPS 访问才能使用麦克风。
- 请勿上传包含他人身份信息的录音到公开仓库。

## 许可证与第三方组件

- 本项目代码采用 MIT License。
- CosyVoice 模型与代码遵循其自身许可证，商用前请核对 `FunAudioLLM/CosyVoice` 与模型仓库说明。
- Matcha-TTS、whisper、PyTorch、Librosa 等依赖遵循各自许可证。
