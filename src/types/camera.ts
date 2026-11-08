export type LensMode = 'dual' | 'single';
export type CaptureType = 'photo' | 'video';

export type VideoQuality = '4K' | '1080p' | '720p';
export type FrameRate = 24 | 30 | 60;
export type FileFormat = 'mp4' | 'mov' | 'webm';

export interface CameraSettings {
  videoQuality: VideoQuality;
  frameRate: FrameRate;
  fileFormat: FileFormat;
  cameraAssignmentA: 'portrait' | 'landscape'; // Camera A assignment
  flashMode: 'off' | 'on' | 'auto';
  audioEnabled: boolean;
  gridGuides: boolean;
  demoSimulation: boolean; // Useful fallback / demo mode
  digitalStabilization: boolean; // Electronic Image Stabilization (EIS)
}

export interface MediaFile {
  id: string;
  url: string;
  blob?: Blob;
  aspectRatio: '9:16' | '16:9';
  label: string; // 'TikTok / Reels (9:16)' or 'YouTube (16:9)'
  width: number;
  height: number;
  fileSize: number; // in bytes
}

export interface DualCaptureSession {
  id: string;
  createdAt: number;
  type: CaptureType;
  lensMode: LensMode;
  duration?: number; // for video in seconds
  verticalMedia: MediaFile; // 9:16
  horizontalMedia: MediaFile; // 16:9
  thumbnailUrl: string;
  title: string;
}

export interface CropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  dWidth: number;
  dHeight: number;
}

export type FocusMode = 'auto' | 'manual';
export type WhiteBalancePreset = 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent';

export interface AdvancedControlsState {
  zoom: number; // 1.0 to 5.0x
  exposure: number; // -3.0 to +3.0 EV
  focusMode: FocusMode;
  focusDistance: number; // 0.0 (near/macro) to 1.0 (infinity)
  whiteBalance: WhiteBalancePreset;
  focusPeaking: boolean;
  proDrawerOpen: boolean;
  activeControlTab: 'zoom' | 'exposure' | 'focus' | 'wb';
}
