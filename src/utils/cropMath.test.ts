import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAspectCrops,
  calculateAspectCropsInto,
  calculateFullResolutionPhotoDimensions,
  calculateLandscapeGuideInPortrait,
  estimateBitrateAndStorage,
  formatDuration,
  formatBytes,
  formatExposure,
  calculateCameraFilter,
} from './cropMath';

test('calculateAspectCrops creates valid 9:16 and 16:9 crop boxes from vertical sensor', () => {
  // Typical vertical phone feed: 1080w x 1920h (9:16)
  const crops = calculateAspectCrops(1080, 1920);

  // Portrait should take full frame
  assert.equal(crops.portrait.sx, 0);
  assert.equal(crops.portrait.sy, 0);
  assert.equal(crops.portrait.sWidth, 1080);
  assert.equal(crops.portrait.sHeight, 1920);
  assert.equal(crops.portrait.dWidth, 1080);
  assert.equal(crops.portrait.dHeight, 1920);

  // Landscape (16:9) inside vertical feed must be centered horizontally
  // Height = 1080 / (16/9) = 607.5 -> 608
  // sy = (1920 - 608) / 2 = 656
  assert.equal(crops.landscape.sWidth, 1080);
  assert.ok(crops.landscape.sHeight > 600 && crops.landscape.sHeight < 615);
  assert.ok(crops.landscape.sy > 650 && crops.landscape.sy < 660);
  assert.equal(crops.landscape.dWidth, 1920);
  assert.equal(crops.landscape.dHeight, 1080);
});

test('calculateAspectCrops creates valid crops from landscape feed', () => {
  // Typical landscape camera feed: 1920w x 1080h
  const crops = calculateAspectCrops(1920, 1080);

  // Landscape should take full frame
  assert.equal(crops.landscape.sx, 0);
  assert.equal(crops.landscape.sy, 0);
  assert.equal(crops.landscape.sWidth, 1920);
  assert.equal(crops.landscape.sHeight, 1080);

  // Portrait (9:16) inside landscape feed must be center cropped
  // Width = 1080 * (9/16) = 607.5 -> 608
  assert.ok(crops.portrait.sWidth > 600 && crops.portrait.sWidth < 615);
  assert.ok(crops.portrait.sx > 650 && crops.portrait.sx < 660);
});

test('calculateLandscapeGuideInPortrait returns symmetric centered percentages', () => {
  const guide = calculateLandscapeGuideInPortrait();
  assert.equal(guide.widthPercent, 100);
  assert.equal(guide.leftPercent, 0);
  // height ~31.64%, top ~34.18%
  assert.ok(guide.heightPercent > 31 && guide.heightPercent < 32);
  assert.ok(guide.topPercent > 34 && guide.topPercent < 35);
  // top * 2 + height ≈ 100%
  const sum = guide.topPercent * 2 + guide.heightPercent;
  assert.ok(Math.abs(sum - 100) < 0.01);
});

test('estimateBitrateAndStorage computes dual stream bitrate accurately', () => {
  const stats1080p = estimateBitrateAndStorage('1080p', 30, 5 * 1024 * 1024 * 1024);
  // 15 Mbps * 2 = 30 Mbps -> (30 / 8) * 60 = 225 MB/min
  assert.ok(stats1080p.mbPerMinTotal > 200 && stats1080p.mbPerMinTotal < 260);
  assert.ok(stats1080p.minutesAvailable > 15);

  const stats4K = estimateBitrateAndStorage('4K', 60, 5 * 1024 * 1024 * 1024);
  // 4K 60fps should have higher bitrate than 1080p 30fps
  assert.ok(stats4K.mbPerMinTotal > stats1080p.mbPerMinTotal);
});

test('formatDuration formats seconds nicely', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(5), '00:05');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3665), '01:01:05');
});

test('calculateAspectCrops with zoom reduces crop box while preserving aspect ratio', () => {
  // Test 2x zoom on vertical feed 1080x1920
  const crops1x = calculateAspectCrops(1080, 1920, 1.0);
  const crops2x = calculateAspectCrops(1080, 1920, 2.0);

  // Portrait width should be cut in half
  assert.equal(crops2x.portrait.sWidth, crops1x.portrait.sWidth / 2);
  assert.equal(crops2x.portrait.sHeight, crops1x.portrait.sHeight / 2);
  // Centered crop offset
  assert.equal(crops2x.portrait.sx, (1080 - crops2x.portrait.sWidth) / 2);
  assert.equal(crops2x.portrait.sy, (1920 - crops2x.portrait.sHeight) / 2);

  // Landscape crop at 2x should also cut crop dimensions in half
  assert.equal(crops2x.landscape.sWidth, Math.round(crops1x.landscape.sWidth / 2));
  assert.equal(crops2x.landscape.sHeight, Math.round(crops1x.landscape.sHeight / 2));
});

test('formatExposure formats positive, zero, and negative EV values correctly', () => {
  assert.equal(formatExposure(0), '0.0 EV');
  assert.equal(formatExposure(1.5), '+1.5 EV');
  assert.equal(formatExposure(-2.0), '-2.0 EV');
  assert.equal(formatExposure(0.33), '+0.3 EV');
});

test('calculateCameraFilter generates expected filter strings', () => {
  const neutral = calculateCameraFilter(0, 'auto', 0.5, 'auto');
  assert.ok(neutral.includes('brightness(1.000)'));

  const bright = calculateCameraFilter(1.5, 'auto', 0.5, 'auto');
  assert.ok(bright.includes('brightness('));
  assert.ok(bright.includes('contrast('));

  const cloudyWb = calculateCameraFilter(0, 'auto', 0.5, 'cloudy');
  assert.ok(cloudyWb.includes('sepia'));

  const manualDefocus = calculateCameraFilter(0, 'manual', 0.95, 'auto');
  assert.ok(manualDefocus.includes('blur('));
});

test('calculateAspectCropsInto matches calculateAspectCrops with zero allocations', () => {
  const expected = calculateAspectCrops(3840, 2160, 1.5);
  const outPortrait = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
  const outLandscape = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };

  calculateAspectCropsInto(3840, 2160, 1.5, outPortrait, outLandscape);
  assert.deepEqual(outPortrait, expected.portrait);
  assert.deepEqual(outLandscape, expected.landscape);
});

test('calculateFullResolutionPhotoDimensions preserves high sensor resolution without downscaling to preview', () => {
  const dims4K = calculateFullResolutionPhotoDimensions(3840, 2160, 1.0);
  assert.equal(dims4K.landscapeWidth, 3840);
  assert.equal(dims4K.landscapeHeight, 2160);
  assert.ok(dims4K.portraitHeight >= 1920);
  assert.ok(dims4K.portraitWidth >= 1080);

  const dimsLow = calculateFullResolutionPhotoDimensions(640, 480, 1.0);
  assert.equal(dimsLow.portraitWidth, 1080);
  assert.equal(dimsLow.portraitHeight, 1920);
  assert.equal(dimsLow.landscapeWidth, 1920);
  assert.equal(dimsLow.landscapeHeight, 1080);
});
