export const MAX_VOICE_RECORD_MS = 15 * 60 * 1000;
export const MIN_VOICE_RECORD_MS = 1000;
export const WAVEFORM_MAX_POINTS = 400;
export const WAVEFORM_MAX_VALUE = 1024;
export const WAVEFORM_SAMPLE_INTERVAL_MS = 40;
export const MAX_WAVEFORM_SAMPLES =
  Math.ceil(MAX_VOICE_RECORD_MS / WAVEFORM_SAMPLE_INTERVAL_MS) + 10;
export const LIVE_WAVEFORM_BARS = 48;
export const PLAYER_WAVEFORM_BARS = 72;

const SUPPORTED_VOICE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

export const isVoiceRecordingSupported = (): boolean =>
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

export const pickSupportedAudioMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return SUPPORTED_VOICE_MIME_TYPES.find((mimeType) => {
    try {
      return MediaRecorder.isTypeSupported(mimeType);
    } catch {
      return false;
    }
  });
};

export const mimeTypeToAudioExt = (mimeType: string): string => {
  const [type] = mimeType.split(';');
  return AUDIO_MIME_EXTENSIONS[type] ?? 'webm';
};

export const getVoiceMessageFileName = (mimeType: string, date: Date = new Date()): string => {
  const day = date.toISOString().slice(0, 10);
  return `Voice message ${day}.${mimeTypeToAudioExt(mimeType)}`;
};

export const computeRms = (samples: Uint8Array): number => {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
};

export const downsampleWaveform = (
  peaks: number[],
  maxPoints: number = WAVEFORM_MAX_POINTS
): number[] => {
  if (peaks.length === 0 || maxPoints <= 0) return [];
  const pointCount = Math.min(peaks.length, maxPoints);
  const blockSize = peaks.length / pointCount;
  const result: number[] = [];
  for (let i = 0; i < pointCount; i += 1) {
    const start = Math.floor(i * blockSize);
    const end = Math.max(start + 1, Math.min(Math.floor((i + 1) * blockSize), peaks.length));
    let max = 0;
    for (let j = start; j < end; j += 1) {
      if (peaks[j] > max) max = peaks[j];
    }
    result.push(max);
  }
  const maxPeak = Math.max(...result);
  const scale = maxPeak > 0 ? WAVEFORM_MAX_VALUE / maxPeak : 1;
  return result.map((peak) => Math.min(WAVEFORM_MAX_VALUE, Math.round(peak * scale)));
};

export const waveformToAmplitudes = (waveform: number[], maxPoints: number): number[] =>
  downsampleWaveform(waveform, maxPoints).map((peak) => peak / WAVEFORM_MAX_VALUE);
