const els = {
  recordButton: document.getElementById("recordButton"),
  recTime: document.getElementById("recTime"),
  waveform: document.getElementById("waveform"),
  recStatus: document.getElementById("recStatus"),
  micDevice: document.getElementById("micDevice"),
  refText: document.getElementById("refText"),
  uploadButton: document.getElementById("uploadButton"),
  previewArea: document.getElementById("previewArea"),
  previewAudio: document.getElementById("previewAudio"),
  readyNote: document.getElementById("readyNote"),
  referenceQuality: document.getElementById("referenceQuality"),
  phraseSearch: document.getElementById("phraseSearch"),
  phraseList: document.getElementById("phraseList"),
  modeSwitch: document.getElementById("modeSwitch"),
  styleRow: document.getElementById("styleRow"),
  referenceHint: document.getElementById("referenceHint"),
  styleSelect: document.getElementById("styleSelect"),
  selectedPhrase: document.getElementById("selectedPhrase"),
  generateButton: document.getElementById("generateButton"),
  progressNote: document.getElementById("progressNote"),
  resultArea: document.getElementById("resultArea"),
  resultAudio: document.getElementById("resultAudio"),
  metricGrid: document.getElementById("metricGrid"),
  modelStatus: document.getElementById("modelStatus"),
};

let phrases = [];
let styles = [];
let selectedPhraseId = null;
let selectedReferenceId = null;
let pendingBlob = null;
let mode = "record";
let mediaRecorder = null;
let activeStream = null;
let audioContext = null;
let analyser = null;
let recordAnimation = null;
let recording = false;
let mediaChunks = [];
let modelReady = false;
let recordStart = 0;
let recordTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  loadAudioDevices();
  await Promise.all([loadPhrases(), loadStyles()]);
  pollStatus();
}

function bindEvents() {
  els.recordButton.addEventListener("click", toggleRecording);
  els.micDevice.addEventListener("change", () => {
    if (recording) {
      stopRecording();
      els.recStatus.textContent = "输入设备已切换，请重新开始录音";
    }
  });
  els.uploadButton.addEventListener("click", uploadReference);
  els.phraseSearch.addEventListener("input", renderPhrases);
  els.modeSwitch.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  els.generateButton.addEventListener("click", generateSpeech);
}

async function loadAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((device) => device.kind === "audioinput");
    if (!mics.some((device) => device.label)) {
      els.micDevice.innerHTML = `<option value="">浏览器默认设备</option>`;
      return;
    }
    const current = els.micDevice.value;
    const options = mics.map(
      (device) => `<option value="${device.deviceId}">${device.label || "麦克风 " + (mics.indexOf(device) + 1)}</option>`
    );
    els.micDevice.innerHTML = `<option value="">浏览器默认设备</option>` + options.join("");
    if (current) els.micDevice.value = current;
  } catch (error) {
    console.warn("cannot enumerate audio devices", error);
  }
}

async function loadPhrases() {
  const res = await fetch("/api/phrases");
  const data = await res.json();
  phrases = data.items;
  renderPhrases();
}

async function loadStyles() {
  const res = await fetch("/api/styles");
  const data = await res.json();
  styles = data.items;
  els.styleSelect.innerHTML = styles
    .map((item) => `<option value="${item.id}">${item.label}</option>`)
    .join("");
}

function setMode(value) {
  mode = value;
  els.modeSwitch.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === value);
  });
  els.styleRow.hidden = value !== "style";
  els.referenceHint.hidden = value !== "reference";
  updateGenerateButton();
}

function renderPhrases() {
  const keyword = els.phraseSearch.value.trim().toLowerCase();
  const groups = {};
  for (const item of phrases) {
    const haystack = `${item.group} ${item.text}`.toLowerCase();
    if (keyword && !haystack.includes(keyword)) continue;
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }
  els.phraseList.innerHTML = Object.entries(groups)
    .map(
      ([group, items]) => `
        <div class="phrase-group">
          <h3>${group}</h3>
          <div class="phrase-grid">
            ${items
              .map(
                (item) => `
                <button class="phrase-item${item.id === selectedPhraseId ? " selected" : ""}"
                        data-id="${item.id}" type="button">${escapeHtml(item.text)}</button>
              `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");
  els.phraseList.querySelectorAll(".phrase-item").forEach((btn) => {
    btn.addEventListener("click", () => selectPhrase(btn.dataset.id));
  });
}

function selectPhrase(id) {
  selectedPhraseId = id;
  const item = phrases.find((item) => item.id === id);
  els.selectedPhrase.textContent = item ? item.text : "请先选择一个输出语段";
  els.selectedPhrase.style.color = item ? "#17202a" : "#68727e";
  renderPhrases();
  updateGenerateButton();
}

async function toggleRecording() {
  if (recording) {
    stopRecording();
    return;
  }
  try {
    const constraints = {
      audio: {
        deviceId: els.micDevice.value ? { exact: els.micDevice.value } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: constraints.audio,
    });
    loadAudioDevices();
  } catch (error) {
    els.recStatus.textContent = "无法访问麦克风，请检查浏览器权限";
    return;
  }
  mediaChunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "";
  mediaRecorder = new MediaRecorder(activeStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) mediaChunks.push(event.data);
  };
  mediaRecorder.onstop = handleRecordingStop;
  mediaRecorder.start();
  recording = true;
  els.recordButton.classList.add("recording");
  els.recStatus.textContent = "录音中，再次点击麦克风结束";
  recordStart = Date.now();
  recordTimer = setInterval(updateRecTime, 200);
  initAnalyser();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
  recording = false;
  els.recordButton.classList.remove("recording");
  clearInterval(recordTimer);
  cancelAnimationFrame(recordAnimation);
}

function updateRecTime() {
  const seconds = Math.floor((Date.now() - recordStart) / 1000);
  els.recTime.textContent = `00:${String(seconds).padStart(2, "0")}`;
}

function initAnalyser() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(activeStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  drawWaveform();
}

function drawWaveform() {
  if (!analyser) return;
  const canvas = els.waveform;
  const context = canvas.getContext("2d");
  const buffer = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buffer);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.strokeStyle = "#0f766e";
  context.lineWidth = 2;
  const step = canvas.width / buffer.length;
  for (let i = 0; i < buffer.length; i++) {
    const x = step * i;
    const y = (buffer[i] / 255) * canvas.height;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  updateLiveLevel(buffer);
  recordAnimation = requestAnimationFrame(drawWaveform);
}

function updateLiveLevel(buffer) {
  if (Date.now() % 500 > 460) return;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const value = (buffer[i] - 128) / 128;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / buffer.length);
  if (rms > 0.9) {
    els.recStatus.textContent = "录音中，信号接近满幅，请调低麦克风音量或移远一点";
  } else if (rms > 0.05) {
    els.recStatus.textContent = "录音中，正在检测到声音";
  } else {
    els.recStatus.textContent = "录音中，未检测到明显声音，请检查输入设备";
  }
}

async function handleRecordingStop() {
  const blob = new Blob(mediaChunks, { type: mediaChunks[0] ? mediaChunks[0].type : "audio/webm" });
  try {
    const wavBlob = await blobToWav(blob, 24000);
    pendingBlob = wavBlob;
    const url = URL.createObjectURL(wavBlob);
    els.previewAudio.src = url;
    els.previewArea.hidden = false;
    els.readyNote.hidden = true;
    els.referenceQuality.hidden = true;
    selectedReferenceId = null;
    els.uploadButton.disabled = false;
    els.recStatus.textContent = "录音完成，可试听后设为参考音频";
    const duration = await getWavDuration(wavBlob);
    els.recTime.textContent = `00:${String(Math.round(duration)).padStart(2, "0")}`;
  } catch (error) {
    els.recStatus.textContent = "录音转换失败，请重试";
    console.error(error);
  }
}

async function blobToWav(blob, targetRate = 24000) {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  const mono = resampleToMono(decoded, targetRate);
  await decodeCtx.close();
  return encodeWav(mono, targetRate);
}

function resampleToMono(buffer, targetRate) {
  const source = buffer.getChannelData(0);
  const sourceRate = buffer.sampleRate;
  const length = Math.max(1, Math.ceil((source.length / sourceRate) * targetRate));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = (i / length) * source.length;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, source.length - 1);
    const frac = pos - left;
    output[i] = source[left] * (1 - frac) + source[right] * frac;
  }
  return highPassFilter(output, targetRate, 70);
}

function highPassFilter(samples, sampleRate, cutoff) {
  const omega = 2 * Math.PI * cutoff / sampleRate;
  const alpha = Math.sin(omega) / 2;
  const cosine = Math.cos(omega);
  const b0 = (1 + cosine) / 2;
  const b1 = -(1 + cosine);
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosine;
  const a2 = 1 - alpha;
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function getWavDuration(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const view = new DataView(reader.result);
      const sampleRate = view.getUint32(24, true);
      const dataSize = view.getUint32(40, true);
      resolve(dataSize / 2 / sampleRate);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

async function uploadReference() {
  if (!pendingBlob) return;
  const form = new FormData();
  form.append("file", pendingBlob, "reference.wav");
  els.uploadButton.disabled = true;
  els.recStatus.textContent = "正在上传参考音频…";
  try {
    const res = await fetch("/api/reference", { method: "POST", body: form });
    const data = await res.json();
    selectedReferenceId = data.reference_id;
    els.readyNote.hidden = false;
    const qualityText = data.warnings && data.warnings.length
      ? data.warnings.join("<br>")
      : "";
    els.referenceQuality.innerHTML = qualityText;
    els.referenceQuality.hidden = !qualityText;
    els.recStatus.textContent = `参考音频已上传，时长 ${data.duration_s} 秒`;
  } catch (error) {
    els.recStatus.textContent = "上传失败，请重试";
  } finally {
    els.uploadButton.disabled = false;
  }
  updateGenerateButton();
}

function updateGenerateButton() {
  els.generateButton.disabled = !selectedReferenceId || !selectedPhraseId || !modelReady;
}

async function generateSpeech() {
  if (!selectedReferenceId || !selectedPhraseId) return;
  const phrase = phrases.find((item) => item.id === selectedPhraseId);
  if (!phrase) return;
  const payload = {
    reference_id: selectedReferenceId,
    phrase_id: selectedPhraseId,
    mode,
    reference_text: els.refText.value.trim() || "希望你以后能够做的比我还好呦。",
  };
  if (mode === "style") payload.style_id = els.styleSelect.value;
  els.progressNote.hidden = false;
  els.resultArea.hidden = true;
  els.generateButton.disabled = true;
  try {
    const res = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    els.resultAudio.src = `${data.audio_url}?t=${Date.now()}`;
    els.resultArea.hidden = false;
    renderMetrics(data);
  } catch (error) {
    let message = error.message;
    try {
      const parsed = JSON.parse(error.message);
      message = parsed.detail || message;
    } catch (_) {}
    els.progressNote.textContent = `生成失败：${message}`;
  } finally {
    els.progressNote.hidden = true;
    updateGenerateButton();
  }
}

function renderMetrics(data) {
  const items = [
    ["生成耗时", `${data.gen_s} 秒`],
    ["RTF", data.rtf],
    ["峰值显存", `${data.peak_vram_mb} MB`],
    ["音频时长", `${data.duration_s} 秒`],
    ["语速特征", `${data.f0_mean_hz ?? "-"} Hz`],
    ["RMS", data.rms],
  ];
  els.metricGrid.innerHTML = items
    .map(([label, value]) => `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    modelReady = Boolean(data.ready && data.cuda);
    els.modelStatus.classList.toggle("ready", modelReady);
    const label = document.querySelector(".status-pill span:last-child");
    label.textContent = modelReady ? `模型就绪 · ${data.gpu}` : "模型加载中…";
    updateGenerateButton();
  } catch (error) {
    els.modelStatus.classList.remove("ready");
    document.querySelector(".status-pill span:last-child").textContent = "服务未连接";
  }
  setTimeout(pollStatus, 5000);
}
