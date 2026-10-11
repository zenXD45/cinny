import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const RelativeBase = style([
  DefaultReset,
  {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
]);

export const AbsoluteContainer = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
]);

export const AbsoluteFooter = style([
  DefaultReset,
  {
    position: 'absolute',
    pointerEvents: 'none',
    bottom: config.space.S100,
    left: config.space.S100,
    right: config.space.S100,
  },
]);

export const Blur = style([
  DefaultReset,
  {
    filter: 'blur(44px)',
  },
]);

export const WaveformTrack = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'Center',
    gap: config.space.S100,
    width: '100%',
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
  },
]);

export const WaveformBarActive = style([
  WaveformBar,
  {
    backgroundColor: color.Primary.Container,
  },
]);
