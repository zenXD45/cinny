import { useCallback, useEffect, useRef } from 'react';

export const VOICE_HOLD_STICKY_THRESHOLD_MS = 300;

export const useVoiceHold = (onHoldStart: () => void, onHoldRelease: (heldMs: number) => void) => {
  const holdingRef = useRef(false);
  const downAtRef = useRef(0);
  const onHoldStartRef = useRef(onHoldStart);
  const onHoldReleaseRef = useRef(onHoldRelease);
  onHoldStartRef.current = onHoldStart;
  onHoldReleaseRef.current = onHoldRelease;

  useEffect(() => {
    const handleRelease = () => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      onHoldReleaseRef.current(performance.now() - downAtRef.current);
    };
    window.addEventListener('pointerup', handleRelease);
    window.addEventListener('pointercancel', handleRelease);
    window.addEventListener('blur', handleRelease);
    return () => {
      window.removeEventListener('pointerup', handleRelease);
      window.removeEventListener('pointercancel', handleRelease);
      window.removeEventListener('blur', handleRelease);
    };
  }, []);

  const onPointerDown = useCallback(() => {
    holdingRef.current = true;
    downAtRef.current = performance.now();
    onHoldStartRef.current();
  }, []);

  return { onPointerDown };
};
