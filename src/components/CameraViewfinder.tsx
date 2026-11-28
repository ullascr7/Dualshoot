import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, ShieldAlert, ArrowUpDown, Grid3X3 } from 'lucide-react';
import {
  CameraErrorKind,
  DualLayoutMode,
  HardwareQualityProfile,
  LensMode,
} from '../types/camera';
import { calculateLivePreviewFilter, calculateLandscapeGuideInPortrait } from '../utils/cropMath';
import { playFocusBeep, prewarmAudioSfx } from '../utils/audioSfx';

interface CameraViewfinderProps {
  lensMode: LensMode;
  dualLayoutMode: DualLayoutMode;
  isRecording: boolean;
  recordingTime: number;
  countdownSeconds: number | null;
  formatDuration: (sec: number) => string;
  isFlashing: boolean;
  videoRefA: React.RefObject<HTMLVideoElement | null>;
  videoRefB: React.RefObject<HTMLVideoElement | null>;
  canvasDisplayRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSecondaryRef: React.RefObject<HTMLCanvasElement | null>;
  isSimulated: boolean;
  hasSecondaryStream: boolean;
  hardwareProfile: HardwareQualityProfile;
  zoom: number;
  maxZoom?: number;
  exposure: number;
  focusMode: 'auto' | 'manual';
  focusDistance: number;
  whiteBalance: 'auto' | 'daylight' | 'cloudy' | 'tungsten' | 'fluorescent';
  showGrid: boolean;
  digitalStabilization?: boolean;
  cameraErrorKind?: CameraErrorKind | null;
  cameraErrorMessage?: string | null;
  onRetryCamera: () => void;
  onEnableDemoFallback: () => void;
  onSwapFrontRear: () => void;
  onUpdateExposure: (ev: number) => void;
  onCommitZoom: (zoom: number) => void;
  onTapFocus?: (normX: number, normY: number) => void;
}

const HINT_FOCUS_KEY = 'dualshoot_hint_focus_seen_v1';
const HINT_PIP_KEY = 'dualshoot_hint_pip_seen_v1';
const ZOOM_HUD_HOLD_MS = 1600;
const ZOOM_HUD_FADE_MS = 450;
const ZOOM_TRACK_TRAVEL_PX = 136;

export const CameraViewfinder: React.FC<CameraViewfinderProps> = React.memo(({
  dualLayoutMode,
  isRecording,
  recordingTime,
  countdownSeconds,
  formatDuration,
  isFlashing,
  videoRefA,
  videoRefB,
  canvasDisplayRef,
  canvasSecondaryRef,
  isSimulated,
  hasSecondaryStream,
  hardwareProfile,
  zoom,
  maxZoom = 5.0,
  exposure,
  focusMode,
  focusDistance,
  whiteBalance,
  showGrid,
  digitalStabilization = true,
  cameraErrorKind,
  cameraErrorMessage,
  onRetryCamera,
  onEnableDemoFallback,
  onSwapFrontRear,
  onUpdateExposure,
  onCommitZoom,
  onTapFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const pipWindowRef = useRef<HTMLDivElement>(null);
  const zoomScaleRailRef = useRef<HTMLDivElement>(null);
  const zoomTrackInnerRef = useRef<HTMLDivElement>(null);
  const zoomThumbRef = useRef<HTMLDivElement>(null);
  const zoomValueTextRef = useRef<HTMLSpanElement>(null);

  const effectiveMaxZoom = Math.max(2.0, maxZoom);

  // Focus reticle & EV fade state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; fading: boolean } | null>(null);
  const focusTimeoutRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const isAdjustingEvRef = useRef(false);

  // Discreet side zoom scale visibility & fade state
  const [zoomHudPhase, setZoomHudPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');
  const zoomHudPhaseRef = useRef<'hidden' | 'visible' | 'fading'>('hidden');
  const zoomHoldTimeoutRef = useRef<number | null>(null);
  const zoomHideTimeoutRef = useRef<number | null>(null);
  const hasMountedZoomRef = useRef(false);
  const prevZoomPropRef = useRef<number>(zoom);
  const isZoomInteractionActiveRef = useRef(false);
  const isScrubbingZoomRef = useRef(false);

  // First-time gentle user hints
  const [showFocusHint, setShowFocusHint] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(HINT_FOCUS_KEY);
    } catch {
      return true;
    }
  });
  const [showPipHint, setShowPipHint] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(HINT_PIP_KEY);
    } catch {
      return true;
    }
  });

  // Zero-state pinch-to-zoom pointer refs
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchBaseDistRef = useRef<number | null>(null);
  const pinchBaseZoomRef = useRef<number>(zoom);
  const liveZoomRef = useRef<number>(zoom);
  const lastZoomCommitTimeRef = useRef<number>(0);

  // Zero-state PiP drag & corner snap refs
  const pipDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    currX: number;
    currY: number;
    moved: boolean;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 16,
    origY: 64,
    currX: 16,
    currY: 64,
    moved: false,
  });

  const guide = calculateLandscapeGuideInPortrait();

  const updateZoomHudDom = useCallback(
    (targetZoom: number) => {
      const clamped = Math.max(1.0, Math.min(effectiveMaxZoom, targetZoom));
      const ratio = (clamped - 1.0) / Math.max(0.1, effectiveMaxZoom - 1.0);
      const yOffset = (1 - ratio) * ZOOM_TRACK_TRAVEL_PX;

      if (zoomValueTextRef.current) {
        zoomValueTextRef.current.textContent = `${clamped.toFixed(1)}x`;
      }
      if (zoomThumbRef.current) {
        zoomThumbRef.current.style.transform = `translate3d(0, ${yOffset.toFixed(1)}px, 0)`;
      }
      if (zoomScaleRailRef.current) {
        zoomScaleRailRef.current.setAttribute('aria-valuenow', clamped.toFixed(1));
      }
    },
    [effectiveMaxZoom]
  );

  const clearZoomHudTimers = useCallback(() => {
    if (zoomHoldTimeoutRef.current !== null) {
      clearTimeout(zoomHoldTimeoutRef.current);
      zoomHoldTimeoutRef.current = null;
    }
    if (zoomHideTimeoutRef.current !== null) {
      clearTimeout(zoomHideTimeoutRef.current);
      zoomHideTimeoutRef.current = null;
    }
  }, []);

  const setZoomHudPhaseSynced = useCallback((phase: 'hidden' | 'visible' | 'fading') => {
    if (zoomHudPhaseRef.current !== phase) {
      zoomHudPhaseRef.current = phase;
      setZoomHudPhase(phase);
    }
  }, []);

  const scheduleZoomHudDismiss = useCallback(() => {
    clearZoomHudTimers();
    zoomHoldTimeoutRef.current = window.setTimeout(() => {
      if (isZoomInteractionActiveRef.current) return;
      setZoomHudPhaseSynced('fading');
      zoomHideTimeoutRef.current = window.setTimeout(() => {
        if (!isZoomInteractionActiveRef.current) {
          setZoomHudPhaseSynced('hidden');
        }
      }, ZOOM_HUD_FADE_MS);
    }, ZOOM_HUD_HOLD_MS);
  }, [clearZoomHudTimers, setZoomHudPhaseSynced]);

  const revealZoomHud = useCallback(
    (keepPersistent: boolean) => {
      clearZoomHudTimers();
      setZoomHudPhaseSynced('visible');
      if (!keepPersistent) {
        scheduleZoomHudDismiss();
      }
    },
    [clearZoomHudTimers, scheduleZoomHudDismiss, setZoomHudPhaseSynced]
  );

  useEffect(() => {
    return () => {
      clearZoomHudTimers();
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [clearZoomHudTimers]);

  // Keep liveZoomRef and side zoom HUD synchronized with external zoom changes
  useEffect(() => {
    if (!isZoomInteractionActiveRef.current) {
      liveZoomRef.current = zoom;
      if (zoomLayerRef.current && !isSimulated) {
        zoomLayerRef.current.style.transform = `translate3d(0, 0, 0) scale(${zoom})`;
      }
      updateZoomHudDom(zoom);
    }

    if (!hasMountedZoomRef.current) {
      hasMountedZoomRef.current = true;
      prevZoomPropRef.current = zoom;
      return;
    }

    if (Math.abs(zoom - prevZoomPropRef.current) > 0.001) {
      prevZoomPropRef.current = zoom;
      revealZoomHud(isZoomInteractionActiveRef.current);
    }
  }, [zoom, isSimulated, updateZoomHudDom, revealZoomHud]);

  // Snap PiP window cleanly to bottom-right / top-right corner on mount or mode switch
  const snapPipToCorner = useCallback((preferInitial = false) => {
    const container = containerRef.current;
    const pip = pipWindowRef.current;
    if (!container || !pip) return;

    const rect = container.getBoundingClientRect();
    const pipW = pip.offsetWidth || 124;
    const pipH = pip.offsetHeight || 168;
    const padX = 14;
    const padTop = 58;
    const padBottom = 18;

    const minX = padX;
    const maxX = Math.max(padX, rect.width - pipW - padX);
    const minY = padTop;
    const maxY = Math.max(padTop, rect.height - pipH - padBottom);

    let targetX = maxX;
    let targetY = minY;

    if (!preferInitial) {
      const cx = pipDragRef.current.currX + pipW / 2;
      const cy = pipDragRef.current.currY + pipH / 2;
      targetX = cx < rect.width / 2 ? minX : maxX;
      targetY = cy < rect.height / 2 ? minY : maxY;
    }

    pipDragRef.current.currX = targetX;
    pipDragRef.current.currY = targetY;

    pip.style.transition = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
    pip.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
  }, []);

  useEffect(() => {
    if (dualLayoutMode === 'pip') {
      requestAnimationFrame(() => snapPipToCorner(true));
    }
  }, [dualLayoutMode, snapPipToCorner]);

  const scheduleFocusDismiss = useCallback(() => {
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);

    fadeTimeoutRef.current = window.setTimeout(() => {
      if (!isAdjustingEvRef.current) {
        setFocusPoint((prev) => (prev ? { ...prev, fading: true } : null));
      }
    }, 1800);

    focusTimeoutRef.current = window.setTimeout(() => {
      if (!isAdjustingEvRef.current) {
        setFocusPoint(null);
      }
    }, 2300);
  }, []);

  const dismissFocusHint = () => {
    if (showFocusHint) {
      setShowFocusHint(false);
      try {
        localStorage.setItem(HINT_FOCUS_KEY, '1');
      } catch {
        // noop
      }
    }
  };

  const dismissPipHint = () => {
    if (showPipHint) {
      setShowPipHint(false);
      try {
        localStorage.setItem(HINT_PIP_KEY, '1');
      } catch {
        // noop
      }
    }
  };

  const applyInteractiveZoom = useCallback(
    (nextZoomRaw: number, forceCommit = false) => {
      const clamped = Math.max(1.0, Math.min(effectiveMaxZoom, nextZoomRaw));
      liveZoomRef.current = clamped;

      if (zoomLayerRef.current && !isSimulated) {
        zoomLayerRef.current.style.transform = `translate3d(0, 0, 0) scale(${clamped.toFixed(3)})`;
      }
      updateZoomHudDom(clamped);

      const now = performance.now();
      if (forceCommit || now - lastZoomCommitTimeRef.current > 90) {
        lastZoomCommitTimeRef.current = now;
        const rounded = Math.round(clamped * 10) / 10;
        prevZoomPropRef.current = rounded;
        onCommitZoom(rounded);
      }
    },
    [effectiveMaxZoom, isSimulated, onCommitZoom, updateZoomHudDom]
  );

  // Viewfinder pointer handlers (Tap-to-Focus + 60fps Pinch-to-Zoom without React state loops)
  const handleViewfinderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    prewarmAudioSfx();
    const targetEl = e.target as HTMLElement;
    if (
      targetEl.closest('.exposure-slider-container') ||
      targetEl.closest('.pip-draggable-window') ||
      targetEl.closest('.permission-recovery-card') ||
      targetEl.closest('.zoom-scale-indicator')
    ) {
      return;
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchBaseDistRef.current = Math.max(10, dist);
      pinchBaseZoomRef.current = liveZoomRef.current;
      isZoomInteractionActiveRef.current = true;
      if (zoomLayerRef.current) {
        zoomLayerRef.current.style.transition = 'none';
      }
      updateZoomHudDom(liveZoomRef.current);
      revealZoomHud(true);
      return;
    }

    if (activePointersRef.current.size === 1 && containerRef.current && !cameraErrorKind) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(40, Math.min(rect.width - 76, e.clientX - rect.left));
      const y = Math.max(68, Math.min(rect.height - 68, e.clientY - rect.top));

      setFocusPoint({ x, y, fading: false });
      playFocusBeep();
      dismissFocusHint();

      if (onTapFocus) {
        onTapFocus(
          Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
          Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)))
        );
      }
      scheduleFocusDismiss();
    }
  };

  const handleViewfinderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && pinchBaseDistRef.current !== null) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scaleFactor = dist / pinchBaseDistRef.current;
      const nextZoom = Math.max(
        1.0,
        Math.min(effectiveMaxZoom, pinchBaseZoomRef.current * scaleFactor)
      );
      applyInteractiveZoom(nextZoom, false);
    }
  };

  const handleViewfinderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2 && pinchBaseDistRef.current !== null) {
      pinchBaseDistRef.current = null;
      isZoomInteractionActiveRef.current = false;
      if (zoomLayerRef.current) {
        zoomLayerRef.current.style.transition = '';
      }
      applyInteractiveZoom(liveZoomRef.current, true);
      scheduleZoomHudDismiss();
    }
  };

  // Side Zoom Scale Direct Scrub Handlers (60fps DOM updates while dragging)
  const updateZoomFromTrackClientY = useCallback(
    (clientY: number, forceCommit: boolean) => {
      const track = zoomTrackInnerRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = 1 - (clientY - rect.top) / Math.max(1, rect.height);
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const nextZoom = 1.0 + clampedRatio * (effectiveMaxZoom - 1.0);
      applyInteractiveZoom(nextZoom, forceCommit);
    },
    [applyInteractiveZoom, effectiveMaxZoom]
  );

  const handleZoomScalePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomHudPhaseRef.current === 'hidden') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isScrubbingZoomRef.current = true;
    isZoomInteractionActiveRef.current = true;
    if (zoomLayerRef.current) {
      zoomLayerRef.current.style.transition = 'none';
    }
    revealZoomHud(true);
    updateZoomFromTrackClientY(e.clientY, false);
  };

  const handleZoomScalePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingZoomRef.current) return;
    e.stopPropagation();
    updateZoomFromTrackClientY(e.clientY, false);
  };

  const handleZoomScalePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingZoomRef.current) return;
    e.stopPropagation();
    isScrubbingZoomRef.current = false;
    isZoomInteractionActiveRef.current = false;
    if (zoomLayerRef.current) {
      zoomLayerRef.current.style.transition = '';
    }
    updateZoomFromTrackClientY(e.clientY, true);
    scheduleZoomHudDismiss();
  };

  const handleZoomScaleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = 0.2;
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -0.2;
    if (delta === 0) return;
    e.preventDefault();
    revealZoomHud(false);
    applyInteractiveZoom(liveZoomRef.current + delta, true);
  };

  // Draggable PiP Pointer Handlers (Zero React state updates during drag!)
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dualLayoutMode !== 'pip') return;
    e.stopPropagation();
    const pip = pipWindowRef.current;
    if (!pip) return;

    pip.setPointerCapture(e.pointerId);
    pip.style.transition = 'none';
    pipDragRef.current.dragging = true;
    pipDragRef.current.moved = false;
    pipDragRef.current.startX = e.clientX;
    pipDragRef.current.startY = e.clientY;
    pipDragRef.current.origX = pipDragRef.current.currX;
    pipDragRef.current.origY = pipDragRef.current.currY;
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDragRef.current.dragging || dualLayoutMode !== 'pip') return;
    e.stopPropagation();

    const dx = e.clientX - pipDragRef.current.startX;
    const dy = e.clientY - pipDragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      pipDragRef.current.moved = true;
      dismissPipHint();
    }

    const container = containerRef.current;
    const pip = pipWindowRef.current;
    if (!container || !pip) return;

    const rect = container.getBoundingClientRect();
    const maxX = Math.max(8, rect.width - pip.offsetWidth - 8);
    const maxY = Math.max(52, rect.height - pip.offsetHeight - 8);

    const nextX = Math.max(8, Math.min(maxX, pipDragRef.current.origX + dx));
    const nextY = Math.max(52, Math.min(maxY, pipDragRef.current.origY + dy));

    pipDragRef.current.currX = nextX;
    pipDragRef.current.currY = nextY;
    pip.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDragRef.current.dragging || dualLayoutMode !== 'pip') return;
    e.stopPropagation();
    pipDragRef.current.dragging = false;

    const wasMoved = pipDragRef.current.moved;
    snapPipToCorner(false);

    if (!wasMoved) {
      onSwapFrontRear();
    }
  };

  const cssFilter = !isSimulated
    ? calculateLivePreviewFilter(exposure, focusMode, focusDistance, whiteBalance)
    : 'none';

  return (
    <div
      ref={containerRef}
      onPointerDown={handleViewfinderPointerDown}
      onPointerMove={handleViewfinderPointerMove}
      onPointerUp={handleViewfinderPointerUp}
      onPointerCancel={handleViewfinderPointerUp}
      className="viewfinder-gpu relative flex-1 w-full bg-black overflow-hidden select-none touch-none"
    >
      {/* Primary Viewfinder Surface (GPU-promoted layer; morphs smoothly to Top 50% in Split Screen) */}
      <div
        className={`gpu-layer absolute left-0 right-0 top-0 overflow-hidden transition-[height] duration-200 ease-flagship bg-black ${
          dualLayoutMode === 'split' ? 'h-1/2 border-b border-white/15' : 'h-full'
        }`}
      >
        <div
          ref={zoomLayerRef}
          className="gpu-layer w-full h-full transition-transform duration-150 ease-flagship origin-center"
          style={{
            filter: cssFilter,
            transform: !isSimulated ? `translate3d(0, 0, 0) scale(${zoom})` : 'translate3d(0, 0, 0)',
          }}
        >
          {/* Hardware-decoded GPU-accelerated live video stream */}
          <video
            ref={videoRefA}
            playsInline
            muted
            autoPlay
            className={`gpu-layer w-full h-full object-cover ${isSimulated || cameraErrorKind ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          />

          {/* Lightweight 360x640 (exact 9:16) GPU preview canvas fallback for Demo/headless mode */}
          <canvas
            ref={canvasDisplayRef}
            width={360}
            height={640}
            className={`gpu-layer absolute inset-0 w-full h-full object-cover pointer-events-none ${
              isSimulated && !cameraErrorKind ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      </div>

      {/* Secondary Camera Surface (Persistent GPU-accelerated layer across Single, Split 50/50, and PiP) */}
      <div
        ref={pipWindowRef}
        onPointerDown={handlePipPointerDown}
        onPointerMove={handlePipPointerMove}
        onPointerUp={handlePipPointerUp}
        onPointerCancel={handlePipPointerUp}
        className={
          dualLayoutMode === 'single'
            ? 'gpu-layer absolute opacity-0 pointer-events-none w-px h-px overflow-hidden'
            : dualLayoutMode === 'split'
              ? 'gpu-layer absolute left-0 right-0 bottom-0 h-1/2 overflow-hidden bg-neutral-950 transition-[height,opacity] duration-200 ease-flagship'
              : 'pip-draggable-window gpu-layer absolute top-0 left-0 z-20 w-[122px] h-[168px] rounded-2xl overflow-hidden border border-white/25 bg-black/90 shadow-2xl cursor-grab active:cursor-grabbing'
        }
        style={
          dualLayoutMode !== 'pip'
            ? { transform: 'translate3d(0, 0, 0)' }
            : undefined
        }
      >
        {/* Hardware-decoded GPU-accelerated secondary video stream */}
        <video
          ref={videoRefB}
          playsInline
          muted
          autoPlay
          className={`gpu-layer w-full h-full object-cover ${
            hasSecondaryStream && !isSimulated && !cameraErrorKind ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Secondary GPU preview canvas fallback (640x360 exact 16:9 when dual hardware isn't concurrent) */}
        <canvas
          ref={canvasSecondaryRef}
          width={640}
          height={360}
          className={`gpu-layer absolute inset-0 w-full h-full object-cover pointer-events-none ${
            !hasSecondaryStream || isSimulated ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Mini window label & flip affordance */}
        {dualLayoutMode !== 'single' && (
          <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between text-[10px] font-medium text-white/90 pointer-events-none">
            <span className="font-mono tabular-nums">
              {dualLayoutMode === 'split' ? 'CAM B · 16:9' : 'CAM B'}
            </span>
            {dualLayoutMode === 'pip' && <ArrowUpDown className="w-3 h-3 text-amber-400" />}
          </div>
        )}

        {/* First-time drag hint on PiP window */}
        {dualLayoutMode === 'pip' && showPipHint && (
          <div className="absolute top-1.5 inset-x-1.5 px-1.5 py-0.5 rounded-full bg-black/80 text-[9px] text-center text-white font-medium border border-white/15 pointer-events-none">
            Drag to corner
          </div>
        )}
      </div>

      {/* 3x3 Rule-of-Thirds Grid Overlay */}
      {showGrid && !cameraErrorKind && (
        <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/3 inset-x-0 h-[1px] bg-white/20" />
          <div className="absolute top-2/3 inset-x-0 h-[1px] bg-white/20" />
          <div className="absolute left-1/3 inset-y-0 w-[1px] bg-white/20" />
          <div className="absolute left-2/3 inset-y-0 w-[1px] bg-white/20" />
        </div>
      )}

      {/* Single Lens Mode: Centered 16:9 Framing Guide */}
      {dualLayoutMode === 'single' && !cameraErrorKind && (
        <div
          className="absolute inset-x-0 z-10 pointer-events-none transition-opacity duration-200"
          style={{
            top: `${guide.topPercent}%`,
            height: `${guide.heightPercent}%`,
          }}
        >
          <div className="absolute inset-0 border-y border-amber-400/45">
            <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-400/80" />
            <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-400/80" />
            <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-400/80" />
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-400/80" />
            <div className="absolute -top-6 right-3 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-mono text-amber-300 border border-white/10">
              16:9 Frame
            </div>
          </div>
        </div>
      )}

      {/* Top-Center Pulsing Red Recording Timer Pill (00:00) */}
      {isRecording && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/95 border border-red-400/40 text-white font-mono tabular-nums text-xs font-bold shadow-lg">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>{formatDuration(recordingTime)}</span>
        </div>
      )}

      {/* Sequential Dual Sync Friendly Pill (when phone lacks concurrent hardware ISP) */}
      {!isRecording &&
        dualLayoutMode !== 'single' &&
        !isSimulated &&
        hardwareProfile.sequentialFallbackActive && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/75 border border-white/12 text-[11px] text-amber-300 font-medium whitespace-nowrap pointer-events-none">
            Sequential Dual Sync
          </div>
        )}

      {/* Subtle First-Time Tap-to-Focus Hint */}
      {showFocusHint && !isRecording && !cameraErrorKind && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/75 border border-white/12 text-[11px] text-white/85 pointer-events-none">
          Tap anywhere to focus
        </div>
      )}

      {/* Non-intrusive Telemetry Strip when Pro settings or Demo active */}
      {!cameraErrorKind && (isSimulated || zoom > 1.05 || exposure !== 0 || focusMode === 'manual') && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/75 border border-white/10 text-[10px] font-mono tabular-nums text-white/85 pointer-events-none">
          {isSimulated && <span className="text-sky-300">Demo Feed</span>}
          {zoom > 1.05 && <span className="text-amber-300">{zoom.toFixed(1)}x</span>}
          {exposure !== 0 && (
            <span>{exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)} EV</span>
          )}
          {focusMode === 'manual' && (
            <span className="text-amber-300">MF {Math.round(focusDistance * 100)}%</span>
          )}
          {digitalStabilization && <span className="text-emerald-400">EIS</span>}
        </div>
      )}

      {/* Discreet Persistent Side Zoom Scale Indicator (fades out after interaction) */}
      {!cameraErrorKind && (
        <div
          data-testid="zoom-scale-indicator"
          aria-hidden={zoomHudPhase === 'hidden'}
          className={`zoom-scale-indicator gpu-layer absolute right-3 top-1/2 -translate-y-1/2 z-30 flex items-center gap-2 transition-opacity ease-flagship ${
            zoomHudPhase === 'visible'
              ? 'opacity-100 duration-150 pointer-events-auto'
              : zoomHudPhase === 'fading'
                ? 'opacity-0 duration-[450ms] pointer-events-none'
                : 'opacity-0 duration-150 pointer-events-none'
          }`}
        >
          {/* Numeric magnification readout */}
          <div className="px-2 py-1 rounded-md bg-black/80 border border-white/15 shadow-lg pointer-events-none">
            <span
              ref={zoomValueTextRef}
              className="block font-mono tabular-nums text-[11px] font-bold text-amber-400 leading-none"
            >
              {zoom.toFixed(1)}x
            </span>
          </div>

          {/* Interactive vertical graduated tick rail */}
          <div
            ref={zoomScaleRailRef}
            role="slider"
            tabIndex={zoomHudPhase === 'visible' ? 0 : -1}
            aria-label="Zoom Scale"
            aria-valuemin={1}
            aria-valuemax={Number(effectiveMaxZoom.toFixed(1))}
            aria-valuenow={Number(zoom.toFixed(1))}
            onPointerDown={handleZoomScalePointerDown}
            onPointerMove={handleZoomScalePointerMove}
            onPointerUp={handleZoomScalePointerUp}
            onPointerCancel={handleZoomScalePointerUp}
            onKeyDown={handleZoomScaleKeyDown}
            className="w-8 h-[160px] py-3 px-1.5 rounded-2xl bg-black/80 border border-white/15 shadow-xl flex flex-col items-center justify-between touch-none cursor-ns-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div
              ref={zoomTrackInnerRef}
              className="relative w-full flex flex-col items-end justify-between"
              style={{ height: `${ZOOM_TRACK_TRAVEL_PX}px` }}
            >
              {/* Graduated tick marks (17 marks: major integer stops + sub-ticks) */}
              {Array.from({ length: 17 }).map((_, idx) => {
                const isMajor = idx % 4 === 0;
                return (
                  <span
                    key={idx}
                    aria-hidden="true"
                    className={`block rounded-full transition-colors ${
                      isMajor ? 'w-3 h-[1.5px] bg-white/75' : 'w-1.5 h-[1px] bg-white/30'
                    }`}
                  />
                );
              })}

              {/* 60fps GPU-translated amber indicator needle */}
              <div
                ref={zoomThumbRef}
                aria-hidden="true"
                className="gpu-layer absolute -left-0.5 right-0 -top-1 flex items-center pointer-events-none"
                style={{
                  transform: `translate3d(0, ${(
                    (1 -
                      Math.max(
                        0,
                        Math.min(
                          1,
                          (zoom - 1.0) / Math.max(0.1, effectiveMaxZoom - 1.0)
                        )
                      )) *
                    ZOOM_TRACK_TRAVEL_PX
                  ).toFixed(1)}px, 0)`,
                }}
              >
                <span className="w-1.5 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                <span className="flex-1 h-[2px] bg-amber-400 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animated Tap-to-Focus Ring + Vertical Brightness/Exposure Slider */}
      {focusPoint && !cameraErrorKind && (
        <div
          className={`absolute z-30 flex items-center gap-2.5 transition-opacity duration-300 ${
            focusPoint.fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{ left: focusPoint.x, top: focusPoint.y, transform: 'translate3d(-50%, -50%, 0)' }}
        >
          <div className="relative w-16 h-16 pointer-events-none animate-focus-lock" style={{ left: '50%', top: '50%' }}>
            <div className="w-16 h-16 rounded-full border-2 border-amber-400/95 shadow-[0_0_16px_rgba(251,191,36,0.35)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
            </div>
          </div>

          <div
            className="exposure-slider-container pointer-events-auto flex flex-col items-center py-2 px-1.5 rounded-full bg-black/80 border border-white/15 shadow-xl"
            onPointerDown={(e) => {
              e.stopPropagation();
              isAdjustingEvRef.current = true;
              setFocusPoint((prev) => (prev ? { ...prev, fading: false } : null));
              if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
              if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              isAdjustingEvRef.current = false;
              scheduleFocusDismiss();
            }}
          >
            <span className="text-[11px] text-amber-300 leading-none mb-1.5" aria-hidden="true">☀</span>
            <input
              type="range"
              min={-3.0}
              max={3.0}
              step={0.1}
              value={exposure}
              onChange={(e) => {
                onUpdateExposure(parseFloat(e.target.value));
              }}
              aria-label="Brightness Exposure Slider"
              className="w-1.5 h-24 bg-white/25 rounded-lg appearance-none cursor-pointer accent-amber-400 [writing-mode:vertical-lr] [direction:rtl]"
            />
          </div>
        </div>
      )}

      {/* Timer Countdown Overlay (3s / 10s) */}
      {countdownSeconds !== null && countdownSeconds > 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 pointer-events-none">
          <div className="text-7xl font-bold font-mono tabular-nums text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
            {countdownSeconds}
          </div>
        </div>
      )}

      {/* Friendly Permission / Device Busy Recovery Card */}
      {cameraErrorKind && !isSimulated && (
        <div className="permission-recovery-card absolute inset-0 z-40 bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-950 border border-white/12 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              {cameraErrorKind === 'device_busy' ? (
                <ShieldAlert className="w-7 h-7" />
              ) : (
                <Camera className="w-7 h-7" />
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white">
                {cameraErrorKind === 'device_busy' ? 'Camera In Use' : 'Camera Access Needed'}
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {cameraErrorMessage ||
                  'Enable Camera and Microphone access in your device settings to capture dual-aspect photos and video.'}
              </p>
            </div>
            <div className="pt-1 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onRetryCamera}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Enable Camera</span>
              </button>
              <button
                type="button"
                onClick={onEnableDemoFallback}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-white/12 text-white/85 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Grid3X3 className="w-4 h-4 text-neutral-400" />
                <span>Continue with Demo Scene</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Capture White Screen Flash */}
      {isFlashing && (
        <div className="absolute inset-0 bg-white/90 z-50 pointer-events-none transition-opacity duration-150" />
      )}
    </div>
  );
});
