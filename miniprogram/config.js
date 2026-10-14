// 后端服务地址：部署 CosyVoice 的那台云服务器，结尾不要带斜杠。
//
// 微信体验版/正式版要求请求域名必须已备案并配置在小程序后台，AutoDL 的地址
// 做不到，所以：
//   - 开发者工具 / 预览 / 真机调试：勾选「不校验合法域名」即可正常请求
//   - 体验版：需要换成已备案的 443 域名，或者改走云函数中转
//
// 想在本机先跑通链路（本机 GPU + CosyVoice）就把下面这行换成：
//   const API_BASE = 'http://127.0.0.1:6010';
const API_BASE = 'https://u1039703-u7jk-3a02973e.weste.seetacloud.com:8443';

module.exports = {
  API_BASE,
  // 录制参数。16k 单声道足够做音色参考，体积也小。
  RECORD: {
    duration: 60000,
    sampleRate: 16000,
    numberOfChannels: 1,
    format: 'PCM'
  },
  // 严格模仿参考语调模式要求参考音频不短于 5 秒
  MIN_REFERENCE_SECONDS: 5
};
