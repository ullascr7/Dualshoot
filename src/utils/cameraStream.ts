import { calculateAspectCrops, calculateCameraFilter } from './cropMath';
import { CameraSettings, DualCaptureSession, LensMode, AdvancedControlsState } from '../types/camera';
import {
  createInitialStabilizerState,
  updateStabilizer,
  applyStabilizationOffset,
  StabilizerState,
} from './stabilization';

export class DualCameraEngine {
  private videoElA: HTMLVideoElement | null = null;
  private videoElB: HTMLVideoElement | null = null; // for dual lens
  private streamA: MediaStream | null = null;
  private streamB: MediaStream | null = null;
  private audioStream: MediaStream | null = null;

  // Offscreen rendering canvases for outputs
  private canvasPortrait: HTMLCanvasElement;
  private ctxPortrait: CanvasRenderingContext2D | null;

  private canvasLandscape: HTMLCanvasElement;
  private ctxLandscape: CanvasRenderingContext2D | null;

  // Simulation canvas & state
  private isSimulated = false;
  private animFrameId: number | null = null;
  private simTime = 0;

  // Recorders
  private recorderPortrait: MediaRecorder | null = null;
  private recorderLandscape: MediaRecorder | null = null;
  private portraitChunks: Blob[] = [];
  private landscapeChunks: Blob[] = [];
  private isRecording = false;
  private recordStartTime = 0;

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

  public setVideoElements(videoA: HTMLVideoElement, videoB?: HTMLVideoElement) {
    this.videoElA = videoA;
    if (videoB) this.videoElB = videoB;
  }

  public async startCamera(
    facingMode: 'user' | 'environment',
    settings: CameraSettings,
    lensMode: LensMode
  ): Promise<{ hasPermission: boolean; isSimulated: boolean; error?: string }> {
    this.stopCamera();

    if (settings.demoSimulation) {
      this.isSimulated = true;
      this.startSimulationLoop();
      return { hasPermission: true, isSimulated: true };
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: settings.audioEnabled,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.streamA = stream;
      this.isSimulated = false;

      if (this.videoElA) {
        this.videoElA.srcObject = stream;
        await this.videoElA.play().catch(() => {});
      }

      // If Dual Lens mode, attempt to get secondary camera (e.g., front camera if primary is back)
      if (lensMode === 'dual' && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === 'videoinput');
          const otherFacing = facingMode === 'environment' ? 'user' : 'environment';

          if (videoDevices.length > 1) {
            const secondaryStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: otherFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            });
            this.streamB = secondaryStream;
            if (this.videoElB) {
              this.videoElB.srcObject = secondaryStream;
              await this.videoElB.play().catch(() => {});
            }
          }
        } catch (e) {
          console.log('Dual camera stream not supported or denied, using simulated secondary view:', e);
        }
      }

      return { hasPermission: true, isSimulated: false };
    } catch (err: unknown) {
      console.warn('Real camera not available or permission denied, activating simulation mode', err);
      this.isSimulated = true;
      this.startSimulationLoop();
      const message = err instanceof Error ? err.message : 'Camera unavailable';
      return { hasPermission: false, isSimulated: true, error: message };
    }
  }

  public stopCamera() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.streamA) {
      this.streamA.getTracks().forEach((t) => t.stop());
      this.streamA = null;
    }
    if (this.streamB) {
      this.streamB.getTracks().forEach((t) => t.stop());
      this.streamB = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((t) => t.stop());
      this.audioStream = null;
    }
  }

  /**
   * Continuous procedural simulation loop that creates realistic outdoor scenery
   * (blue sky, golden sun flare, swaying lush green treetops, drifting clouds)
   */
  private currentAdvancedControls?: AdvancedControlsState;
  private isStabilizationEnabled = true;
  private stabilizerState: StabilizerState = createInitialStabilizerState();

  public setDigitalStabilization(enabled: boolean) {
    this.isStabilizationEnabled = enabled;
  }

  public getDigitalStabilization(): boolean {
    return this.isStabilizationEnabled;
  }

  public setAdvancedControls(controls: AdvancedControlsState) {
    this.currentAdvancedControls = controls;
    this.applyHardwareConstraints(controls);
  }

  public async applyHardwareConstraints(controls: AdvancedControlsState) {
    if (!this.streamA) return;
    const track = this.streamA.getVideoTracks()[0];
    if (!track || typeof (track as unknown as { getCapabilities?: () => unknown }).getCapabilities !== 'function') return;

    try {
      const caps = (track as unknown as { getCapabilities: () => Record<string, { min: number; max: number }> }).getCapabilities();
      const advanced: Record<string, unknown> = {};

      if (caps && caps.zoom && controls.zoom >= caps.zoom.min && controls.zoom <= caps.zoom.max) {
        advanced.zoom = controls.zoom;
      }
      if (caps && caps.exposureCompensation) {
        advanced.exposureCompensation = Math.max(
          caps.exposureCompensation.min,
          Math.min(caps.exposureCompensation.max, controls.exposure)
        );
      }
      if (caps && caps.focusDistance && controls.focusMode === 'manual') {
        advanced.focusMode = 'manual';
        advanced.focusDistance = controls.focusDistance;
      }

      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
      }
    } catch {
      // Hardware constraint silently falls back to software canvas filter
    }
  }

  private startSimulationLoop() {
    let lastTime = 0;
    const interval = 1000 / 30; // 30 fps
    const render = (now: number) => {
      if (now - lastTime >= interval) {
        lastTime = now;
        this.simTime += 0.03;
        this.drawSimulationFrame(this.simTime, this.currentAdvancedControls);
      }
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  private drawSimulationFrame(time: number, controls?: AdvancedControlsState) {
    if (!this.ctxPortrait || !this.ctxLandscape) return;

    const pw = this.canvasPortrait.width;
    const ph = this.canvasPortrait.height;
    const lw = this.canvasLandscape.width;
    const lh = this.canvasLandscape.height;

    const zoom = controls?.zoom || 1.0;
    const filter = controls
      ? calculateCameraFilter(
          controls.exposure,
          controls.focusMode,
          controls.focusDistance,
          controls.whiteBalance
        )
      : 'none';

    // 1. Draw Portrait Canvas (9:16)
    this.ctxPortrait.save();
    this.ctxPortrait.filter = filter;

    // Apply digital zoom transform
    if (zoom > 1.0) {
      this.ctxPortrait.translate(pw / 2, ph / 2);
      this.ctxPortrait.scale(zoom, zoom);
      this.ctxPortrait.translate(-pw / 2, -ph / 2);
    }

    const pGrad = this.ctxPortrait.createLinearGradient(0, 0, 0, ph);
    pGrad.addColorStop(0, '#2d7fd5');
    pGrad.addColorStop(0.45, '#62aff3');
    pGrad.addColorStop(1, '#9ad5fd');
    this.ctxPortrait.fillStyle = pGrad;
    this.ctxPortrait.fillRect(0, 0, pw, ph);

    // Gentle clouds
    this.ctxPortrait.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const cloud1X = ((time * 8) % (pw + 400)) - 200;
    this.ctxPortrait.beginPath();
    this.ctxPortrait.arc(cloud1X, 350, 90, 0, Math.PI * 2);
    this.ctxPortrait.arc(cloud1X + 80, 330, 110, 0, Math.PI * 2);
    this.ctxPortrait.arc(cloud1X + 160, 360, 80, 0, Math.PI * 2);
    this.ctxPortrait.fill();

    // Brilliant Sun & optical flare (steady, no artificial wobble)
    const sunX = pw * 0.55;
    const sunY = ph * 0.38;
    const sunGrad = this.ctxPortrait.createRadialGradient(sunX, sunY, 15, sunX, sunY, 320);
    sunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    sunGrad.addColorStop(0.2, 'rgba(255, 252, 210, 0.9)');
    sunGrad.addColorStop(0.5, 'rgba(255, 230, 160, 0.4)');
    sunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    this.ctxPortrait.fillStyle = sunGrad;
    this.ctxPortrait.beginPath();
    this.ctxPortrait.arc(sunX, sunY, 320, 0, Math.PI * 2);
    this.ctxPortrait.fill();

    // Natural steady scenery (zero artificial wobble/sway)
    const sway = 0;
    this.ctxPortrait.fillStyle = '#183b23';
    for (let i = 0; i < 11; i++) {
      this.ctxPortrait.beginPath();
      const tx = i * 120 - 30;
      const ty = ph * 0.68 + Math.sin(i * 1.7) * 70;
      this.ctxPortrait.arc(tx, ty, 150 + (i % 3) * 20, 0, Math.PI * 2);
      this.ctxPortrait.fill();
    }
    this.ctxPortrait.fillStyle = '#265732';
    for (let i = 0; i < 14; i++) {
      this.ctxPortrait.beginPath();
      const tx = i * 90 - 20;
      const ty = ph * 0.78 + Math.cos(i * 1.4) * 60;
      this.ctxPortrait.arc(tx, ty, 120 + (i % 4) * 15, 0, Math.PI * 2);
      this.ctxPortrait.fill();
    }
    this.ctxPortrait.restore();

    // 2. Draw Landscape Canvas (16:9)
    this.ctxLandscape.save();
    this.ctxLandscape.filter = filter;

    if (zoom > 1.0) {
      this.ctxLandscape.translate(lw / 2, lh / 2);
      this.ctxLandscape.scale(zoom, zoom);
      this.ctxLandscape.translate(-lw / 2, -lh / 2);
    }

    const lGrad = this.ctxLandscape.createLinearGradient(0, 0, 0, lh);
    lGrad.addColorStop(0, '#2d7fd5');
    lGrad.addColorStop(0.5, '#62aff3');
    lGrad.addColorStop(1, '#9ad5fd');
    this.ctxLandscape.fillStyle = lGrad;
    this.ctxLandscape.fillRect(0, 0, lw, lh);

    // Landscape sun (steady)
    const lSunX = lw * 0.52;
    const lSunY = lh * 0.32;
    const lSunGrad = this.ctxLandscape.createRadialGradient(lSunX, lSunY, 20, lSunX, lSunY, 350);
    lSunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    lSunGrad.addColorStop(0.2, 'rgba(255, 252, 210, 0.9)');
    lSunGrad.addColorStop(0.5, 'rgba(255, 230, 160, 0.4)');
    lSunGrad.addColorStop(1, 'rgba(255, 200, 100, 0)');
    this.ctxLandscape.fillStyle = lSunGrad;
    this.ctxLandscape.beginPath();
    this.ctxLandscape.arc(lSunX, lSunY, 350, 0, Math.PI * 2);
    this.ctxLandscape.fill();

    // Landscape trees (steady)
    this.ctxLandscape.fillStyle = '#183b23';
    for (let i = 0; i < 18; i++) {
      this.ctxLandscape.beginPath();
      const tx = i * 130 - 40;
      const ty = lh * 0.72 + Math.sin(i * 1.5) * 50;
      this.ctxLandscape.arc(tx, ty, 160, 0, Math.PI * 2);
      this.ctxLandscape.fill();
    }
    this.ctxLandscape.fillStyle = '#265732';
    for (let i = 0; i < 22; i++) {
      this.ctxLandscape.beginPath();
      const tx = i * 100 - 30;
      const ty = lh * 0.82 + Math.cos(i * 1.3) * 40;
      this.ctxLandscape.arc(tx, ty, 130, 0, Math.PI * 2);
      this.ctxLandscape.fill();
    }
    this.ctxLandscape.restore();
  }

  /**
   * Render real camera feed frames directly into portrait & landscape canvases
   * Without artificial jitter or synthetic wobbles
   */
  public updateCanvasesFromVideo(lensMode: LensMode, controls?: AdvancedControlsState) {
    if (this.isSimulated || !this.videoElA || this.videoElA.readyState < 2) {
      return;
    }

    const vw = this.videoElA.videoWidth || 1920;
    const vh = this.videoElA.videoHeight || 1080;
    const zoom = controls?.zoom || 1.0;
    const crops = calculateAspectCrops(vw, vh, zoom);

    // Direct 1:1 camera crops - pristine real video recording with no synthetic motions
    const portraitCrop = crops.portrait;
    const landscapeCrop = crops.landscape;

    const filter = controls
      ? calculateCameraFilter(
          controls.exposure,
          controls.focusMode,
          controls.focusDistance,
          controls.whiteBalance
        )
      : 'none';

    // 1. Render Portrait (9:16)
    if (this.ctxPortrait) {
      this.ctxPortrait.filter = filter;
      this.ctxPortrait.drawImage(
        this.videoElA,
        portraitCrop.sx,
        portraitCrop.sy,
        portraitCrop.sWidth,
        portraitCrop.sHeight,
        0,
        0,
        this.canvasPortrait.width,
        this.canvasPortrait.height
      );
      this.ctxPortrait.filter = 'none';
    }

    // 2. Render Landscape (16:9)
    if (this.ctxLandscape) {
      this.ctxLandscape.filter = filter;
      if (lensMode === 'dual' && this.videoElB && this.videoElB.readyState >= 2) {
        // Draw from camera B
        const bW = this.videoElB.videoWidth || 1280;
        const bH = this.videoElB.videoHeight || 720;
        const cropsB = calculateAspectCrops(bW, bH, zoom);
        this.ctxLandscape.drawImage(
          this.videoElB,
          cropsB.landscape.sx,
          cropsB.landscape.sy,
          cropsB.landscape.sWidth,
          cropsB.landscape.sHeight,
          0,
          0,
          this.canvasLandscape.width,
          this.canvasLandscape.height
        );
      } else {
        // Draw stabilized center horizontal crop from primary camera
        this.ctxLandscape.drawImage(
          this.videoElA,
          landscapeCrop.sx,
          landscapeCrop.sy,
          landscapeCrop.sWidth,
          landscapeCrop.sHeight,
          0,
          0,
          this.canvasLandscape.width,
          this.canvasLandscape.height
        );
      }
      this.ctxLandscape.filter = 'none';
    }
  }

  /**
   * Snaps simultaneous 9:16 and 16:9 photos with advanced controls applied
   */
  public async takeDualPhoto(lensMode: LensMode, controls?: AdvancedControlsState): Promise<DualCaptureSession> {
    this.updateCanvasesFromVideo(lensMode, controls);

    const pDataUrl = this.canvasPortrait.toDataURL('image/jpeg', 0.92);
    const lDataUrl = this.canvasLandscape.toDataURL('image/jpeg', 0.92);

    const now = Date.now();
    const id = `dual-photo-${now}`;

    // Convert data URLs to approximate byte size
    const pSize = Math.round((pDataUrl.length * 3) / 4);
    const lSize = Math.round((lDataUrl.length * 3) / 4);

    return {
      id,
      createdAt: now,
      type: 'photo',
      lensMode,
      title: `Dual Shot ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      thumbnailUrl: pDataUrl,
      verticalMedia: {
        id: `${id}-v`,
        url: pDataUrl,
        aspectRatio: '9:16',
        label: 'TikTok / Reels (9:16)',
        width: this.canvasPortrait.width,
        height: this.canvasPortrait.height,
        fileSize: pSize,
      },
      horizontalMedia: {
        id: `${id}-h`,
        url: lDataUrl,
        aspectRatio: '16:9',
        label: 'YouTube (16:9)',
        width: this.canvasLandscape.width,
        height: this.canvasLandscape.height,
        fileSize: lSize,
      },
    };
  }

  /**
   * Start simultaneous dual video recording
   */
  public startDualRecording(fps: number = 30) {
    if (this.isRecording) return;
    this.isRecording = true;
    this.recordStartTime = Date.now();
    this.portraitChunks = [];
    this.landscapeChunks = [];

    // Capture streams from both canvases
    const pStream = this.canvasPortrait.captureStream(fps);
    const lStream = this.canvasLandscape.captureStream(fps);

    // Attach audio track if available
    if (this.streamA) {
      const audioTracks = this.streamA.getAudioTracks();
      if (audioTracks.length > 0) {
        pStream.addTrack(audioTracks[0].clone());
        lStream.addTrack(audioTracks[0].clone());
      }
    }

    const mimeType = this.getSupportedMimeType();

    try {
      this.recorderPortrait = new MediaRecorder(pStream, {
        mimeType,
        videoBitsPerSecond: 6000000,
      });
      this.recorderPortrait.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.portraitChunks.push(e.data);
        }
      };

      this.recorderLandscape = new MediaRecorder(lStream, {
        mimeType,
        videoBitsPerSecond: 6000000,
      });
      this.recorderLandscape.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.landscapeChunks.push(e.data);
        }
      };

      this.recorderPortrait.start(250);
      this.recorderLandscape.start(250);
    } catch (err) {
      console.error('MediaRecorder initialization error:', err);
    }
  }

  /**
   * Stop recording and return dual session with synchronized video files
   */
  public async stopDualRecording(lensMode: LensMode): Promise<DualCaptureSession> {
    if (!this.isRecording) throw new Error('Not recording');
    this.isRecording = false;
    const duration = Math.max(1, Math.round((Date.now() - this.recordStartTime) / 1000));

    return new Promise((resolve) => {
      let portraitDone = false;
      let landscapeDone = false;

      const checkBothDone = () => {
        if (portraitDone && landscapeDone) {
          const mimeType = this.getSupportedMimeType();
          const pBlob = new Blob(this.portraitChunks, { type: mimeType });
          const lBlob = new Blob(this.landscapeChunks, { type: mimeType });

          const pUrl = URL.createObjectURL(pBlob);
          const lUrl = URL.createObjectURL(lBlob);

          const now = Date.now();
          const id = `dual-video-${now}`;

          const session: DualCaptureSession = {
            id,
            createdAt: now,
            type: 'video',
            lensMode,
            duration,
            title: `Dual Video ${new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            thumbnailUrl: this.canvasPortrait.toDataURL('image/jpeg', 0.8),
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
          };

          resolve(session);
        }
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

      // Safety timeout
      setTimeout(() => {
        portraitDone = true;
        landscapeDone = true;
        checkBothDone();
      }, 1000);
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return 'video/webm';
  }

  public getCanvasPortrait(): HTMLCanvasElement {
    return this.canvasPortrait;
  }

  public getCanvasLandscape(): HTMLCanvasElement {
    return this.canvasLandscape;
  }
}
