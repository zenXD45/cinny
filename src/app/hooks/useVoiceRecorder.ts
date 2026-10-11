import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LIVE_WAVEFORM_BARS,
  MAX_WAVEFORM_SAMPLES,
  MAX_VOICE_RECORD_MS,
  WAVEFORM_SAMPLE_INTERVAL_MS,
  computeRms,
  downsampleWaveform,
  pickSupportedAudioMimeType,
} from '../utils/voice';

export enum VoiceRecorderStatus {
  Idle = 'Idle',
  Requesting = 'Requesting',
  Recording = 'Recording',
  Ready = 'Ready',
  Error = 'Error',
}

export type VoiceRecording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  waveform: number[];
};

export type VoiceRecorder = {
  status: VoiceRecorderStatus;
  errorMessage?: string;
  durationMs: number;
  liveWaveform: number[];
  paused: boolean;
  recording?: VoiceRecording;
  start: () => Promise<void>;
  stop: () => Promise<VoiceRecording | undefined>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  reset: () => void;
};

const CLOCK_INTERVAL_MS = 100;

export const useVoiceRecorder = (): VoiceRecorder => {
  const [status, setStatus] = useState(VoiceRecorderStatus.Idle);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [durationMs, setDurationMs] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);
  const [paused, setPaused] = useState(false);
  const [recording, setRecording] = useState<VoiceRecording>();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peaksRef = useRef<number[]>([]);
  const elapsedMsRef = useRef(0);
  const lastTickRef = useRef(0);
  const finishedRef = useRef(false);
  const sampleTimerRef = useRef<number>();
  const clockTimerRef = useRef<number>();
  const discardRef = useRef(false);
  const pausedRef = useRef(false);
  const mimeTypeRef = useRef('audio/webm');
  const statusRef = useRef(VoiceRecorderStatus.Idle);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const stopResolveRef = useRef<((rec: VoiceRecording | undefined) => void) | null>(null);

  const updateStatus = useCallback((next: VoiceRecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (sampleTimerRef.current !== undefined) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = undefined;
    }
    if (clockTimerRef.current !== undefined) {
      window.clearInterval(clockTimerRef.current);
      clockTimerRef.current = undefined;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const closeAudioContext = useCallback(() => {
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const cleanupMedia = useCallback(() => {
    clearTimers();
    stopStream();
    closeAudioContext();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    peaksRef.current = [];
    pausedRef.current = false;
  }, [clearTimers, stopStream, closeAudioContext]);

  const reset = useCallback(() => {
    sessionRef.current += 1;
    setRecording(undefined);
    setDurationMs(0);
    setLiveWaveform([]);
    setErrorMessage(undefined);
    setPaused(false);
    elapsedMsRef.current = 0;
    updateStatus(VoiceRecorderStatus.Idle);
    cleanupMedia();
  }, [cleanupMedia, updateStatus]);

  const stopRecorder = useCallback(
    (discard: boolean) => {
      discardRef.current = discard;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        return;
      }
      if (discard) {
        updateStatus(VoiceRecorderStatus.Idle);
        setDurationMs(0);
        setLiveWaveform([]);
        setPaused(false);
      }
      cleanupMedia();
    },
    [cleanupMedia, updateStatus]
  );

  const start = useCallback(async () => {
    if (
      statusRef.current === VoiceRecorderStatus.Requesting ||
      statusRef.current === VoiceRecorderStatus.Recording
    ) {
      return;
    }

    const session = sessionRef.current + 1;
    sessionRef.current = session;

    setErrorMessage(undefined);
    setRecording(undefined);
    setDurationMs(0);
    setLiveWaveform([]);
    setPaused(false);
    updateStatus(VoiceRecorderStatus.Requesting);

    const mimeType = pickSupportedAudioMimeType();
    if (!mimeType) {
      updateStatus(VoiceRecorderStatus.Error);
      setErrorMessage('Audio recording is not supported on this device.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (!mountedRef.current || sessionRef.current !== session) return;
      updateStatus(VoiceRecorderStatus.Error);
      setErrorMessage('Microphone permission was denied or no microphone was found.');
      return;
    }

    if (!mountedRef.current || sessionRef.current !== session) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      if (!mountedRef.current || sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        audioContext.close().catch(() => undefined);
        return;
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      peaksRef.current = [];
      discardRef.current = false;
      pausedRef.current = false;
      finishedRef.current = false;
      elapsedMsRef.current = 0;
      lastTickRef.current = performance.now();
      mimeTypeRef.current = mimeType;
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunksRef.current.push(evt.data);
        }
      };

      mediaRecorder.onstop = () => {
        const discard = discardRef.current;
        const resolveStop = stopResolveRef.current;
        stopResolveRef.current = null;
        const elapsed = Math.round(elapsedMsRef.current);
        const mimeTypeUsed = mimeTypeRef.current;
        const peaks = peaksRef.current;
        const chunks = chunksRef.current;
        cleanupMedia();
        if (discard) {
          resolveStop?.(undefined);
          if (!mountedRef.current) return;
          updateStatus(VoiceRecorderStatus.Idle);
          setDurationMs(0);
          setLiveWaveform([]);
          setPaused(false);
          return;
        }
        if (!mountedRef.current || sessionRef.current !== session) {
          resolveStop?.(undefined);
          return;
        }
        const blob = new Blob(chunks, { type: mimeTypeUsed });
        const finishedRecording: VoiceRecording = {
          blob,
          mimeType: mimeTypeUsed,
          durationMs: elapsed,
          waveform: downsampleWaveform(peaks),
        };
        setRecording(finishedRecording);
        setDurationMs(elapsed);
        setLiveWaveform([]);
        setPaused(false);
        updateStatus(VoiceRecorderStatus.Ready);
        resolveStop?.(finishedRecording);
      };

      const sampleBuffer = new Uint8Array(analyser.fftSize);
      sampleTimerRef.current = window.setInterval(() => {
        if (pausedRef.current || finishedRef.current) return;
        if (!analyserRef.current || peaksRef.current.length >= MAX_WAVEFORM_SAMPLES) return;
        analyserRef.current.getByteTimeDomainData(sampleBuffer);
        peaksRef.current.push(Math.min(1, computeRms(sampleBuffer)));
      }, WAVEFORM_SAMPLE_INTERVAL_MS);

      clockTimerRef.current = window.setInterval(() => {
        if (pausedRef.current || finishedRef.current) return;
        const now = performance.now();
        elapsedMsRef.current += now - lastTickRef.current;
        lastTickRef.current = now;
        setDurationMs(Math.round(elapsedMsRef.current));
        setLiveWaveform(peaksRef.current.slice(-LIVE_WAVEFORM_BARS));
        if (elapsedMsRef.current >= MAX_VOICE_RECORD_MS) {
          finishedRef.current = true;
          stopRecorder(false);
        }
      }, CLOCK_INTERVAL_MS);

      mediaRecorder.start();
      updateStatus(VoiceRecorderStatus.Recording);
    } catch {
      cleanupMedia();
      if (!mountedRef.current || sessionRef.current !== session) return;
      updateStatus(VoiceRecorderStatus.Error);
      setErrorMessage('Failed to start audio recording.');
    }
  }, [cleanupMedia, stopRecorder, updateStatus]);

  const stop = useCallback(
    () =>
      new Promise<VoiceRecording | undefined>((resolve) => {
        if (statusRef.current !== VoiceRecorderStatus.Recording) {
          resolve(undefined);
          return;
        }
        finishedRef.current = true;
        if (!pausedRef.current) {
          elapsedMsRef.current += performance.now() - lastTickRef.current;
          lastTickRef.current = performance.now();
        }
        setDurationMs(Math.round(elapsedMsRef.current));
        stopResolveRef.current = resolve;
        stopRecorder(false);
      }),
    [stopRecorder]
  );

  const pause = useCallback(() => {
    if (statusRef.current !== VoiceRecorderStatus.Recording || pausedRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
    }
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== VoiceRecorderStatus.Recording || !pausedRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
    }
    pausedRef.current = false;
    lastTickRef.current = performance.now();
    setPaused(false);
  }, []);

  const cancel = useCallback(() => {
    if (
      statusRef.current !== VoiceRecorderStatus.Recording &&
      statusRef.current !== VoiceRecorderStatus.Ready &&
      statusRef.current !== VoiceRecorderStatus.Requesting
    ) {
      return;
    }
    sessionRef.current += 1;
    const resolveStop = stopResolveRef.current;
    stopResolveRef.current = null;
    resolveStop?.(undefined);
    stopRecorder(true);
    if (statusRef.current !== VoiceRecorderStatus.Recording) {
      updateStatus(VoiceRecorderStatus.Idle);
      setDurationMs(0);
      setLiveWaveform([]);
      setPaused(false);
      cleanupMedia();
    }
  }, [stopRecorder, cleanupMedia, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      discardRef.current = true;
      const resolveStop = stopResolveRef.current;
      stopResolveRef.current = null;
      resolveStop?.(undefined);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          cleanupMedia();
        }
      } else {
        cleanupMedia();
      }
    };
  }, [cleanupMedia]);

  return {
    status,
    errorMessage,
    durationMs,
    liveWaveform,
    paused,
    recording,
    start,
    stop,
    pause,
    resume,
    cancel,
    reset,
  };
};
