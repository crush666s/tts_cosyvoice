const api = require('../../utils/api');
const wav = require('../../utils/wav');
const { API_BASE, RECORD, MIN_REFERENCE_SECONDS } = require('../../config');

// 录音必须念这句，服务端在「模仿参考语调」模式下用它和参考音频对齐。
const RECORD_REFERENCE_TEXT = '希望你以后能够做的比我还好呦。';

const MODES = [
  { id: 'record', label: '自然朗读' },
  { id: 'style', label: '导演风格' },
  { id: 'reference', label: '模仿参考语调' }
];

function formatSeconds(total) {
  const s = Math.max(0, Math.floor(total));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: (err) => reject(new Error(err.errMsg || '读取录音失败'))
    });
  });
}

function writeFile(filePath, data) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      success: () => resolve(filePath),
      fail: (err) => reject(new Error(err.errMsg || '写入文件失败'))
    });
  });
}

Page({
  data: {
    modelReady: false,
    statusText: '正在连接模型',

    step: 1,
    phraseMode: 'preset',
    customText: '',

    source: 'record',
    recording: false,
    recSecondsText: '00:00',
    recordedPath: '',
    previewPath: '',
    recHint: '点击麦克风开始录音，照着下面的文字念 5-10 秒',
    recordScript: RECORD_REFERENCE_TEXT,

    presets: [],
    selectedPresetId: '',
    previewingPresetId: '',

    referenceId: '',
    referenceText: '',
    referenceLabel: '未选择',
    referenceNotice: '',
    referenceNoticeType: '',
    referenceUploading: false,

    phrases: [],
    visibleGroups: [],
    phraseQuery: '',
    selectedPhraseId: '',
    selectedPhraseText: '',

    styles: [],
    styleLabels: [],
    styleIndex: 0,
    modes: MODES,
    mode: 'record',

    generating: false,
    generatingText: '生成语音',
    canGenerate: false,
    errorText: '',

    resultUrl: '',
    result: {},
    playingResult: false
  },

  onLoad() {
    this.recorder = wx.getRecorderManager();
    this.recorder.onStop(this.handleRecordStop.bind(this));
    this.recorder.onError((err) => {
      this.stopTimer();
      this.setData({
        recording: false,
        recHint: `录音失败：${err.errMsg || '请检查麦克风权限'}`
      });
    });

    this.player = wx.createInnerAudioContext();
    // iOS 静音键打开时默认不出声，这里关掉，避免生成成功却听不到声音。
    this.player.obeyMuteSwitch = false;
    this.player.onEnded(() => this.resetPlayState());
    this.player.onStop(() => this.resetPlayState());
    this.player.onError((err) => {
      this.setData({ errorText: `播放失败：${(err && err.errMsg) || '未知错误'}` });
      this.resetPlayState();
    });

    this.loadRemote();
  },

  onUnload() {
    this.stopTimer();
    if (this.player) this.player.destroy();
  },

  safeStop() {
    try {
      this.player.stop();
    } catch (err) {
      // 尚未播放过时，真机会报 audioInstance is not set，忽略即可。
    }
  },

  resetPlayState() {
    this.setData({ playingResult: false, previewingPresetId: '' });
  },

  async loadRemote() {
    try {
      const status = await api.getStatus();
      this.setData({
        modelReady: Boolean(status.ready),
        statusText: status.ready ? `模型就绪 · ${status.gpu}` : '模型加载中…'
      });
    } catch (err) {
      this.setData({ statusText: '无法连接服务', errorText: `连接后端失败：${err.message}` });
    }
    this.updateCanGenerate();
    this.loadPhrases();
    this.loadStyles();
    this.loadPresets();
  },

  async loadPhrases() {
    try {
      const data = await api.getPhrases();
      this.phrases = data.items || [];
      this.applyPhraseFilter(this.data.phraseQuery);
    } catch (err) {
      this.setData({ errorText: `语段加载失败：${err.message}` });
    }
  },

  async loadStyles() {
    try {
      const data = await api.getStyles();
      const styles = data.items || [];
      this.setData({
        styles,
        styleLabels: styles.map((item) => item.label),
        styleIndex: 0
      });
    } catch (err) {
      this.setData({ errorText: `风格加载失败：${err.message}` });
    }
  },

  async loadPresets() {
    try {
      const data = await api.getPresets();
      const presets = (data.items || []).map((item) =>
        Object.assign({}, item, { audioUrl: API_BASE + item.audio_url })
      );
      this.setData({ presets });
    } catch (err) {
      // 没有示例音色时仍然可以自己录音，这里不打断主流程。
      this.setData({ presets: [] });
    }
  },

  applyPhraseFilter(query) {
    const keyword = (query || '').trim();
    const groups = [];
    const index = {};
    (this.phrases || []).forEach((item) => {
      if (keyword && item.text.indexOf(keyword) === -1 && item.group.indexOf(keyword) === -1) {
        return;
      }
      if (!index[item.group]) {
        index[item.group] = { name: item.group, items: [] };
        groups.push(index[item.group]);
      }
      index[item.group].items.push(item);
    });
    this.setData({ phraseQuery: query, visibleGroups: groups });
  },

  onSearchInput(event) {
    this.applyPhraseFilter(event.detail.value);
  },

  onSelectPhrase(event) {
    const { id, text } = event.currentTarget.dataset;
    this.setData({
      selectedPhraseId: id,
      selectedPhraseText: text,
      errorText: ''
    });
    this.updateCanGenerate();
  },

  onRecordScriptInput(event) {
    this.setData({ recordScript: event.detail.value });
  },

  onStepChange(event) {
    this.setData({ step: Number(event.currentTarget.dataset.step), errorText: '' });
  },

  onPhraseMode(event) {
    this.setData({ phraseMode: event.currentTarget.dataset.mode, errorText: '' });
    this.updateCanGenerate();
  },

  onCustomTextInput(event) {
    this.setData({ customText: event.detail.value, errorText: '' });
    this.updateCanGenerate();
  },

  onSwitchSource(event) {
    this.setData({ source: event.currentTarget.dataset.source, errorText: '' });
  },

  startTimer() {
    this.stopTimer();
    this.recordStartAt = Date.now();
    this.setData({ recSecondsText: '00:00' });
    // 用时间戳差值而不是累加计数，定时器被节流时也不会少算。
    this.timer = setInterval(() => {
      const elapsed = (Date.now() - this.recordStartAt) / 1000;
      this.setData({ recSecondsText: formatSeconds(elapsed) });
    }, 200);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  onToggleRecord() {
    if (this.data.recording) {
      this.recorder.stop();
      return;
    }
    this.setData({
      recording: true,
      recordedPath: '',
      previewPath: '',
      referenceId: '',
      referenceLabel: '未选择',
      referenceNotice: '',
      recHint: '正在录音，再次点击结束',
      errorText: ''
    });
    this.startTimer();
    this.recorder.start(RECORD);
  },

  async handleRecordStop(res) {
    this.stopTimer();
    // 优先用录音 API 返回的毫秒时长，它才是真正落盘的长度。
    const msFromApi = res && typeof res.duration === 'number' ? res.duration : 0;
    const msFallback = this.recordStartAt ? Date.now() - this.recordStartAt : 0;
    const seconds = (msFromApi > 0 ? msFromApi : msFallback) / 1000;
    this.setData({
      recording: false,
      recordedPath: res.tempFilePath,
      previewPath: '',
      recSecondsText: formatSeconds(seconds),
      recHint: `录音完成（${seconds.toFixed(1)} 秒），可以先试听，再设为参考音频`
    });
    // 录音返回的是裸 PCM，播放器放不出来，这里包成 wav 专供试听。
    try {
      const raw = await readFile(res.tempFilePath);
      const wavBuffer = wav.toWav(raw, RECORD.sampleRate, RECORD.numberOfChannels, 16);
      const target = `${wx.env.USER_DATA_PATH}/preview_${Date.now()}.wav`;
      await writeFile(target, wavBuffer);
      this.setData({ previewPath: target });
    } catch (err) {
      this.setData({ recHint: `录音完成（${seconds.toFixed(1)} 秒），试听文件生成失败：${err.message}` });
    }
  },

  onPlayRecording() {
    const src = this.data.previewPath;
    if (!src) {
      this.setData({ recHint: '试听文件还在生成，请稍后再点一次' });
      return;
    }
    this.resetPlayState();
    this.safeStop();
    this.player.src = src;
    this.player.play();
  },

  async onUseRecording() {
    const src = this.data.recordedPath;
    if (!src || this.data.referenceUploading) return;
    this.setData({ referenceUploading: true, recHint: '正在处理并上传录音…' });
    try {
      const raw = await readFile(src);
      const wavBuffer = wav.toWav(raw, RECORD.sampleRate, RECORD.numberOfChannels, 16);
      const target = `${wx.env.USER_DATA_PATH}/reference_${Date.now()}.wav`;
      await writeFile(target, wavBuffer);
      const data = await api.uploadReference(target);
      const warnings = (data.warnings || []).join('；');
      this.setData({
        referenceId: data.reference_id,
        referenceText: this.data.recordScript || RECORD_REFERENCE_TEXT,
        selectedPresetId: '',
        referenceLabel: `我的录音（${data.duration_s} 秒）`,
        referenceNotice: warnings
          ? `参考音频已上传：${warnings}`
          : '参考音频已就绪，可以生成语音。',
        referenceNoticeType: warnings ? 'warn' : '',
        recHint: `参考音频已上传，时长 ${data.duration_s} 秒`
      });
    } catch (err) {
      this.setData({
        referenceNotice: `上传失败：${err.message}`,
        referenceNoticeType: 'error'
      });
    } finally {
      this.setData({ referenceUploading: false });
      this.updateCanGenerate();
    }
  },

  onSelectPreset(event) {
    const id = event.currentTarget.dataset.id;
    const preset = (this.data.presets || []).find((item) => item.id === id);
    if (!preset) return;
    this.setData({
      selectedPresetId: id,
      referenceId: '',
      referenceText: preset.reference_text || RECORD_REFERENCE_TEXT,
      referenceLabel: `示例音色 · ${preset.label}`,
      referenceNotice: `已选择示例音色「${preset.label}」，可以直接生成语音。`,
      referenceNoticeType: '',
      errorText: ''
    });
    this.updateCanGenerate();
  },

  onPreviewPreset(event) {
    const id = event.currentTarget.dataset.id;
    const preset = (this.data.presets || []).find((item) => item.id === id);
    if (!preset) return;
    if (this.data.previewingPresetId === id) {
      this.safeStop();
      this.resetPlayState();
      return;
    }
    this.resetPlayState();
    this.safeStop();
    // 网络音频先落到带扩展名的本地文件再播，真机对无后缀临时文件兼容性差。
    const target = `${wx.env.USER_DATA_PATH}/preset_${preset.id}_${Date.now()}.wav`;
    wx.downloadFile({
      url: preset.audioUrl,
      filePath: target,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.setData({ errorText: `试听失败：HTTP ${res.statusCode}` });
          return;
        }
        this.player.src = target;
        this.player.play();
        this.setData({ previewingPresetId: id });
      },
      fail: (err) => {
        this.setData({ errorText: `试听失败：${(err && err.errMsg) || '网络错误'}` });
      }
    });
  },

  onModeChange(event) {
    this.setData({ mode: event.currentTarget.dataset.id, errorText: '' });
  },

  onStyleChange(event) {
    this.setData({ styleIndex: Number(event.detail.value) });
  },

  updateCanGenerate() {
    const {
      modelReady,
      selectedPhraseId,
      referenceId,
      selectedPresetId,
      generating,
      phraseMode,
      customText
    } = this.data;
    const hasContent =
      phraseMode === 'custom' ? Boolean((customText || '').trim()) : Boolean(selectedPhraseId);
    this.setData({
      canGenerate: Boolean(modelReady && hasContent && (referenceId || selectedPresetId) && !generating)
    });
  },

  async onGenerate() {
    if (!this.data.canGenerate) return;
    const { mode, selectedPhraseId, selectedPresetId, referenceId, styles, styleIndex } = this.data;
    const payload = {
      mode,
      style_id: mode === 'style' && styles[styleIndex] ? styles[styleIndex].id : 'record'
    };
    if (this.data.phraseMode === 'custom') {
      payload.text = (this.data.customText || '').trim();
    } else {
      payload.phrase_id = selectedPhraseId;
    }
    if (selectedPresetId) {
      payload.preset_id = selectedPresetId;
    } else {
      payload.reference_id = referenceId;
    }
    if (mode === 'reference') {
      payload.reference_text =
        this.data.referenceText || this.data.recordScript || RECORD_REFERENCE_TEXT;
    }

    this.setData({ generating: true, generatingText: '生成中，请稍候…', errorText: '', canGenerate: false });
    try {
      const result = await api.synthesize(payload);
      this.setData({
        result,
        resultUrl: API_BASE + result.audio_url,
        playingResult: false
      });
      if (mode === 'reference' && result.duration_s < 1) {
        this.setData({
          errorText: '参考语调模式输出异常，请换用更干净、更长的参考音频，或改用导演风格。'
        });
      }
    } catch (err) {
      this.setData({ errorText: `生成失败：${err.message}` });
    } finally {
      this.setData({ generating: false, generatingText: '生成语音' });
      this.updateCanGenerate();
    }
  },

  onPlayResult() {
    if (!this.data.resultUrl) return;
    if (this.data.playingResult) {
      this.safeStop();
      this.resetPlayState();
      return;
    }
    this.resetPlayState();
    this.safeStop();
    // 真机上直接播带端口、自签证书的 https 音频容易失败，先下载到本地再播。
    const target = `${wx.env.USER_DATA_PATH}/result_${Date.now()}.wav`;
    wx.downloadFile({
      url: this.data.resultUrl,
      filePath: target,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.setData({ errorText: `下载音频失败：HTTP ${res.statusCode}` });
          return;
        }
        this.player.src = target;
        this.player.play();
        this.setData({ playingResult: true });
      },
      fail: (err) => {
        this.setData({ errorText: `下载音频失败：${(err && err.errMsg) || '网络错误'}` });
      }
    });
  },

  onCopyLink() {
    if (!this.data.resultUrl) return;
    wx.setClipboardData({
      data: this.data.resultUrl,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  }
});
