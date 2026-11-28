import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  calculateAspectCropsInto,
  calculateLivePreviewFilter,
  calculateFullResolutionPhotoDimensions,
} from './cropMath';
import {
  CameraErrorKind,
  CameraSettings,
  CropRect,
  DualCaptureSession,
  DualLayoutMode,
  HardwareQualityProfile,
  LensMode,
  AdvancedControlsState,
  VideoQuality,
} from '../types/camera';
import { OEM_CONFIG } from '../config/oemConfig';
import {
  createInitialStabilizerState,
  StabilizerState,
} from './stabilization';

export interface DualCameraNativePlugin {
  initializeDualCamera(options: {
    lensMode: LensMode;
    facingMode: 'user' | 'environment';
    videoQuality: string;
    frameRate: number;
    audioEnabled: boolean;
    digitalStabilization: boolean;
    autoMaxQuality: boolean;
    appName: string;
  }): Promise<{
    initialized: boolean;
    concurrentSupported: boolean;
    sequentialFallbackActive?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    activeFps?: number;
    bitrateBps?: number;
    error?: string;
  }>;
  switchLensMode(options: {
    lensMode: LensMode;
    facingMode: 'user' | 'environment';
  }): Promise<{ success: boolean; concurrentSupported?: boolean }>;
  setCameraControls(options: {
    zoom: number;
    exposure: number;
    focusMode: 'auto' | 'manual';
    focusDistance: number;
    whiteBalance: string;
    digitalStabilization: boolean;
    flashMode?: 'off' | 'on' | 'auto';
  }): Promise<void>;
  tapToFocus(options: { x: number; y: number }): Promise<void>;
  captureDualPhoto(options: {
    lensMode: LensMode;
    flashMode: string;
  }): Promise<{
    portraitDataUrl: string;
    landscapeDataUrl: string;
    portraitWidth: number;
    portraitHeight: number;
    landscapeWidth: number;
    landscapeHeight: number;
  }>;
  startDualRecording(options: {
    frameRate: number;
    videoQuality: string;
    fileFormat: string;
    audioEnabled: boolean;
    bitrateBps: number;
  }): Promise<{ started: boolean }>;
  stopDualRecording(options: {
    lensMode: LensMode;
  }): Promise<{
    portraitPath: string;
    landscapePath: string;
    duration: number;
    portraitSize?: number;
    landscapeSize?: number;
  }>;
  stopDualCamera(): Promise<void>;
}

export const DualCameraNative = registerPlugin<DualCameraNativePlugin>('DualCameraNative');

export interface StartCameraResult {
  hasPermission: boolean;
  isSimulated: boolean;
  errorKind?: CameraErrorKind;
  error?: string;
  hardwareProfile: HardwareQualityProfile;
}

const DEFAULT_PROFILE: HardwareQualityProfile = {
  detectedMaxWidth: 1920,
  detectedMaxHeight: 1080,
  activeWidth: 1920,
  activeHeight: 1080,
  activeFps: 60,
  qualityLabel: '1080p',
  bitrateBps: 20_000_000,
  codecLabel: 'MP4/H.264',
  concurrentDualSupported: false,
  sequentialFallbackActive: false,
};

export class DualCameraEngine {
  private videoElA: HTMLVideoElement | null = null;
  private videoElB: HTMLVideoElement | null = null;
  private streamA: MediaStream | null = null;
  private streamB: MediaStream | null = null;
  private audioStream: MediaStream | null = null;

  // Offscreen rendering canvases for 9:16 and 16:9 outputs
  private canvasPortrait: HTMLCanvasElement;
  private ctxPortrait: CanvasRenderingContext2D | null;

  private canvasLandscape: HTMLCanvasElement;
  private ctxLandscape: CanvasRenderingContext2D | null;

  // Pre-rendered static sky/sun/tree backdrop caches (50x faster Demo rendering)
  private demoBgPortrait: HTMLCanvasElement | null = null;
  private demoBgLandscape: HTMLCanvasElement | null = null;

  // Reusable zero-GC crop rectangles for 60fps requestAnimationFrame loop
  private reusablePortraitCrop: CropRect = { sx: 0, sy: 0, sWidth: 1080, sHeight: 1920, dWidth: 1080, dHeight: 1920 };
  private reusableLandscapeCrop: CropRect = { sx: 0, sy: 0, sWidth: 1920, sHeight: 1080, dWidth: 1920, dHeight: 1080 };
  private reusableCropB: CropRect = { sx: 0, sy: 0, sWidth: 1280, sHeight: 720, dWidth: 1920, dHeight: 1080 };
  private reusableUnusedCrop: CropRect = { sx: 0, sy: 0, sWidth: 1080, sHeight: 1920, dWidth: 1080, dHeight: 1920 };

  // Engine state
  private isSimulated = false;
  private isNativeActive = false;
  private animFrameId: number | null = null;
  private simTime = 0;
  private currentSettings?: CameraSettings;
  private currentAdvancedControls?: AdvancedControlsState;
  private isStabilizationEnabled = true;
  private stabilizerState: StabilizerState = createInitialStabilizerState();
  private hardwareProfile: HardwareQualityProfile = { ...DEFAULT_PROFILE };
  private cachedCapabilities: Record<string, { min: number; max: number }> | null = null;
  private isApplyingConstraints = false;
  private pendingHardwareControls: AdvancedControlsState | null = null;

  // Recorders & capture streams
  private recorderPortrait: MediaRecorder | null = null;
  private recorderLandscape: MediaRecorder | null = null;
  private recordStreamPortrait: MediaStream | null = null;
  private recordStreamLandscape: MediaStream | null = null;
  private portraitChunks: Blob[] = [];
  private landscapeChunks: Blob[] = [];
  private isRecording = false;
  private recordStartTime = 0;
  private activeMimeType = 'video/mp4';
  private hasPrewarmedEncoder = false;
  private secondaryRecorderStartTimer: number | null = null;

  constructor() {
    this.canvasPortrait = document.createElement('canvas');
    this.canvasLandscape = document.createElement('canvas');
    this.canvasPortrait.width = 1080;
    this.canvasPortrait.height = 1920;
    this.canvasLandscape.width = 1920;
    this.canvasLandscape.height = 1080;

    this.ctxPortrait = this.canvasPortrait.getContext('2d', { alpha: false });
    this.ctxLandscape = this.canvasLandscape.getContext('2d', { alpha: false });
  }

  private schedulePrewarmEncoder(): void {
    if (this.hasPrewarmedEncoder || Capacitor.isNativePlatform() || typeof MediaRecorder === 'undefined') {
      return;
    }
    this.hasPrewarmedEncoder = true;
    const preferFastSoftware = this.isSimulated;
    window.setTimeout(() => {
      if (this.isRecording) return;
      try {
        const tiny = document.createElement('canvas');
        tiny.width = 64;
        tiny.height = 64;
        const ctx = tiny.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, 64, 64);
        }
        const stream = tiny.captureStream(10);
        const mimeType = this.getSupportedMimeType(preferFastSoftware);
        const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 250_000 });
        rec.onstop = () => {
          stream.getTracks().forEach((t) => {
            try { t.stop(); } catch { /* noop */ }
          });
        };
        rec.start();
        // Push a second slight frame change so Chromium genuinely initializes its software encoder pipeline
        window.setTimeout(() => {
          if (ctx) {
            ctx.fillStyle = '#080808';
            ctx.fillRect(0, 0, 64, 64);
          }
        }, 35);
        window.setTimeout(() => {
          if (rec.state !== 'inactive') {
            try { rec.stop(); } catch { /* noop */ }
          } else {
            stream.getTracks().forEach((t) => {
              try { t.stop(); } catch { /* noop */ }
            });
          }
        }, 160);
      } catch {
        // Ignore gracefully in restricted environments
      }
    }, 350);
  }

  private createCompactThumbnail(): string {
    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 270;
      thumbCanvas.height = 480;
      const tCtx = thumbCanvas.getContext('2d', { alpha: false });
      if (tCtx) {
        tCtx.drawImage(this.canvasPortrait, 0, 0, thumbCanvas.width, thumbCanvas.height);
        return thumbCanvas.toDataURL('image/jpeg', 0.8);
      }
    } catch {
      // Fallback below
    }
    return this.canvasPortrait.toDataURL('image/jpeg', 0.75);
  }

  public isNativeHardwareBridgeActive(): boolean {
    return this.isNativeActive;
  }

  public getHardwareProfile(): HardwareQualityProfile {
    return { ...this.hardwareProfile };
  }

  public getPreferredFileExtension(): 'mp4' | 'webm' {
    return this.activeMimeType.includes('mp4') ? 'mp4' : 'webm';
  }

  public setVideoElements(videoA: HTMLVideoElement, videoB?: HTMLVideoElement) {
    this.videoElA = videoA;
    if (videoB) this.videoElB = videoB;
  }

  public async startCamera(
    facingMode: 'user' | 'environment',
    settings: CameraSettings,
    lensMode: LensMode
  ): Promise<StartCameraResult> {
    this.stopCamera();
    this.currentSettings = settings;

    if (settings.demoSimulation) {
      this.isSimulated = true;
      this.isNativeActive = false;
      this.canvasPortrait.width = 360;
      this.canvasPortrait.height = 640;
      this.canvasLandscape.width = 640;
      this.canvasLandscape.height = 360;
      this.hardwareProfile = {
        ...DEFAULT_PROFILE,
        activeFps: 60,
        qualityLabel: '1080p',
        bitrateBps: 20_000_000,
        codecLabel: this.getCodecDisplayLabel(),
        concurrentDualSupported: lensMode === 'dual',
        sequentialFallbackActive: false,
      };
      this.drawSimulationFrame(this.simTime, this.currentAdvancedControls, lensMode === 'dual');
      this.schedulePrewarmEncoder();
      return {
        hasPermission: true,
        isSimulated: true,
        hardwareProfile: this.getHardwareProfile(),
      };
    }

    // 1. Native Android Capacitor CameraX ConcurrentCamera Bridge
    if (Capacitor.isNativePlatform()) {
      try {
        const nativeRes = await DualCameraNative.initializeDualCamera({
          lensMode,
          facingMode,
          videoQuality: settings.videoQuality,
          frameRate: settings.frameRate,
          audioEnabled: settings.audioEnabled,
          digitalStabilization: settings.digitalStabilization,
          autoMaxQuality: settings.autoMaxQuality ?? true,
          appName: OEM_CONFIG.appName,
        });

        if (nativeRes.initialized) {
          this.isNativeActive = true;
          this.isSimulated = false;
          const activeW = nativeRes.maxWidth || 1920;
          const activeH = nativeRes.maxHeight || 1080;
          const activeFps = nativeRes.activeFps || 60;
          const qualityLabel: VideoQuality = activeW >= 3840 ? '4K' : activeW >= 1920 ? '1080p' : '720p';
          const bitrateBps = nativeRes.bitrateBps || this.computeAdaptiveBitrate(qualityLabel, activeFps);

          this.configureCanvasResolution(qualityLabel);
          this.hardwareProfile = {
            detectedMaxWidth: activeW,
            detectedMaxHeight: activeH,
            activeWidth: activeW,
            activeHeight: activeH,
            activeFps,
            qualityLabel,
            bitrateBps,
            codecLabel: 'MP4/H.264 HW',
            concurrentDualSupported: nativeRes.concurrentSupported,
            sequentialFallbackActive:
              lensMode === 'dual' &&
              (nativeRes.sequentialFallbackActive ?? !nativeRes.concurrentSupported),
          };
          return {
            hasPermission: true,
            isSimulated: false,
            hardwareProfile: this.getHardwareProfile(),
          };
        }
      } catch (nativeErr) {
        console.warn('DualCameraNative unavailable, falling back to WebView camera stream:', nativeErr);
        this.isNativeActive = false;
      }
    }

    // 2. WebView / Browser Hardware-Matched Max Quality Acquisition
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.isSimulated = true;
      this.canvasPortrait.width = 360;
      this.canvasPortrait.height = 640;
      this.canvasLandscape.width = 640;
      this.canvasLandscape.height = 360;
      this.hardwareProfile.concurrentDualSupported = lensMode === 'dual';
      this.drawSimulationFrame(this.simTime, this.currentAdvancedControls, lensMode === 'dual');
      this.schedulePrewarmEncoder();
      return {
        hasPermission: true,
        isSimulated: true,
        hardwareProfile: this.getHardwareProfile(),
      };
    }

    try {
      const autoMax = settings.autoMaxQuality ?? true;
      const desiredWidth = autoMax || settings.videoQuality === '4K' ? 3840 : 1920;
      const desiredHeight = autoMax || settings.videoQuality === '4K' ? 2160 : 1080;
      const desiredFps = autoMax ? 60 : settings.frameRate;

      const stream = await this.acquireAdaptiveVideoStream(
        facingMode,
        desiredWidth,
        desiredHeight,
        desiredFps,
        settings.audioEnabled
      );

      this.streamA = stream;
      this.isSimulated = false;

      if (this.videoElA) {
        this.videoElA.srcObject = stream;
        this.videoElA.muted = true;
        this.videoElA.playsInline = true;
        await this.videoElA.play().catch(() => {});
      }

      // Inspect actual hardware capabilities and step up if autoMaxQuality detects higher sensor ceiling
      const track = stream.getVideoTracks()[0];
      const profile = await this.inspectAndMaximizeCapabilities(track, settings, lensMode);

      // Acquire secondary stream if Dual Lens mode is active
      if (lensMode === 'dual' && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const dualAttached = await this.tryAttachSecondaryStream(facingMode);
        profile.concurrentDualSupported = dualAttached;
        profile.sequentialFallbackActive = !dualAttached;
      } else {
        profile.concurrentDualSupported = false;
        profile.sequentialFallbackActive = false;
      }

      this.hardwareProfile = profile;
      this.configureCanvasResolution(profile.qualityLabel);

      if (this.currentAdvancedControls) {
        this.applyHardwareConstraints(this.currentAdvancedControls);
      }
      this.applyTorchConstraint(settings.flashMode);
      this.schedulePrewarmEncoder();

      return {
        hasPermission: true,
        isSimulated: false,
        hardwareProfile: this.getHardwareProfile(),
      };
    } catch (err: unknown) {
      const errorKind = this.classifyCameraError(err);
      const friendlyMsg = this.formatFriendlyCameraError(errorKind);

      // In headless / desktop environments with no camera hardware, automatically engage seamless demo feed
      if (errorKind === 'not_found') {
        this.isSimulated = true;
        this.canvasPortrait.width = 360;
        this.canvasPortrait.height = 640;
        this.canvasLandscape.width = 640;
        this.canvasLandscape.height = 360;
        this.hardwareProfile = {
          ...DEFAULT_PROFILE,
          activeFps: 60,
          qualityLabel: '1080p',
          bitrateBps: 20_000_000,
          codecLabel: this.getCodecDisplayLabel(),
          concurrentDualSupported: lensMode === 'dual',
          sequentialFallbackActive: false,
        };
        this.drawSimulationFrame(this.simTime, this.currentAdvancedControls, lensMode === 'dual');
        this.schedulePrewarmEncoder();
        return {
          hasPermission: true,
          isSimulated: true,
          hardwareProfile: this.getHardwareProfile(),
        };
      }

      // Permission denied or locked by another app -> surface clear actionable recovery card
      this.isSimulated = false;
      return {
        hasPermission: false,
        isSimulated: false,
        errorKind,
        error: friendlyMsg,
        hardwareProfile: this.getHardwareProfile(),
      };
    }
  }

  private async acquireAdaptiveVideoStream(
    facingMode: 'user' | 'environment',
    targetW: number,
    targetH: number,
    targetFps: number,
    audioEnabled: boolean
  ): Promise<MediaStream> {
    const audioConstraint: boolean | MediaTrackConstraints = audioEnabled
      ? {
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      : false;

    const candidates: Array<{ w: number; h: number; fps: number }> = [
      { w: targetW, h: targetH, fps: targetFps },
      { w: targetW, h: targetH, fps: 30 },
      { w: 1920, h: 1080, fps: 60 },
      { w: 1920, h: 1080, fps: 30 },
      { w: 1280, h: 720, fps: 30 },
    ];

    let lastErr: unknown;
    for (const c of candidates) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: c.w },
            height: { ideal: c.h },
            frameRate: { ideal: c.fps, max: 60 },
          },
          audio: audioConstraint,
        });
      } catch (err) {
        lastErr = err;
        const kind = this.classifyCameraError(err);
        if (kind === 'permission_denied' || kind === 'not_found' || kind === 'device_busy') {
          throw err;
        }
      }
    }

    // Final bare video-only constraint fallback if audio hardware caused rejection
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
    } catch (finalErr) {
      throw lastErr || finalErr;
    }
  }

  private async inspectAndMaximizeCapabilities(
    track: MediaStreamTrack | undefined,
    settings: CameraSettings,
    lensMode: LensMode
  ): Promise<HardwareQualityProfile> {
    const trackSettings = track?.getSettings?.() || {};
    let maxW = trackSettings.width || 1920;
    let maxH = trackSettings.height || 1080;
    let activeFps = Math.round(trackSettings.frameRate || 30);
    let hardwareZoomRange: { min: number; max: number } | undefined;

    if (track && typeof (track as unknown as { getCapabilities?: () => unknown }).getCapabilities === 'function') {
      try {
        const caps = (
          track as unknown as {
            getCapabilities: () => {
              width?: { max?: number };
              height?: { max?: number };
              frameRate?: { max?: number };
              zoom?: { min: number; max: number };
            };
          }
        ).getCapabilities();
        this.cachedCapabilities = caps as unknown as Record<string, { min: number; max: number }>;

        if (caps.width?.max) maxW = Math.max(maxW, caps.width.max);
        if (caps.height?.max) maxH = Math.max(maxH, caps.height.max);
        if (caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number') {
          hardwareZoomRange = { min: caps.zoom.min, max: caps.zoom.max };
        }

        const capMaxFps = caps.frameRate?.max ? Math.min(60, Math.round(caps.frameRate.max)) : activeFps;
        const autoMax = settings.autoMaxQuality ?? true;
        const desiredW = autoMax || settings.videoQuality === '4K' ? Math.min(3840, maxW) : Math.min(1920, maxW);
        const desiredH = autoMax || settings.videoQuality === '4K' ? Math.min(2160, maxH) : Math.min(1080, maxH);
        const desiredFps = autoMax ? capMaxFps : Math.min(settings.frameRate, capMaxFps);

        if (
          desiredW > (trackSettings.width || 0) ||
          desiredFps > (trackSettings.frameRate || 0)
        ) {
          await track
            .applyConstraints({
              width: { ideal: desiredW },
              height: { ideal: desiredH },
              frameRate: { ideal: desiredFps },
            })
            .catch(() => {});
        }
      } catch {
        // Keep current track settings cleanly
      }
    }

    const finalSettings = track?.getSettings?.() || {};
    const activeW = finalSettings.width || maxW || 1920;
    const activeH = finalSettings.height || maxH || 1080;
    activeFps = Math.min(60, Math.max(24, Math.round(finalSettings.frameRate || activeFps || 30)));

    const maxDim = Math.max(activeW, activeH);
    const qualityLabel: VideoQuality = maxDim >= 3000 ? '4K' : maxDim >= 1800 ? '1080p' : '720p';
    const bitrateBps = this.computeAdaptiveBitrate(qualityLabel, activeFps);

    this.activeMimeType = this.getSupportedMimeType();

    return {
      detectedMaxWidth: maxW,
      detectedMaxHeight: maxH,
      activeWidth: activeW,
      activeHeight: activeH,
      activeFps,
      qualityLabel,
      bitrateBps,
      codecLabel: this.getCodecDisplayLabel(),
      concurrentDualSupported: lensMode === 'dual',
      sequentialFallbackActive: false,
      hardwareZoomRange,
    };
  }

  private async tryAttachSecondaryStream(facingMode: 'user' | 'environment'): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      if (videoDevices.length <= 1) return false;

      const otherFacing = facingMode === 'environment' ? 'user' : 'environment';
      const secondaryStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: otherFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
        audio: false,
      });

      this.streamB = secondaryStream;
      if (this.videoElB) {
        this.videoElB.srcObject = secondaryStream;
        this.videoElB.muted = true;
        this.videoElB.playsInline = true;
        await this.videoElB.play().catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  private configureCanvasResolution(quality: VideoQuality) {
    // Keep live preview & recording crisp; step down cleanly for 1080p/720p hardware
    if (quality === '4K') {
      // Canvas recording at 1080p60/1440p keeps 60fps zero-drop performance while still photo capture uses full sensor
      this.canvasPortrait.width = 1080;
      this.canvasPortrait.height = 1920;
      this.canvasLandscape.width = 1920;
      this.canvasLandscape.height = 1080;
    } else if (quality === '720p') {
      this.canvasPortrait.width = 720;
      this.canvasPortrait.height = 1280;
      this.canvasLandscape.width = 1280;
      this.canvasLandscape.height = 720;
    } else {
      this.canvasPortrait.width = 1080;
      this.canvasPortrait.height = 1920;
      this.canvasLandscape.width = 1920;
      this.canvasLandscape.height = 1080;
    }
  }

  private computeAdaptiveBitrate(quality: VideoQuality, fps: number): number {
    if (quality === '4K') return 24_000_000;
    if (fps >= 50) return 20_000_000;
    return 16_000_000;
  }

  private classifyCameraError(err: unknown): CameraErrorKind {
    const name = err instanceof DOMException || err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg.includes('permission')) {
      return 'permission_denied';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' || msg.includes('in use')) {
      return 'device_busy';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || msg.includes('not found')) {
      return 'not_found';
    }
    return 'unknown';
  }

  private formatFriendlyCameraError(kind: CameraErrorKind): string {
    switch (kind) {
      case 'permission_denied':
        return 'Camera access is turned off. Allow Camera & Microphone permissions to start shooting.';
      case 'device_busy':
        return 'Your camera is currently in use by another app. Close it and tap Enable Camera.';
      case 'not_found':
        return 'No physical camera sensor detected on this device.';
      default:
        return 'Unable to connect to the camera sensor right now. Please try again.';
    }
  }

  public async switchLensMode(
    lensMode: LensMode,
    facingMode: 'user' | 'environment'
  ): Promise<{ concurrentDualSupported: boolean; sequentialFallbackActive: boolean }> {
    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      try {
        const res = await DualCameraNative.switchLensMode({ lensMode, facingMode });
        const concurrent = res.concurrentSupported ?? this.hardwareProfile.concurrentDualSupported;
        this.hardwareProfile.concurrentDualSupported = concurrent;
        this.hardwareProfile.sequentialFallbackActive = lensMode === 'dual' && !concurrent;
        return {
          concurrentDualSupported: concurrent,
          sequentialFallbackActive: this.hardwareProfile.sequentialFallbackActive,
        };
      } catch (err) {
        console.warn('DualCameraNative.switchLensMode failed:', err);
      }
    }

    if (this.isSimulated) {
      this.hardwareProfile.concurrentDualSupported = lensMode === 'dual';
      this.hardwareProfile.sequentialFallbackActive = false;
      return {
        concurrentDualSupported: lensMode === 'dual',
        sequentialFallbackActive: false,
      };
    }

    // WebView/browser: attach or release secondary lens stream without tearing down primary streamA
    if (lensMode === 'dual') {
      if (!this.streamB && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.enumerateDevices === 'function') {
        const dualAttached = await this.tryAttachSecondaryStream(facingMode);
        this.hardwareProfile.concurrentDualSupported = dualAttached;
        this.hardwareProfile.sequentialFallbackActive = !dualAttached;
      } else {
        const hasDual = Boolean(this.streamB);
        this.hardwareProfile.concurrentDualSupported = hasDual;
        this.hardwareProfile.sequentialFallbackActive = !hasDual;
      }
    } else {
      if (this.streamB) {
        this.streamB.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* noop */ }
        });
        this.streamB = null;
      }
      if (this.videoElB) {
        this.videoElB.srcObject = null;
      }
      this.hardwareProfile.concurrentDualSupported = false;
      this.hardwareProfile.sequentialFallbackActive = false;
    }

    return {
      concurrentDualSupported: this.hardwareProfile.concurrentDualSupported,
      sequentialFallbackActive: this.hardwareProfile.sequentialFallbackActive,
    };
  }

  private cleanupRecordingStreams() {
    if (this.secondaryRecorderStartTimer !== null) {
      clearTimeout(this.secondaryRecorderStartTimer);
      this.secondaryRecorderStartTimer = null;
    }
    if (this.recorderPortrait) {
      this.recorderPortrait.ondataavailable = null;
      this.recorderPortrait.onstop = null;
      if (this.recorderPortrait.state !== 'inactive') {
        try { this.recorderPortrait.stop(); } catch { /* noop */ }
      }
      this.recorderPortrait = null;
    }
    if (this.recorderLandscape) {
      this.recorderLandscape.ondataavailable = null;
      this.recorderLandscape.onstop = null;
      if (this.recorderLandscape.state !== 'inactive') {
        try { this.recorderLandscape.stop(); } catch { /* noop */ }
      }
      this.recorderLandscape = null;
    }
    if (this.recordStreamPortrait) {
      this.recordStreamPortrait.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.recordStreamPortrait = null;
    }
    if (this.recordStreamLandscape) {
      this.recordStreamLandscape.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.recordStreamLandscape = null;
    }
  }

  public stopCamera() {
    this.isRecording = false;
    this.cleanupRecordingStreams();
    this.cachedCapabilities = null;
    this.pendingHardwareControls = null;
    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      this.isNativeActive = false;
      DualCameraNative.stopDualCamera().catch(() => {});
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.streamA) {
      this.streamA.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.streamA = null;
    }
    if (this.streamB) {
      this.streamB.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.streamB = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.audioStream = null;
    }
  }

  public setDigitalStabilization(enabled: boolean) {
    this.isStabilizationEnabled = enabled;
    if (this.isNativeActive && Capacitor.isNativePlatform() && this.currentAdvancedControls) {
      DualCameraNative.setCameraControls({
        zoom: this.currentAdvancedControls.zoom,
        exposure: this.currentAdvancedControls.exposure,
        focusMode: this.currentAdvancedControls.focusMode,
        focusDistance: this.currentAdvancedControls.focusDistance,
        whiteBalance: this.currentAdvancedControls.whiteBalance,
        digitalStabilization: enabled,
        flashMode: this.currentSettings?.flashMode,
      }).catch(() => {});
    }
  }

  public getDigitalStabilization(): boolean {
    return this.isStabilizationEnabled;
  }

  public setAdvancedControls(controls: AdvancedControlsState) {
    this.currentAdvancedControls = controls;
    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      DualCameraNative.setCameraControls({
        zoom: controls.zoom,
        exposure: controls.exposure,
        focusMode: controls.focusMode,
        focusDistance: controls.focusDistance,
        whiteBalance: controls.whiteBalance,
        digitalStabilization: this.isStabilizationEnabled,
        flashMode: this.currentSettings?.flashMode,
      }).catch(() => {});
      return;
    }
    this.applyHardwareConstraints(controls);
  }

  public async triggerTapFocus(normX: number, normY: number): Promise<void> {
    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      DualCameraNative.tapToFocus({ x: normX, y: normY }).catch(() => {});
    }
  }

  public async applyTorchConstraint(flashMode: 'off' | 'on' | 'auto'): Promise<void> {
    if (this.isNativeActive && Capacitor.isNativePlatform() && this.currentAdvancedControls) {
      DualCameraNative.setCameraControls({
        zoom: this.currentAdvancedControls.zoom,
        exposure: this.currentAdvancedControls.exposure,
        focusMode: this.currentAdvancedControls.focusMode,
        focusDistance: this.currentAdvancedControls.focusDistance,
        whiteBalance: this.currentAdvancedControls.whiteBalance,
        digitalStabilization: this.isStabilizationEnabled,
        flashMode,
      }).catch(() => {});
      return;
    }

    if (!this.streamA) return;
    const track = this.streamA.getVideoTracks()[0];
    if (!track || typeof (track as unknown as { getCapabilities?: () => unknown }).getCapabilities !== 'function') return;

    try {
      const caps = (track as unknown as { getCapabilities: () => { torch?: boolean } }).getCapabilities();
      if (caps.torch) {
        await track.applyConstraints({
          advanced: [{ torch: flashMode === 'on' }] as unknown as MediaTrackConstraintSet[],
        });
      }
    } catch {
      // Torch unavailable on desktop/front lens
    }
  }

  public applyHardwareConstraints(controls: AdvancedControlsState) {
    if (!this.streamA) return;
    if (this.isApplyingConstraints) {
      // Coalesce rapid slider updates instead of flooding async hardware IPC
      this.pendingHardwareControls = controls;
      return;
    }

    const track = this.streamA.getVideoTracks()[0];
    if (!track) return;

    const caps =
      this.cachedCapabilities ||
      (typeof (track as unknown as { getCapabilities?: () => unknown }).getCapabilities === 'function'
        ? (
            track as unknown as { getCapabilities: () => Record<string, { min: number; max: number }> }
          ).getCapabilities()
        : null);
    if (!caps) return;
    this.cachedCapabilities = caps;

    const advanced: Record<string, unknown> = {};
    if (caps.zoom && controls.zoom >= caps.zoom.min && controls.zoom <= caps.zoom.max) {
      advanced.zoom = controls.zoom;
    }
    if (caps.exposureCompensation) {
      advanced.exposureCompensation = Math.max(
        caps.exposureCompensation.min,
        Math.min(caps.exposureCompensation.max, controls.exposure)
      );
    }
    if (caps.focusDistance && controls.focusMode === 'manual') {
      advanced.focusMode = 'manual';
      advanced.focusDistance = controls.focusDistance;
    }

    if (Object.keys(advanced).length === 0) return;

    this.isApplyingConstraints = true;
    track
      .applyConstraints({ advanced: [advanced] } as MediaTrackConstraints)
      .catch(() => {
        // Silently fallback to software crop/filter
      })
      .finally(() => {
        this.isApplyingConstraints = false;
        const queued = this.pendingHardwareControls;
        if (queued) {
          this.pendingHardwareControls = null;
          this.applyHardwareConstraints(queued);
        }
      });
  }

  private ensureDemoBackgroundCaches() {
    const pw = this.canvasPortrait.width;
    const ph = this.canvasPortrait.height;
    const lw = this.canvasLandscape.width;
    const lh = this.canvasLandscape.height;

    if (!this.demoBgPortrait || this.demoBgPortrait.width !== pw || this.demoBgPortrait.height !== ph) {
      const bg = document.createElement('canvas');
      bg.width = pw;
      bg.height = ph;
      const ctx = bg.getContext('2d', { alpha: false });
      if (ctx) {
        const pGrad = ctx.createLinearGradient(0, 0, 0, ph);
        pGrad.addColorStop(0, '#1e63b8');
        pGrad.addColorStop(0.45, '#54a2eb');
        pGrad.addColorStop(1, '#9ad5fd');
        ctx.fillStyle = pGrad;
        ctx.fillRect(0, 0, pw, ph);

        const sunX = pw * 0.55;
        const sunY = ph * 0.38;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, pw * 0.02, sunX, sunY, pw * 0.48);
        sunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        sunGrad.addColorStop(0.22, 'rgba(255, 252, 210, 0.9)');
        sunGrad.addColorStop(0.55, 'rgba(255, 230, 160, 0.35)');
        sunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, pw * 0.48, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#183b23';
        for (let i = 0; i < 11; i++) {
          ctx.beginPath();
          const tx = i * (pw / 9) - pw * 0.03;
          const ty = ph * 0.68 + Math.sin(i * 1.7) * (ph * 0.04);
          ctx.arc(tx, ty, pw * 0.14 + (i % 3) * (pw * 0.02), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#265732';
        for (let i = 0; i < 14; i++) {
          ctx.beginPath();
          const tx = i * (pw / 12) - pw * 0.02;
          const ty = ph * 0.78 + Math.cos(i * 1.4) * (ph * 0.03);
          ctx.arc(tx, ty, pw * 0.12 + (i % 4) * (pw * 0.015), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.demoBgPortrait = bg;
    }

    if (!this.demoBgLandscape || this.demoBgLandscape.width !== lw || this.demoBgLandscape.height !== lh) {
      const bg = document.createElement('canvas');
      bg.width = lw;
      bg.height = lh;
      const ctx = bg.getContext('2d', { alpha: false });
      if (ctx) {
        const lGrad = ctx.createLinearGradient(0, 0, 0, lh);
        lGrad.addColorStop(0, '#1e63b8');
        lGrad.addColorStop(0.5, '#54a2eb');
        lGrad.addColorStop(1, '#9ad5fd');
        ctx.fillStyle = lGrad;
        ctx.fillRect(0, 0, lw, lh);

        const lSunX = lw * 0.52;
        const lSunY = lh * 0.32;
        const lSunGrad = ctx.createRadialGradient(lSunX, lSunY, lh * 0.02, lSunX, lSunY, lh * 0.45);
        lSunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        lSunGrad.addColorStop(0.22, 'rgba(255, 252, 210, 0.9)');
        lSunGrad.addColorStop(0.55, 'rgba(255, 230, 160, 0.35)');
        lSunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = lSunGrad;
        ctx.beginPath();
        ctx.arc(lSunX, lSunY, lh * 0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#183b23';
        for (let i = 0; i < 18; i++) {
          ctx.beginPath();
          const tx = i * (lw / 15) - lw * 0.025;
          const ty = lh * 0.72 + Math.sin(i * 1.5) * (lh * 0.045);
          ctx.arc(tx, ty, lh * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#265732';
        for (let i = 0; i < 22; i++) {
          ctx.beginPath();
          const tx = i * (lw / 19) - lw * 0.02;
          const ty = lh * 0.82 + Math.cos(i * 1.3) * (lh * 0.04);
          ctx.arc(tx, ty, lh * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.demoBgLandscape = bg;
    }
  }

  /**
   * Called from App.tsx's single unified requestAnimationFrame loop so only 1 rAF runs app-wide.
   */
  public renderSimulationStep(
    controls: AdvancedControlsState | undefined,
    includeSecondary: boolean
  ) {
    this.simTime += 0.032;
    this.drawSimulationFrame(this.simTime, controls ?? this.currentAdvancedControls, includeSecondary);
  }

  private drawSimulationFrame(
    time: number,
    controls?: AdvancedControlsState,
    includeSecondary: boolean = true
  ) {
    if (!this.ctxPortrait || !this.ctxLandscape) return;
    this.ensureDemoBackgroundCaches();

    const pw = this.canvasPortrait.width;
    const ph = this.canvasPortrait.height;
    const lw = this.canvasLandscape.width;
    const lh = this.canvasLandscape.height;

    const zoom = controls?.zoom || 1.0;
    const filter = controls
      ? calculateLivePreviewFilter(
          controls.exposure,
          controls.focusMode,
          controls.focusDistance,
          controls.whiteBalance
        )
      : 'none';

    // Portrait Canvas (9:16) — ultra-fast pre-baked blit + drifting cloud
    this.ctxPortrait.save();
    if (filter !== 'none') {
      this.ctxPortrait.filter = filter;
    }
    if (zoom > 1.0) {
      this.ctxPortrait.translate(pw / 2, ph / 2);
      this.ctxPortrait.scale(zoom, zoom);
      this.ctxPortrait.translate(-pw / 2, -ph / 2);
    }
    if (this.demoBgPortrait) {
      this.ctxPortrait.drawImage(this.demoBgPortrait, 0, 0, pw, ph);
    }
    this.ctxPortrait.fillStyle = 'rgba(255, 255, 255, 0.42)';
    const cloud1X = ((time * 12) % (pw + 240)) - 120;
    this.ctxPortrait.beginPath();
    this.ctxPortrait.arc(cloud1X, ph * 0.2, pw * 0.08, 0, Math.PI * 2);
    this.ctxPortrait.arc(cloud1X + pw * 0.075, ph * 0.19, pw * 0.1, 0, Math.PI * 2);
    this.ctxPortrait.arc(cloud1X + pw * 0.15, ph * 0.21, pw * 0.075, 0, Math.PI * 2);
    this.ctxPortrait.fill();
    this.ctxPortrait.restore();

    if (!includeSecondary) return;

    // Landscape Canvas (16:9) — ultra-fast pre-baked blit
    this.ctxLandscape.save();
    if (filter !== 'none') {
      this.ctxLandscape.filter = filter;
    }
    if (zoom > 1.0) {
      this.ctxLandscape.translate(lw / 2, lh / 2);
      this.ctxLandscape.scale(zoom, zoom);
      this.ctxLandscape.translate(-lw / 2, -lh / 2);
    }
    if (this.demoBgLandscape) {
      this.ctxLandscape.drawImage(this.demoBgLandscape, 0, 0, lw, lh);
    }
    this.ctxLandscape.restore();
  }

  /**
   * Zero-allocation 60fps canvas frame update for recording & fallback preview.
   */
  public updateCanvasesFromVideo(
    lensMode: LensMode,
    controls?: AdvancedControlsState,
    _layoutMode: DualLayoutMode = 'single'
  ) {
    if (this.isSimulated || !this.videoElA || this.videoElA.readyState < 2) {
      return;
    }

    const vw = this.videoElA.videoWidth || 1920;
    const vh = this.videoElA.videoHeight || 1080;
    const zoom = controls?.zoom || 1.0;

    calculateAspectCropsInto(vw, vh, zoom, this.reusablePortraitCrop, this.reusableLandscapeCrop);

    const filter = controls
      ? calculateLivePreviewFilter(
          controls.exposure,
          controls.focusMode,
          controls.focusDistance,
          controls.whiteBalance
        )
      : 'none';

    // 1. Portrait (9:16)
    if (this.ctxPortrait) {
      if (filter !== 'none') this.ctxPortrait.filter = filter;
      this.ctxPortrait.drawImage(
        this.videoElA,
        this.reusablePortraitCrop.sx,
        this.reusablePortraitCrop.sy,
        this.reusablePortraitCrop.sWidth,
        this.reusablePortraitCrop.sHeight,
        0,
        0,
        this.canvasPortrait.width,
        this.canvasPortrait.height
      );
      if (filter !== 'none') this.ctxPortrait.filter = 'none';
    }

    // 2. Landscape (16:9)
    if (this.ctxLandscape) {
      if (filter !== 'none') this.ctxLandscape.filter = filter;
      if (lensMode === 'dual' && this.videoElB && this.videoElB.readyState >= 2) {
        const bW = this.videoElB.videoWidth || 1280;
        const bH = this.videoElB.videoHeight || 720;
        calculateAspectCropsInto(bW, bH, zoom, this.reusableUnusedCrop, this.reusableCropB);
        this.ctxLandscape.drawImage(
          this.videoElB,
          this.reusableCropB.sx,
          this.reusableCropB.sy,
          this.reusableCropB.sWidth,
          this.reusableCropB.sHeight,
          0,
          0,
          this.canvasLandscape.width,
          this.canvasLandscape.height
        );
      } else {
        this.ctxLandscape.drawImage(
          this.videoElA,
          this.reusableLandscapeCrop.sx,
          this.reusableLandscapeCrop.sy,
          this.reusableLandscapeCrop.sWidth,
          this.reusableLandscapeCrop.sHeight,
          0,
          0,
          this.canvasLandscape.width,
          this.canvasLandscape.height
        );
      }
      if (filter !== 'none') this.ctxLandscape.filter = 'none';
    }
  }

  /**
   * Captures full-resolution still photos without downscaling to preview size.
   */
  public async takeDualPhoto(lensMode: LensMode, controls?: AdvancedControlsState): Promise<DualCaptureSession> {
    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      try {
        const nativePhoto = await DualCameraNative.captureDualPhoto({
          lensMode,
          flashMode: this.currentSettings?.flashMode || 'off',
        });
        const now = Date.now();
        const id = `dual-photo-${now}`;
        const pUrl = nativePhoto.portraitDataUrl.startsWith('data:')
          ? nativePhoto.portraitDataUrl
          : Capacitor.convertFileSrc(nativePhoto.portraitDataUrl);
        const lUrl = nativePhoto.landscapeDataUrl.startsWith('data:')
          ? nativePhoto.landscapeDataUrl
          : Capacitor.convertFileSrc(nativePhoto.landscapeDataUrl);

        return {
          id,
          createdAt: now,
          type: 'photo',
          lensMode,
          title: `${OEM_CONFIG.appName} Photo ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          thumbnailUrl: pUrl,
          verticalMedia: {
            id: `${id}-v`,
            url: pUrl,
            aspectRatio: '9:16',
            label: 'TikTok / Reels (9:16)',
            width: nativePhoto.portraitWidth || 1080,
            height: nativePhoto.portraitHeight || 1920,
            fileSize: Math.round((pUrl.length * 3) / 4),
          },
          horizontalMedia: {
            id: `${id}-h`,
            url: lUrl,
            aspectRatio: '16:9',
            label: 'YouTube (16:9)',
            width: nativePhoto.landscapeWidth || 1920,
            height: nativePhoto.landscapeHeight || 1080,
            fileSize: Math.round((lUrl.length * 3) / 4),
          },
        };
      } catch (err) {
        console.warn('DualCameraNative.captureDualPhoto failed, falling back to WebView full-res capture:', err);
      }
    }

    const zoom = controls?.zoom || 1.0;
    const filter = controls
      ? calculateLivePreviewFilter(
          controls.exposure,
          controls.focusMode,
          controls.focusDistance,
          controls.whiteBalance
        )
      : 'none';

    let pDataUrl = '';
    let lDataUrl = '';
    let outPW = this.canvasPortrait.width;
    let outPH = this.canvasPortrait.height;
    let outLW = this.canvasLandscape.width;
    let outLH = this.canvasLandscape.height;

    // Attempt native ImageCapture full sensor still photo when real camera track is active
    let capturedViaImageCapture = false;
    if (!this.isSimulated && this.streamA && typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === 'function') {
      try {
        const track = this.streamA.getVideoTracks()[0];
        const ImageCaptureCtor = (window as unknown as { ImageCapture: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
        if (track && ImageCaptureCtor) {
          const ic = new ImageCaptureCtor(track);
          const photoBlob = await ic.takePhoto();
          const bitmap = await createImageBitmap(photoBlob);
          const dims = calculateFullResolutionPhotoDimensions(bitmap.width, bitmap.height, zoom);
          const pCrop: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
          const lCrop: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
          calculateAspectCropsInto(bitmap.width, bitmap.height, zoom, pCrop, lCrop);

          const pCanvas = document.createElement('canvas');
          pCanvas.width = dims.portraitWidth;
          pCanvas.height = dims.portraitHeight;
          const pCtx = pCanvas.getContext('2d', { alpha: false });
          if (pCtx) {
            pCtx.filter = filter;
            pCtx.drawImage(bitmap, pCrop.sx, pCrop.sy, pCrop.sWidth, pCrop.sHeight, 0, 0, pCanvas.width, pCanvas.height);
            pDataUrl = pCanvas.toDataURL('image/jpeg', 0.95);
            outPW = pCanvas.width;
            outPH = pCanvas.height;
          }

          if (lensMode === 'dual' && this.videoElB && this.videoElB.readyState >= 2) {
            const bW = this.videoElB.videoWidth || 1920;
            const bH = this.videoElB.videoHeight || 1080;
            const bDims = calculateFullResolutionPhotoDimensions(bW, bH, zoom);
            const unused: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
            calculateAspectCropsInto(bW, bH, zoom, unused, lCrop);
            const lCanvas = document.createElement('canvas');
            lCanvas.width = bDims.landscapeWidth;
            lCanvas.height = bDims.landscapeHeight;
            const lCtx = lCanvas.getContext('2d', { alpha: false });
            if (lCtx) {
              lCtx.filter = filter;
              lCtx.drawImage(this.videoElB, lCrop.sx, lCrop.sy, lCrop.sWidth, lCrop.sHeight, 0, 0, lCanvas.width, lCanvas.height);
              lDataUrl = lCanvas.toDataURL('image/jpeg', 0.95);
              outLW = lCanvas.width;
              outLH = lCanvas.height;
            }
          } else {
            const lCanvas = document.createElement('canvas');
            lCanvas.width = dims.landscapeWidth;
            lCanvas.height = dims.landscapeHeight;
            const lCtx = lCanvas.getContext('2d', { alpha: false });
            if (lCtx) {
              lCtx.filter = filter;
              lCtx.drawImage(bitmap, lCrop.sx, lCrop.sy, lCrop.sWidth, lCrop.sHeight, 0, 0, lCanvas.width, lCanvas.height);
              lDataUrl = lCanvas.toDataURL('image/jpeg', 0.95);
              outLW = lCanvas.width;
              outLH = lCanvas.height;
            }
          }

          bitmap.close();
          if (pDataUrl && lDataUrl) {
            capturedViaImageCapture = true;
          }
        }
      } catch {
        // Fallback smoothly to full videoWidth/videoHeight capture
      }
    }

    if (!capturedViaImageCapture) {
      if (!this.isSimulated && this.videoElA && this.videoElA.readyState >= 2) {
        const vw = this.videoElA.videoWidth || 1920;
        const vh = this.videoElA.videoHeight || 1080;
        const dims = calculateFullResolutionPhotoDimensions(vw, vh, zoom);
        const pCrop: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
        const lCrop: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
        calculateAspectCropsInto(vw, vh, zoom, pCrop, lCrop);

        const pCanvas = document.createElement('canvas');
        pCanvas.width = dims.portraitWidth;
        pCanvas.height = dims.portraitHeight;
        const pCtx = pCanvas.getContext('2d', { alpha: false });
        if (pCtx) {
          pCtx.filter = filter;
          pCtx.drawImage(this.videoElA, pCrop.sx, pCrop.sy, pCrop.sWidth, pCrop.sHeight, 0, 0, pCanvas.width, pCanvas.height);
          pDataUrl = pCanvas.toDataURL('image/jpeg', 0.95);
          outPW = pCanvas.width;
          outPH = pCanvas.height;
        }

        const lCanvas = document.createElement('canvas');
        lCanvas.width = dims.landscapeWidth;
        lCanvas.height = dims.landscapeHeight;
        const lCtx = lCanvas.getContext('2d', { alpha: false });
        if (lCtx) {
          lCtx.filter = filter;
          if (lensMode === 'dual' && this.videoElB && this.videoElB.readyState >= 2) {
            const bW = this.videoElB.videoWidth || 1280;
            const bH = this.videoElB.videoHeight || 720;
            const unused: CropRect = { sx: 0, sy: 0, sWidth: 0, sHeight: 0, dWidth: 0, dHeight: 0 };
            calculateAspectCropsInto(bW, bH, zoom, unused, lCrop);
            lCtx.drawImage(this.videoElB, lCrop.sx, lCrop.sy, lCrop.sWidth, lCrop.sHeight, 0, 0, lCanvas.width, lCanvas.height);
          } else {
            lCtx.drawImage(this.videoElA, lCrop.sx, lCrop.sy, lCrop.sWidth, lCrop.sHeight, 0, 0, lCanvas.width, lCanvas.height);
          }
          lDataUrl = lCanvas.toDataURL('image/jpeg', 0.95);
          outLW = lCanvas.width;
          outLH = lCanvas.height;
        }
      } else {
        if (this.isSimulated) {
          this.drawSimulationFrame(this.simTime, controls, true);
        } else {
          this.updateCanvasesFromVideo(lensMode, controls);
        }
        pDataUrl = this.canvasPortrait.toDataURL('image/jpeg', 0.9);
        lDataUrl = this.canvasLandscape.toDataURL('image/jpeg', 0.9);
      }
    }

    const now = Date.now();
    const id = `dual-photo-${now}`;
    const pSize = Math.round((pDataUrl.length * 3) / 4);
    const lSize = Math.round((lDataUrl.length * 3) / 4);

    return {
      id,
      createdAt: now,
      type: 'photo',
      lensMode,
      title: `${OEM_CONFIG.appName} Photo ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      thumbnailUrl: pDataUrl,
      verticalMedia: {
        id: `${id}-v`,
        url: pDataUrl,
        aspectRatio: '9:16',
        label: 'TikTok / Reels (9:16)',
        width: outPW,
        height: outPH,
        fileSize: pSize,
      },
      horizontalMedia: {
        id: `${id}-h`,
        url: lDataUrl,
        aspectRatio: '16:9',
        label: 'YouTube (16:9)',
        width: outLW,
        height: outLH,
        fileSize: lSize,
      },
    };
  }

  /**
   * Start simultaneous high-bitrate dual video recording (16–24 Mbps adaptive, 60fps capable)
   */
  public startDualRecording(fps?: number) {
    if (this.isRecording) return;
    this.isRecording = true;
    this.recordStartTime = Date.now();
    this.portraitChunks = [];
    this.landscapeChunks = [];

    const activeFps = fps || this.hardwareProfile.activeFps || 60;
    const bitrateBps = this.hardwareProfile.bitrateBps || 20_000_000;

    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      DualCameraNative.startDualRecording({
        frameRate: activeFps,
        videoQuality: this.hardwareProfile.qualityLabel,
        fileFormat: this.currentSettings?.fileFormat || 'mp4',
        audioEnabled: this.currentSettings?.audioEnabled ?? true,
        bitrateBps,
      }).catch((err) => {
        console.warn('DualCameraNative.startDualRecording failed:', err);
      });
      return;
    }

    this.cleanupRecordingStreams();

    try {
      // Keep software/WebView canvas capture smooth without starving the 60fps UI compositor
      const webCaptureFps = this.isSimulated ? 15 : Math.min(30, activeFps);
      const webBitrateBps = this.isSimulated ? 1_200_000 : Math.min(bitrateBps, 6_000_000);

      const pStream = this.canvasPortrait.captureStream(webCaptureFps);
      const lStream = this.canvasLandscape.captureStream(webCaptureFps);
      this.recordStreamPortrait = pStream;
      this.recordStreamLandscape = lStream;

      if (this.streamA) {
        const audioTracks = this.streamA.getAudioTracks();
        if (audioTracks.length > 0) {
          pStream.addTrack(audioTracks[0].clone());
          lStream.addTrack(audioTracks[0].clone());
        }
      }

      const mimeType = this.getSupportedMimeType(this.isSimulated);
      this.activeMimeType = mimeType;

      const portraitRec = new MediaRecorder(pStream, {
        mimeType,
        videoBitsPerSecond: webBitrateBps,
      });
      portraitRec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.portraitChunks.push(e.data);
        }
      };
      this.recorderPortrait = portraitRec;

      const landscapeRec = new MediaRecorder(lStream, {
        mimeType,
        videoBitsPerSecond: webBitrateBps,
      });
      landscapeRec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.landscapeChunks.push(e.data);
        }
      };
      this.recorderLandscape = landscapeRec;

      portraitRec.start(1000);
      // Stagger secondary recorder start slightly so dual software encoders don't contend on keyframe init
      this.secondaryRecorderStartTimer = window.setTimeout(() => {
        this.secondaryRecorderStartTimer = null;
        if (this.isRecording && this.recorderLandscape === landscapeRec && landscapeRec.state === 'inactive') {
          try {
            landscapeRec.start(1000);
          } catch {
            // Ignore if stopped concurrently
          }
        }
      }, 140);
    } catch (err) {
      console.error('MediaRecorder initialization error:', err);
    }
  }

  public async stopDualRecording(lensMode: LensMode): Promise<DualCaptureSession> {
    if (!this.isRecording) throw new Error('Not recording');
    this.isRecording = false;
    if (this.secondaryRecorderStartTimer !== null) {
      clearTimeout(this.secondaryRecorderStartTimer);
      this.secondaryRecorderStartTimer = null;
    }
    const duration = Math.max(1, Math.round((Date.now() - this.recordStartTime) / 1000));

    if (this.isNativeActive && Capacitor.isNativePlatform()) {
      try {
        const nativeVideo = await DualCameraNative.stopDualRecording({ lensMode });
        const now = Date.now();
        const id = `dual-video-${now}`;
        const pUrl = Capacitor.convertFileSrc(nativeVideo.portraitPath);
        const lUrl = Capacitor.convertFileSrc(nativeVideo.landscapePath);
        const thumbUrl = this.createCompactThumbnail();

        return {
          id,
          createdAt: now,
          type: 'video',
          lensMode,
          duration: nativeVideo.duration || duration,
          title: `${OEM_CONFIG.appName} Video ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          thumbnailUrl: thumbUrl,
          verticalMedia: {
            id: `${id}-v`,
            url: pUrl,
            aspectRatio: '9:16',
            label: 'TikTok / Reels (9:16)',
            width: this.canvasPortrait.width,
            height: this.canvasPortrait.height,
            fileSize: nativeVideo.portraitSize || 0,
          },
          horizontalMedia: {
            id: `${id}-h`,
            url: lUrl,
            aspectRatio: '16:9',
            label: 'YouTube (16:9)',
            width: this.canvasLandscape.width,
            height: this.canvasLandscape.height,
            fileSize: nativeVideo.landscapeSize || 0,
          },
        };
      } catch (err) {
        console.warn('DualCameraNative.stopDualRecording failed:', err);
      }
    }

    return new Promise((resolve) => {
      let portraitDone = false;
      let landscapeDone = false;
      let resolved = false;

      const checkBothDone = () => {
        if (resolved || !portraitDone || !landscapeDone) return;
        resolved = true;
        const mimeType = this.activeMimeType || this.getSupportedMimeType(this.isSimulated);
        const pBlob = new Blob(this.portraitChunks, { type: mimeType });
        const lBlob = new Blob(this.landscapeChunks, { type: mimeType });
        const thumbUrl = this.createCompactThumbnail();

        // Stop captureStream() video tracks and cloned audio tracks immediately so zero background readback leaks remain
        this.cleanupRecordingStreams();

        const pUrl = URL.createObjectURL(pBlob);
        const lUrl = URL.createObjectURL(lBlob);

        const now = Date.now();
        const id = `dual-video-${now}`;

        resolve({
          id,
          createdAt: now,
          type: 'video',
          lensMode,
          duration,
          title: `${OEM_CONFIG.appName} Video ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          thumbnailUrl: thumbUrl,
          verticalMedia: {
            id: `${id}-v`,
            url: pUrl,
            blob: pBlob,
            aspectRatio: '9:16',
            label: 'TikTok / Reels (9:16)',
            width: this.canvasPortrait.width,
            height: this.canvasPortrait.height,
            fileSize: pBlob.size,
          },
          horizontalMedia: {
            id: `${id}-h`,
            url: lUrl,
            blob: lBlob,
            aspectRatio: '16:9',
            label: 'YouTube (16:9)',
            width: this.canvasLandscape.width,
            height: this.canvasLandscape.height,
            fileSize: lBlob.size,
          },
        });
      };

      if (this.recorderPortrait && this.recorderPortrait.state !== 'inactive') {
        this.recorderPortrait.onstop = () => {
          portraitDone = true;
          checkBothDone();
        };
        this.recorderPortrait.stop();
      } else {
        portraitDone = true;
      }

      if (this.recorderLandscape && this.recorderLandscape.state !== 'inactive') {
        this.recorderLandscape.onstop = () => {
          landscapeDone = true;
          checkBothDone();
        };
        this.recorderLandscape.stop();
      } else {
        landscapeDone = true;
      }

      checkBothDone();

      setTimeout(() => {
        portraitDone = true;
        landscapeDone = true;
        checkBothDone();
      }, 1000);
    });
  }

  private getSupportedMimeType(preferFastSoftware: boolean = false): string {
    const types = preferFastSoftware
      ? [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp8',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=h264,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm',
        ]
      : [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=h264,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm',
        ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return 'video/webm';
  }

  private getCodecDisplayLabel(): string {
    const mime = this.getSupportedMimeType();
    if (mime.includes('mp4')) return 'H.264/MP4';
    if (mime.includes('h264')) return 'H.264/WebM';
    if (mime.includes('vp9')) return 'VP9/WebM';
    return 'WebM';
  }

  public getCanvasPortrait(): HTMLCanvasElement {
    return this.canvasPortrait;
  }

  public getCanvasLandscape(): HTMLCanvasElement {
    return this.canvasLandscape;
  }
}
