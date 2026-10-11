import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const recordPulse = keyframes({
  '0%': { opacity: '1' },
  '50%': { opacity: '0.3' },
  '100%': { opacity: '1' },
});

export const VoiceRecorderBar = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'Center',
    gap: config.space.S300,
    padding: `${config.space.S200} ${config.space.S300}`,
  },
]);

export const VoiceRecorderTimer = style({
  minWidth: toRem(80),
  fontVariantNumeric: 'tabular-nums',
});

export const RecordDot = style([
  DefaultReset,
  {
    width: toRem(10),
    height: toRem(10),
    borderRadius: '50%',
    backgroundColor: color.Critical.Container,
    animation: `${recordPulse} 1.4s ease-in-out infinite`,
  },
]);

export const RecordDotPaused = style([
  RecordDot,
  {
    animation: 'none',
    opacity: '0.45',
  },
]);

export const StopIcon = style([
  DefaultReset,
  {
    width: toRem(10),
    height: toRem(10),
    borderRadius: toRem(2),
    backgroundColor: 'currentColor',
  },
]);

export const Waveform = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'Center',
    gap: config.space.S100,
    flexGrow: 1,
    height: toRem(24),
    overflow: 'hidden',
  },
]);

export const WaveformBar = style([
  DefaultReset,
  {
    flexShrink: 0,
    width: toRem(3),
    minHeight: toRem(3),
    borderRadius: toRem(2),
    backgroundColor: color.Secondary.ContainerLine,
    transition: 'height 100ms linear',
  },
]);

export const VoiceRecorderError = style({
  flexGrow: 1,
});

export const CriticalIcon = style({
  color: color.Critical.Container,
});
