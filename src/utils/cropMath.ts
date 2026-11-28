import { CropRect, VideoQuality, FrameRate } from '../types/camera';

/**
 * Calculates optimal source crop windows for both 9:16 and 16:9 outputs
 * given any arbitrary camera frame dimension.
 */
export function calculateAspectCrops(
  srcWidth: number,
  srcHeight: number,
  zoom: number = 1.0
): {
  portrait: CropRect;
  landscape: CropRect;
} {
  const safeSrcW = Math.max(1, srcWidth);
  const safeSrcH = Math.max(1, srcHeight);
  const safeZoom = Math.max(1.0, Math.min(10.0, zoom));

  // 1. Calculate Portrait (9:16) crop
  const targetPortraitRatio = 9 / 16;
  const currentRatio = safeSrcW / safeSrcH;

  let basePSw = safeSrcW;
  let basePSh = safeSrcH;

  if (currentRatio > targetPortraitRatio) {
    // Source is wider than 9:16, crop width
    basePSw = safeSrcH * targetPortraitRatio;
  } else {
    // Source is taller than 9:16, crop height
    basePSh = safeSrcW / targetPortraitRatio;
  }

  // Apply digital zoom
  const pSw = basePSw / safeZoom;
  const pSh = basePSh / safeZoom;
  const pSx = Math.max(0, Math.min(safeSrcW - pSw, (safeSrcW - pSw) / 2));
  const pSy = Math.max(0, Math.min(safeSrcH - pSh, (safeSrcH - pSh) / 2));

  // 2. Calculate Landscape (16:9) crop
  const targetLandscapeRatio = 16 / 9;
  let baseLSw = safeSrcW;
  let baseLSh = safeSrcH;

  if (currentRatio > targetLandscapeRatio) {
    baseLSw = safeSrcH * targetLandscapeRatio;
  } else {
    baseLSh = safeSrcW / targetLandscapeRatio;
  }

  const lSw = baseLSw / safeZoom;
  const lSh = baseLSh / safeZoom;
  const lSx = Math.max(0, Math.min(safeSrcW - lSw, (safeSrcW - lSw) / 2));
  const lSy = Math.max(0, Math.min(safeSrcH - lSh, (safeSrcH - lSh) / 2));

  // Target output dimensions
  const portraitWidth = 1080;
  const portraitHeight = 1920;
  const landscapeWidth = 1920;
  const landscapeHeight = 1080;

  return {
    portrait: {
      sx: Math.round(pSx),
      sy: Math.round(pSy),
      sWidth: Math.round(pSw),
      sHeight: Math.round(pSh),
      dWidth: portraitWidth,
      dHeight: portraitHeight,
    },
    landscape: {
      sx: Math.round(lSx),
      sy: Math.round(lSy),
      sWidth: Math.round(lSw),
      sHeight: Math.round(lSh),
      dWidth: landscapeWidth,
      dHeight: landscapeHeight,
    },
  };
}

/**
 * Format EV string e.g. "+1.0 EV", "0.0 EV", "-1.5 EV"
 */
export function formatExposure(ev: number): string {
  const rounded = Math.round(ev * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)} EV`;
  if (rounded === 0) return '0.0 EV';
  return `${rounded.toFixed(1)} EV`;
}

/**
 * Returns CSS canvas filter string for live exposure, focus, and white balance
 */
export function calculateCameraFilter(
  exposure: number,
  focusMode: 'auto' | 'manual',
  focusDistance: number,
  whiteBalance: 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent'
): string {
  const filters: string[] = [];

  // Exposure brightness (1.0 at 0 EV, ~1.36 at +1 EV, ~0.73 at -1 EV)
  const brightness = Math.max(0.1, Math.min(3.0, Math.pow(2, exposure * 0.45)));
  filters.push(`brightness(${brightness.toFixed(3)})`);

  // Exposure contrast curve
  if (exposure !== 0) {
    const contrast = Math.max(0.8, Math.min(1.3, 1 + exposure * 0.05));
    filters.push(`contrast(${contrast.toFixed(3)})`);
  }

  // White balance color temperature presets
  switch (whiteBalance) {
    case 'daylight': // 5500K clean daylight
      filters.push('contrast(1.03) saturate(1.05)');
      break;
    case 'cloudy': // 6500K warm golden tone
      filters.push('sepia(0.15) saturate(1.15) hue-rotate(-5deg)');
      break;
    case 'tungsten': // 3200K cool incandescent filter
      filters.push('hue-rotate(200deg) saturate(1.1) brightness(0.96)');
      break;
    case 'fluorescent': // 4000K neutral green compensation
      filters.push('hue-rotate(335deg) saturate(1.02)');
      break;
    case 'auto':
    default:
      break;
  }

  // Simulated optical focus blur when manual focus is pulled away from sharp plane
  if (focusMode === 'manual') {
    // 0.5 is optimal focus plane, deviation introduces lens defocus
    const defocus = Math.abs(focusDistance - 0.5);
    if (defocus > 0.08) {
      const blurPx = ((defocus - 0.08) * 4.5).toFixed(1);
      filters.push(`blur(${blurPx}px)`);
    }
  }

  return filters.join(' ');
}

/**
 * Returns 'none' when camera tuning values are neutral so live hardware <video>
 * elements bypass multi-pass CSS shader compositing and run at zero-copy 60fps.
 */
export function calculateLivePreviewFilter(
  exposure: number,
  focusMode: 'auto' | 'manual',
  focusDistance: number,
  whiteBalance: 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent'
): string {
  const isNeutralFocus = focusMode !== 'manual' || Math.abs(focusDistance - 0.5) <= 0.08;
  if (Math.abs(exposure) < 0.05 && whiteBalance === 'auto' && isNeutralFocus) {
    return 'none';
  }
  return calculateCameraFilter(exposure, focusMode, focusDistance, whiteBalance);
}

/**
 * Calculates the bounding box of the horizontal 16:9 safe zone
 * when viewed inside a vertical 9:16 screen/viewfinder.
 * Returns normalized percentages [0..1] for CSS positioning.
 */
export function calculateLandscapeGuideInPortrait(): {
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
} {
  // If the viewport is 9:16 (aspect ratio 9/16 = 0.5625)
  // A centered 16:9 rectangle spanning full width (width = 1.0)
  // Has height = 1.0 / (16/9) = 9/16 = 0.5625 of width.
  // In terms of screen height (which is 16/9 = 1.777 of width),
  // heightPercent = (9/16) / (16/9) = (9*9) / (16*16) = 81 / 256 ≈ 31.64%
  const widthPercent = 100;
  const leftPercent = 0;
  const heightPercent = (81 / 256) * 100; // ~31.64%
  const topPercent = (100 - heightPercent) / 2; // ~34.18%

  return {
    topPercent,
    heightPercent,
    leftPercent,
    widthPercent,
  };
}

/**
 * Estimate storage and bitrate based on selected quality and fps
 */
export function estimateBitrateAndStorage(
  quality: VideoQuality,
  fps: FrameRate,
  freeStorageBytes: number = 5 * 1024 * 1024 * 1024 // default 5GB
): {
  mbPerMinTotal: number;
  minutesAvailable: number;
  portraitResolution: string;
  landscapeResolution: string;
} {
  let baseBitrateMbps = 15; // 1080p 30fps default
  let pRes = '1080 x 1920';
  let lRes = '1920 x 1080';

  if (quality === '4K') {
    baseBitrateMbps = 45;
    pRes = '2160 x 3840';
    lRes = '3840 x 2160';
  } else if (quality === '720p') {
    baseBitrateMbps = 8;
    pRes = '720 x 1280';
    lRes = '1280 x 720';
  }

  // Adjust for frame rate
  const fpsMultiplier = fps / 30;
  const singleStreamMbps = baseBitrateMbps * fpsMultiplier;
  // Dual recording records TWO simultaneous streams:
  const dualStreamMbps = singleStreamMbps * 2;

  // Convert Mbps to MB/min: (Mbps / 8) * 60
  const mbPerMinTotal = Math.round((dualStreamMbps / 8) * 60);

  // Minutes available based on free storage
  const freeMb = freeStorageBytes / (1024 * 1024);
  const minutesAvailable = Math.max(1, Math.floor(freeMb / Math.max(1, mbPerMinTotal)));

  return {
    mbPerMinTotal,
    minutesAvailable,
    portraitResolution: pRes,
    landscapeResolution: lRes,
  };
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${pad(hrs)}:${pad(remMins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Format bytes to readable string (e.g. 4.2 MB)
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Zero-allocation 60fps crop calculation that mutates caller-owned CropRect objects
 * to avoid per-frame garbage collection inside requestAnimationFrame.
 */
export function calculateAspectCropsInto(
  srcWidth: number,
  srcHeight: number,
  zoom: number,
  outPortrait: CropRect,
  outLandscape: CropRect
): void {
  const safeSrcW = Math.max(1, srcWidth);
  const safeSrcH = Math.max(1, srcHeight);
  const safeZoom = Math.max(1.0, Math.min(10.0, zoom));
  const currentRatio = safeSrcW / safeSrcH;

  const targetPortraitRatio = 9 / 16;
  let basePSw = safeSrcW;
  let basePSh = safeSrcH;
  if (currentRatio > targetPortraitRatio) {
    basePSw = safeSrcH * targetPortraitRatio;
  } else {
    basePSh = safeSrcW / targetPortraitRatio;
  }
  const pSw = basePSw / safeZoom;
  const pSh = basePSh / safeZoom;
  outPortrait.sx = Math.round(Math.max(0, Math.min(safeSrcW - pSw, (safeSrcW - pSw) / 2)));
  outPortrait.sy = Math.round(Math.max(0, Math.min(safeSrcH - pSh, (safeSrcH - pSh) / 2)));
  outPortrait.sWidth = Math.round(pSw);
  outPortrait.sHeight = Math.round(pSh);
  outPortrait.dWidth = 1080;
  outPortrait.dHeight = 1920;

  const targetLandscapeRatio = 16 / 9;
  let baseLSw = safeSrcW;
  let baseLSh = safeSrcH;
  if (currentRatio > targetLandscapeRatio) {
    baseLSw = safeSrcH * targetLandscapeRatio;
  } else {
    baseLSh = safeSrcW / targetLandscapeRatio;
  }
  const lSw = baseLSw / safeZoom;
  const lSh = baseLSh / safeZoom;
  outLandscape.sx = Math.round(Math.max(0, Math.min(safeSrcW - lSw, (safeSrcW - lSw) / 2)));
  outLandscape.sy = Math.round(Math.max(0, Math.min(safeSrcH - lSh, (safeSrcH - lSh) / 2)));
  outLandscape.sWidth = Math.round(lSw);
  outLandscape.sHeight = Math.round(lSh);
  outLandscape.dWidth = 1920;
  outLandscape.dHeight = 1080;
}

/**
 * Computes native full-resolution still photo dimensions from sensor output
 * without artificial downscaling to preview size.
 */
export function calculateFullResolutionPhotoDimensions(
  sensorWidth: number,
  sensorHeight: number,
  zoom: number = 1.0
): {
  portraitWidth: number;
  portraitHeight: number;
  landscapeWidth: number;
  landscapeHeight: number;
} {
  const crops = calculateAspectCrops(sensorWidth, sensorHeight, zoom);
  return {
    portraitWidth: Math.max(1080, crops.portrait.sWidth),
    portraitHeight: Math.max(1920, crops.portrait.sHeight),
    landscapeWidth: Math.max(1920, crops.landscape.sWidth),
    landscapeHeight: Math.max(1080, crops.landscape.sHeight),
  };
}
