import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialStabilizerState,
  updateStabilizer,
  applyStabilizationOffset,
} from './stabilization';
import { CropRect } from '../types/camera';

test('createInitialStabilizerState returns zeroed state', () => {
  const init = createInitialStabilizerState();
  assert.equal(init.offsetX, 0);
  assert.equal(init.offsetY, 0);
  assert.equal(init.velocityDx, 0);
  assert.equal(init.velocityDy, 0);
});

test('updateStabilizer dampens sudden frame jitter', () => {
  const state0 = createInitialStabilizerState();

  // Sudden high-frequency camera shake: +20px displacement
  const result = updateStabilizer(state0, 20, -15, 0.85, 30);

  // Compensation should counteract the positive shake in the opposite direction
  assert.ok(result.compensationX < 0, 'Compensation X should be negative to counteract positive shake');
  assert.ok(result.compensationY > 0, 'Compensation Y should be positive to counteract negative shake');
  assert.ok(Math.abs(result.compensationX) > 10, 'Should significantly counteract sudden 20px shake');
  assert.ok(result.nextState.offsetX > 0, 'Smoothed tracking offset should begin following trajectory');
});

test('updateStabilizer clamps compensation to maxMargin', () => {
  const state0 = createInitialStabilizerState();
  // Extreme violent shake: 150px
  const result = updateStabilizer(state0, 150, -150, 0.85, 25);

  assert.equal(result.compensationX, -25, 'Compensation X should be clamped to -maxMargin');
  assert.equal(result.compensationY, 25, 'Compensation Y should be clamped to +maxMargin');
});

test('applyStabilizationOffset keeps crop within source bounds', () => {
  const baseCrop: CropRect = {
    sx: 100,
    sy: 200,
    sWidth: 1080,
    sHeight: 1500,
    dWidth: 1080,
    dHeight: 1920,
  };

  // Normal safe compensation
  const stabilized = applyStabilizationOffset(baseCrop, 15, -20, 1920, 1920);
  assert.equal(stabilized.sx, 115);
  assert.equal(stabilized.sy, 180);

  // Extreme compensation beyond boundary (sx - 200 would be < 0)
  const clampedLow = applyStabilizationOffset(baseCrop, -200, 0, 1920, 1920);
  assert.equal(clampedLow.sx, 0, 'Crop sx must not go negative');

  // Extreme compensation beyond max boundary
  const clampedHigh = applyStabilizationOffset(baseCrop, 2000, 0, 1920, 1920);
  assert.equal(clampedHigh.sx, 1920 - 1080, 'Crop sx must not exceed srcWidth - sWidth');
});
