# CosyVoice TTS 语音风格工作台

基于 CosyVoice 3 的本地语音生成演示项目。用户先录制一段参考音频，再从预置语段中选择要输出的内容，由 CosyVoice 生成语音。

## 功能

- 网页端与微信小程序端两套界面，共用同一个后端。
- 录音或直接使用内置示例音色；上传的参考音频会做质量检查（总时长、有效语音占比、基频）。
- 50 条预置输出语段，覆盖问候、确认、报警、安抚、操作指导、提问、道歉、状态播报等场景；小程序端还支持自定义文字。
- 三种生成模式：
  - 自然朗读：参考音频提供音色，标准自然语调输出。
  - 导演风格：参考音频提供音色，叠加 10 种预置风格。
  - 模仿参考语调：参考音频提供音色与韵律，要求至少 5 秒清晰人声。
- 网页端支持麦克风输入设备选择、实时电平提示、70Hz 高通滤波。

## 环境要求

- Windows 10/11（本地）或 Linux（云端，见「部署到云端」）
- Python 3.11
- NVIDIA GPU，建议 12GB 以上显存
- 网页端使用 Chrome 或 Edge 访问

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
  presets/            # 内置示例音色（wav + presets.json）
miniprogram/          # 微信小程序端
  app.js / app.json / app.wxss
  config.js           # 后端地址、录音参数
  pages/index/
  utils/
tests/
  metrics.py
  styles.py
  voice_director.py
  run_xtts.py
  run_cosyvoice3.py
  run_director_mock.py
  run_e2e_cosyvoice.py
  generate_preset_voice.py
requirements.txt
setup.ps1
start.ps1
start_cloud.sh
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

## 微信小程序端

`miniprogram/` 是与网页端共用同一后端的微信小程序：选参考音色 → 选输出内容 → 生成语音，底部三个步骤页签切换。

### 导入项目

1. 安装微信开发者工具。
2. 选择「导入项目」，目录选仓库里的 `miniprogram/`。
3. AppID 填自己的小程序 AppID；没有的话选「测试号」。
4. 打开「详情 → 本地设置」，勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**。

### 配置后端地址

编辑 `miniprogram/config.js` 里的 `API_BASE`，改成自己的服务地址，结尾不要带斜杠：

```js
// 本机调试。注意真机访问不到 127.0.0.1，真机需要改成局域网 IP 或公网地址。
const API_BASE = 'http://127.0.0.1:8000';

// 云端。AutoDL 会把容器内的 6006 映射成 8443。
const API_BASE = 'https://uXXXX-xxxx.<区域>.seetacloud.com:8443';
```

### 使用说明

- **自己录音**：录 5-10 秒清晰人声，并在「录音里念的文字」里如实填写这段录音的内容。这段文字会作为 CosyVoice 零样本克隆的 prompt text，和录音内容对不上会导致输出出现杂音甚至乱码。
- **示例音色**：仓库自带两个童声示例，点「试听」可以先听，点「选择」把它设为参考音色。
- **输出内容**：可选预置语段，也可切到「自定义文字」自己输入。

### 域名限制

- 开发者工具、预览、真机调试：勾选「不校验合法域名」后可以直接连 AutoDL 地址。
- **体验版 / 正式版**：微信要求请求域名必须已备案、使用 443 端口并配置在小程序后台。AutoDL 的 `*.seetacloud.com` 不满足，需要自备已备案域名，或用云函数中转。

## 部署到云端

`start_cloud.sh` 面向 Linux 云主机（AutoDL、阿里云等），服务跑在 `screen` 会话里，默认监听容器内 `6006`。

### 1. 准备实例

- GPU：显存 12GB 以上比较稳妥，本项目在 RTX 4080 SUPER（16GB）上验证过。
- 镜像：带 CUDA 的 PyTorch 镜像，Python 3.11。

### 2. 拉取代码

```bash
cd /root/autodl-tmp
git clone https://github.com/crush666s/tts_cosyvoice.git
cd tts_cosyvoice
```

### 3. 环境与第三方代码

```bash
python3 -m venv /root/autodl-tmp/.venv-cosyvoice311
source /root/autodl-tmp/.venv-cosyvoice311/bin/activate
pip install -r requirements.txt

git clone https://github.com/FunAudioLLM/CosyVoice.git
mkdir -p third_party
git clone https://github.com/shivammehta25/Matcha-TTS.git third_party/Matcha-TTS
```

### 4. 下载模型

```bash
python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='models/CosyVoice3-0.5B')
PY
```

国内网络慢可以先执行 `export HF_ENDPOINT=https://hf-mirror.com`。

### 5. 生成内置示例音色（可选）

```bash
python tests/generate_preset_voice.py
```

会在 `app/presets/` 下生成两个童声示例和 `presets.json`。仓库里已经带了生成好的结果，这一步只在需要重新生成时执行。

### 6. 启动

```bash
chmod +x start_cloud.sh
./start_cloud.sh
```

### 7. 验证

```bash
curl -s localhost:6006/api/status
```

返回 `{"ready":true,"cuda":true,...}` 说明模型加载完成；再访问 `https://<你的公网地址>:8443/api/presets` 应能看到两个示例音色。

## 隐私与录音安全

- 录音和生成音频保存在 `app/data/`，已在 `.gitignore` 中忽略。
- 如果部署到远程服务器，浏览器必须通过 HTTPS 访问才能使用麦克风。
- 请勿上传包含他人身份信息的录音到公开仓库。

## 许可证与第三方组件

- 本项目代码采用 MIT License。
- CosyVoice 模型与代码遵循其自身许可证，商用前请核对 `FunAudioLLM/CosyVoice` 与模型仓库说明。
- Matcha-TTS、whisper、PyTorch、Librosa 等依赖遵循各自许可证。
