// 微信录音机在部分机型上直接给 PCM 裸数据，服务端要的是带头的 wav。
// 这里既做「PCM -> wav」封装，也做一次探测：已经是 RIFF 就不再包一层。

function isRiff(buffer) {
  if (!buffer || buffer.byteLength < 12) return false;
  const head = new Uint8Array(buffer, 0, 4);
  return head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function pcmToWav(pcm, sampleRate, numChannels, bitDepth) {
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(44 + dataSize);
  out.set(new Uint8Array(header), 0);
  out.set(new Uint8Array(pcm), 44);
  return out.buffer;
}

function toWav(buffer, sampleRate, numChannels, bitDepth) {
  if (isRiff(buffer)) return buffer;
  return pcmToWav(buffer, sampleRate, numChannels, bitDepth || 16);
}

function pcmDuration(buffer, sampleRate, numChannels, bitDepth) {
  const bytesPerFrame = numChannels * ((bitDepth || 16) / 8);
  return buffer.byteLength / (sampleRate * bytesPerFrame);
}

module.exports = { isRiff, toWav, pcmDuration };
