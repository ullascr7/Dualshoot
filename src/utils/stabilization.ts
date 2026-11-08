import { CropRect } from '../types/camera';

export interface StabilizerState {
  offsetX: number;
  offsetY: number;
  velocityDx: number;
  velocityDy: number;
}

export function createInitialStabilizerState(): StabilizerState {
  return {
    offsetX: 0,
    offsetY: 0,
    velocityDx: 0,
    velocityDy: 0,
  };
}

/**
 * Calculates smoothed counter-shake offsets for Electronic Image Stabilization (EIS).
 *
 * @param current Current stabilizer state
 * @param rawShakeX Raw detected/simulated frame displacement X
 * @param rawShakeY Raw detected/simulated frame displacement Y
 * @param smoothing Smoothing factor (0.80 - 0.95 for video damping)
 * @param maxMargin Max pixel displacement allowed within overscan margin
 */
export function updateStabilizer(
  current: StabilizerState,
  rawShakeX: number,
  rawShakeY: number,
  smoothing: number = 0.85,
  maxMargin: number = 35
): {
  nextState: StabilizerState;
  compensationX: number;
  compensationY: number;
} {
  // Low-pass exponential moving average to isolate low-frequency camera intent from high-frequency jitter
  const smoothedX = current.offsetX * smoothing + rawShakeX * (1 - smoothing);
  const smoothedY = current.offsetY * smoothing + rawShakeY * (1 - smoothing);

  // High-frequency jitter to subtract from current frame
  const jitterX = rawShakeX - smoothedX;
  const jitterY = rawShakeY - smoothedY;

  // Counter-displacement clamped to overscan margin
  const compensationX = Math.max(-maxMargin, Math.min(maxMargin, -jitterX));
  const compensationY = Math.max(-maxMargin, Math.min(maxMargin, -jitterY));

  return {
    nextState: {
      offsetX: smoothedX,
      offsetY: smoothedY,
      velocityDx: smoothedX - current.offsetX,
      velocityDy: smoothedY - current.offsetY,
    },
    compensationX,
    compensationY,
  };
}

/**
 * Applies stabilization offsets to a crop rectangle, ensuring it remains safely inside source boundaries.
 */
export function applyStabilizationOffset(
  crop: CropRect,
  compX: number,
  compY: number,
  srcWidth: number,
  srcHeight: number
): CropRect {
  const maxSx = Math.max(0, srcWidth - crop.sWidth);
  const maxSy = Math.max(0, srcHeight - crop.sHeight);

  const adjustedSx = Math.round(Math.max(0, Math.min(maxSx, crop.sx + compX)));
  const adjustedSy = Math.round(Math.max(0, Math.min(maxSy, crop.sy + compY)));

  return {
    ...crop,
    sx: adjustedSx,
    sy: adjustedSy,
  };
}
