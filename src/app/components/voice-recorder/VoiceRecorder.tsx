import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, color, Icon, IconButton, Icons, Spinner, Text } from 'folds';

import {
  useVoiceRecorder,
  VoiceRecording,
  VoiceRecorderStatus,
} from '../../hooks/useVoiceRecorder';
import { millisecondsToMinutesAndSeconds, secondsToMinutesAndSeconds } from '../../utils/common';
import { MIN_VOICE_RECORD_MS } from '../../utils/voice';
import {
  CriticalIcon,
  RecordDot,
  RecordDotPaused,
  StopIcon,
  VoiceRecorderBar as VoiceRecorderBarClass,
  VoiceRecorderError,
  VoiceRecorderTimer,
  Waveform as WaveformClass,
  WaveformBar,
} from './VoiceRecorder.css';

type WaveformBarsProps = {
  peaks: number[];
};
function WaveformBars({ peaks }: WaveformBarsProps) {
  const maxPeak = Math.max(0.15, ...peaks);
  return (
    <div className={WaveformClass} aria-hidden>
      {peaks.map((peak, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className={WaveformBar}
          style={{ height: `${Math.max(12, (peak / maxPeak) * 100)}%` }}
        />
      ))}
    </div>
  );
}

type VoiceRecorderBarProps = {
  onSend: (recording: VoiceRecording) => Promise<void>;
  onCancel: () => void;
  stopControllerRef?: React.MutableRefObject<{ requestStop: () => void } | undefined>;
};
export function VoiceRecorderBar({ onSend, onCancel, stopControllerRef }: VoiceRecorderBarProps) {
  const recorder = useVoiceRecorder();
  const {
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
  } = recorder;
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (!recording) return undefined;
    const url = URL.createObjectURL(recording.blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    const handleTimeUpdate = () => setPreviewTimeMs(Math.round(audio.currentTime * 1000));
    const handleEnded = () => {
      setPreviewPlaying(false);
      setPreviewTimeMs(0);
    };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      URL.revokeObjectURL(url);
      audioRef.current = null;
      setPreviewPlaying(false);
      setPreviewTimeMs(0);
    };
  }, [recording]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleStop = useCallback(async () => {
    if (sending) return;
    await stop();
  }, [stop, sending]);

  useEffect(() => {
    if (!stopControllerRef) return undefined;
    // eslint-disable-next-line no-param-reassign
    stopControllerRef.current = { requestStop: handleStop };
    return () => {
      // eslint-disable-next-line no-param-reassign
      stopControllerRef.current = undefined;
    };
  }, [stopControllerRef, handleStop]);

  const handleTogglePreview = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setPreviewPlaying(true))
        .catch(() => undefined);
    } else {
      audio.pause();
      setPreviewPlaying(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!recording || sending) return;
    setSending(true);
    setSendError(undefined);
    try {
      await onSend(recording);
      onCancel();
    } catch (err: any) {
      setSendError(
        typeof err?.message === 'string' ? err.message : 'Failed to send voice message.'
      );
    } finally {
      setSending(false);
    }
  }, [recording, sending, onSend, onCancel]);

  if (status === VoiceRecorderStatus.Error) {
    return (
      <div className={VoiceRecorderBarClass}>
        <Icon src={Icons.Warning} className={CriticalIcon} />
        <span className={VoiceRecorderError}>
          <Text size="T300" style={{ color: color.Critical.Main }}>
            {errorMessage ?? 'Audio recording failed.'}
          </Text>
        </span>
        <IconButton
          onClick={handleCancel}
          variant="SurfaceVariant"
          size="300"
          radii="300"
          aria-label="Dismiss"
        >
          <Icon src={Icons.Cross} />
        </IconButton>
      </div>
    );
  }

  if (status === VoiceRecorderStatus.Requesting) {
    return (
      <div className={VoiceRecorderBarClass}>
        <Spinner variant="Secondary" size="300" />
        <span className={VoiceRecorderError}>
          <Text size="T300">Preparing microphone...</Text>
        </span>
        <IconButton
          onClick={handleCancel}
          variant="SurfaceVariant"
          size="300"
          radii="300"
          aria-label="Dismiss"
        >
          <Icon src={Icons.Cross} />
        </IconButton>
      </div>
    );
  }

  if (status === VoiceRecorderStatus.Ready && recording) {
    const canSend = durationMs >= MIN_VOICE_RECORD_MS && !sending;
    return (
      <div className={VoiceRecorderBarClass}>
        <IconButton
          onClick={handleCancel}
          variant="SurfaceVariant"
          size="300"
          radii="300"
          disabled={sending}
          aria-label="Discard voice recording"
        >
          <Icon src={Icons.Delete} className={CriticalIcon} />
        </IconButton>
        <IconButton
          onClick={handleTogglePreview}
          variant="Secondary"
          size="300"
          radii="300"
          aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
        >
          <Icon src={previewPlaying ? Icons.Pause : Icons.Play} filled={!previewPlaying} />
        </IconButton>
        <Box alignItems="Center" gap="200">
          <Text as="span" size="B300" className={VoiceRecorderTimer}>
            {`${secondsToMinutesAndSeconds(previewTimeMs / 1000)} / ${secondsToMinutesAndSeconds(
              durationMs / 1000
            )}`}
          </Text>
        </Box>
        <WaveformBars peaks={recording.waveform} />
        {sendError && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {sendError}
          </Text>
        )}
        <IconButton
          onClick={handleSend}
          variant="Primary"
          size="300"
          radii="300"
          disabled={!canSend}
          aria-label="Send voice message"
        >
          {sending ? <Spinner variant="Primary" size="50" /> : <Icon src={Icons.Send} />}
        </IconButton>
      </div>
    );
  }

  return (
    <div className={VoiceRecorderBarClass}>
      <IconButton
        onClick={handleCancel}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        disabled={sending}
        aria-label="Discard voice recording"
      >
        <Icon src={Icons.Delete} className={CriticalIcon} />
      </IconButton>
      <span className={paused ? RecordDotPaused : RecordDot} />
      <Box alignItems="Center" gap="200">
        <Text as="span" size="B300" className={VoiceRecorderTimer}>
          {millisecondsToMinutesAndSeconds(durationMs)}
        </Text>
      </Box>
      <WaveformBars peaks={liveWaveform} />
      {paused && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          Paused
        </Text>
      )}
      <IconButton
        onClick={paused ? resume : pause}
        variant="SurfaceVariant"
        size="300"
        radii="300"
        aria-label={paused ? 'Resume recording' : 'Pause recording'}
      >
        <Icon src={paused ? Icons.Play : Icons.Pause} filled={paused} />
      </IconButton>
      <IconButton
        onClick={handleStop}
        variant="Primary"
        size="300"
        radii="300"
        aria-label="Stop recording"
      >
        <span className={StopIcon} />
      </IconButton>
    </div>
  );
}
