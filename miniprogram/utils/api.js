const { API_BASE } = require('../config');

function pickError(res) {
  if (res && res.data && res.data.detail) return res.data.detail;
  return `HTTP ${res && res.statusCode}`;
}

// wx.request 的 promise 包装。生成一次语音要几秒，超时给得比较宽。
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method: options.method || 'GET',
      data: options.data,
      header: Object.assign({ 'content-type': 'application/json' }, options.header),
      timeout: options.timeout || 120000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(pickError(res)));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

// 参考音频用 multipart 上传，字段名跟服务端 UploadFile 的 file 对齐。
function uploadReference(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: API_BASE + '/api/reference',
      filePath,
      name: 'file',
      timeout: 120000,
      success(res) {
        let data = res.data;
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          reject(new Error('服务端返回格式异常'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(pickError({ statusCode: res.statusCode, data })));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'));
      }
    });
  });
}

module.exports = {
  API_BASE,
  request,
  uploadReference,
  getStatus: () => request('/api/status'),
  getPhrases: () => request('/api/phrases'),
  getStyles: () => request('/api/styles'),
  getPresets: () => request('/api/presets'),
  synthesize: (payload) => request('/api/synthesize', { method: 'POST', data: payload })
};
